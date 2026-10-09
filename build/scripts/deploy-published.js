#!/usr/bin/env node
// DEPLOY PUBLISHED — Server-side script to build and deploy published guides.
// Reads items with status="pending_publish" from Supabase,
// stages to published-guides.json, fetches a Pexels hero image, builds,
// deploys, marks as "published".
//
// Usage:
//   node build/scripts/deploy-published.js                # full pipeline
//   node build/scripts/deploy-published.js --images-only  # fetch missing hero images only
//   node build/scripts/deploy-published.js --images-only --slug=pm-modi-tribute-ashok-singhal
//   node build/scripts/deploy-published.js --images-only --limit=1
//   node build/scripts/deploy-published.js --images-only --build --deploy
//   node build/scripts/deploy-published.js --images-only --force   # refetch existing too
//
// Requires: SUPABASE_SERVICE_ROLE_KEY + PEXELS_API_KEY (from .env or env).

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
// Load .env so BOTH keys are available when this script is run directly.
// (Previously dotenv was never called here, so PEXELS_API_KEY was empty and
//  the image step silently reported "PEXELS_API_KEY not set".)
try {
  require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });
} catch (e) { /* dotenv optional */ }

const publishedStore = require("../data/published-store");
const guideSchema = require("../../admin/schemas/guide");
const pexels = require("../../admin/ai/pexels-fetcher");
let dbContent;
try { dbContent = require("../db-content"); } catch (e) { console.error("FATAL: Could not load db-content.js:", e.message); process.exit(1); }

const ROOT = path.resolve(__dirname, "../..");
const STORE_PATH = path.join(__dirname, "..", "data", "published-guides.json");

const ARGS = process.argv.slice(2);
function argFlag(name) { return ARGS.indexOf("--" + name) !== -1; }
function argValue(name) {
  for (var i = 0; i < ARGS.length; i++) {
    if (ARGS[i].indexOf("--" + name + "=") === 0) return ARGS[i].slice(name.length + 3);
  }
  return "";
}
const IMAGES_ONLY = argFlag("images-only");
const FORCE_IMAGES = argFlag("force");
const RUN_BUILD = argFlag("build");
const RUN_DEPLOY = argFlag("deploy");
const SLUG_FILTER = argValue("slug");
const LIMIT = parseInt(argValue("limit"), 10) || 0;

function validateTripleGate(item) {
  var errors = [];
  if (item.status !== "pending_publish" && item.status !== "approved") errors.push("status must be 'pending_publish' or 'approved'");
  if (item.verification_status !== "verified") errors.push("verification_status must be 'verified'");
  if (item.approval_status !== "approved") errors.push("approval_status must be 'approved'");
  if (!item.refined_guide || typeof item.refined_guide !== "object") errors.push("refined_guide is missing");
  return { ok: errors.length === 0, errors };
}

function validateGuide(guide) {
  var errors = [];
  if (!guide || typeof guide !== "object") return { ok: false, errors: ["Guide missing"] };
  var sv = guideSchema.validateGuide(guide);
  if (!sv.valid) errors.push.apply(errors, sv.errors);
  if (!guide.source_ids || !guide.source_ids.length) errors.push("source_ids required");
  return { ok: errors.length === 0, errors };
}

function prepareGuide(item) {
  var guide = Object.assign({}, item.refined_guide);
  guide.status = "approved";
  if (item.source_url && (!guide.source_ids || !guide.source_ids.length)) guide.source_ids = [item.source_url];
  if (item.source_published_date && !guide.source_published_date) guide.source_published_date = item.source_published_date;
  if (!guide.last_updated) guide.last_updated = item.source_published_date || new Date().toISOString().slice(0, 10);
  if (item.content_type) guide.content_type = item.content_type;
  return guide;
}

async function processItem(item) {
  var result = { id: item.id, slug: null, action: null, errors: [] };
  if (item.status === "published") { result.action = "already_published"; return result; }
  var gate = validateTripleGate(item);
  if (!gate.ok) { result.errors = gate.errors; result.action = "rejected_gate"; return result; }
  var guide = prepareGuide(item);
  result.slug = guide.slug;
  var gv = validateGuide(guide);
  if (!gv.ok) { result.errors = gv.errors; result.action = "rejected_guide"; return result; }
  try { publishedStore.stageApprovedGuide(guide); result.action = "staged"; }
  catch (e) { result.errors.push(e.message); result.action = "stage_failed"; return result; }
  return result;
}

// ---------------------------------------------------------------------------
// Hero image helpers
// ---------------------------------------------------------------------------

// Supabase content_items rows have no `slug` column — the slug lives inside
// refined_guide. The old code read guide.slug straight off the row, which was
// always undefined (filename fell back to "article.jpg" and the store lookup
// never matched). Normalise both shapes here.
function guideIdentity(x) {
  x = x || {};
  var g = x.refined_guide && typeof x.refined_guide === "object" ? x.refined_guide : x;
  return {
    title: g.title || x.title || "",
    slug: g.slug || x.slug || "",
    category: g.category || x.primary_category || "",
    id: x.id || null,
  };
}

function readStoreFile() {
  if (!fs.existsSync(STORE_PATH)) return [];
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

// slug -> content_items.id map (for persisting hero_image to Supabase).
async function loadSlugRowMap() {
  if (!dbContent) return {};
  try {
    var rows = await dbContent.select("select=id,refined_guide&refined_guide=not.is.null&limit=400");
    var map = {};
    (rows || []).forEach(function (r) {
      var s = r.refined_guide && r.refined_guide.slug;
      if (s && !map[s]) map[s] = r.id;
    });
    return map;
  } catch (e) {
    console.log("  WARNING: cannot read Supabase for hero_image sync: " + e.message);
    return {};
  }
}

// Fetch (or reuse) one hero image. Returns an image patch or {ok:false}.
async function fetchHeroImage(guide) {
  var st = typeof pexels.status === "function" ? pexels.status() : { keySet: !!process.env.PEXELS_API_KEY };
  if (!st.keySet) return { ok: false, reason: "PEXELS_API_KEY not set" };
  var id = guideIdentity(guide);
  if (!id.slug) return { ok: false, reason: "guide has no slug" };

  if (guide.hero_image && !FORCE_IMAGES) {
    var existing = path.join(pexels.IMAGES_DIR, path.basename(guide.hero_image));
    if (fs.existsSync(existing)) return { ok: true, imageUrl: guide.hero_image, cached: true };
  }
  var r = await pexels.searchAndDownload(id.title, id.slug, id.category);
  if (!r.ok) return { ok: false, reason: r.message || "no image found" };
  return {
    ok: true, imageUrl: r.imageUrl, photographer: r.photographer,
    photographerUrl: r.photographerUrl, alt: r.alt, cached: !!r.cached,
  };
}

// Fetch hero images for a set of guides and persist to
// published-guides.json + Supabase content_items.refined_guide.hero_image.
async function fetchHeroImages(guides, opts) {
  opts = opts || {};
  var rows = readStoreFile();
  var rowMap = await loadSlugRowMap();
  var stats = { total: guides.length, fetched: 0, cached: 0, failed: 0, supabase: 0, skipped: 0 };
  var patches = {};

  for (var i = 0; i < guides.length; i++) {
    var g = guides[i];
    var id = guideIdentity(g);
    if (!id.slug) { stats.skipped++; console.log("  (no slug): SKIP"); continue; }
    var patch;
    try { patch = await fetchHeroImage(g); }
    catch (e) { patch = { ok: false, reason: e.message }; }

    if (!patch.ok) {
      stats.failed++;
      console.log("  " + id.slug + ": FAILED — " + patch.reason);
      continue;
    }
    var imageFields = {
      hero_image: patch.imageUrl,
      image_photographer: patch.photographer || "",
      image_photographer_url: patch.photographerUrl || "",
    };
    if (!patch.alt && id.title) imageFields.image_alt = id.title;
    patches[id.slug] = imageFields;
    if (patch.cached) stats.cached++; else stats.fetched++;
    console.log("  " + id.slug + ": " + (patch.cached ? "already set" : "image fetched") +
      " -> " + patch.imageUrl + (patch.photographer ? " (" + patch.photographer + ")" : ""));
  }

  // 1. Persist to published-guides.json (one write for the whole batch)
  var touched = 0;
  rows.forEach(function (row) {
    var f = patches[row.slug];
    if (!f) return;
    Object.keys(f).forEach(function (k) { row[k] = f[k]; });
    touched++;
  });
  if (touched) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(rows, null, 2) + "\n", "utf8");
    console.log("  published-guides.json: " + touched + " guide(s) updated");
  }

  // 2. Persist to Supabase content_items.refined_guide.hero_image
  for (var slug in patches) {
    var rowId = rowMap[slug];
    if (!rowId) continue;
    try {
      var rec = await dbContent.selectOne("select=id,refined_guide&id=eq." + rowId + "&limit=1");
      if (!rec || !rec.refined_guide) continue;
      var nextGuide = Object.assign({}, rec.refined_guide, patches[slug]);
      await dbContent.update(rowId, { refined_guide: nextGuide });
      stats.supabase++;
    } catch (e) {
      console.log("  WARNING: Supabase hero_image not saved for " + slug + ": " + e.message);
    }
  }
  if (stats.supabase) console.log("  Supabase refined_guide: " + stats.supabase + " row(s) updated");
  return stats;
}

// Fetch hero images only — stages nothing, publishes nothing.
async function imagesOnly() {
  console.log("=== FETCH HERO IMAGES ONLY ===\n");
  var st = pexels.status();
  console.log("PEXELS_API_KEY : " + (st.keySet ? "SET (length " + st.keyLength + ")" : "NOT SET"));
  console.log("Stored in      : " + st.imagesDir);
  console.log("Public URL     : " + pexels.PUBLIC_DIR + "/<slug>.jpg");
  console.log("Build copies to: dist/images/articles/ (dist is wiped every build)");
  if (!st.keySet) {
    console.error("\nACTION REQUIRED: add PEXELS_API_KEY to .env (get a free key at https://www.pexels.com/api/).");
    process.exit(1);
  }

  var all = readStoreFile().filter(function (g) { return g && g.slug && g.status === "approved"; });
  if (SLUG_FILTER) all = all.filter(function (g) { return String(g.slug).indexOf(SLUG_FILTER) !== -1; });
  if (!FORCE_IMAGES) all = all.filter(function (g) { return !g.hero_image; });
  if (LIMIT > 0) all = all.slice(0, LIMIT);
  console.log("\nGuides to process: " + all.length +
    (SLUG_FILTER ? " (slug filter: " + SLUG_FILTER + ")" : "") +
    (LIMIT ? " (limit " + LIMIT + ")" : ""));
  if (!all.length) {
    console.log("Nothing to do — every matching guide already has a hero image. Use --force to refetch.");
    return { total: 0, fetched: 0, cached: 0, failed: 0, supabase: 0, skipped: 0 };
  }
  console.log("");

  var stats = await fetchHeroImages(all, {});
  var stored = 0;
  try {
    stored = fs.readdirSync(pexels.IMAGES_DIR).filter(function (f) {
      return /\.(jpe?g|png|webp|avif)$/i.test(f);
    }).length;
  } catch (e) { /* dir may not exist yet */ }

  console.log("\n--- IMAGE SUMMARY ---");
  console.log("Guides processed : " + stats.total);
  console.log("Images fetched   : " + stats.fetched + "  (already had one: " + stats.cached + ")");
  console.log("Failed           : " + stats.failed);
  console.log("Supabase rows    : " + stats.supabase + " (refined_guide.hero_image)");
  console.log("Files on disk    : " + stored + " in build/assets/images/articles");

  if (RUN_BUILD) {
    console.log("\nRunning build...");
    try { execSync("node build/build.js", { cwd: ROOT, encoding: "utf8", timeout: 180000 }); console.log("Build complete."); }
    catch (e) { console.error("BUILD FAILED:", e.message); process.exit(1); }
    var distCount = 0;
    try {
      distCount = fs.readdirSync(path.join(ROOT, "dist", "images", "articles"))
        .filter(function (f) { return /\.(jpe?g|png|webp|avif)$/i.test(f); }).length;
    } catch (e) { /* missing = build did not copy */ }
    console.log("dist/images/articles: " + distCount + " file(s)");
    if (stored > 0 && distCount === 0) {
      console.error("BUILD ISSUE: source images exist but none were copied to dist/images/articles.");
      process.exit(1);
    }
  }
  if (RUN_DEPLOY) {
    console.log("\nDeploying to Firebase Hosting...");
    try { execSync("firebase deploy --only hosting", { cwd: ROOT, encoding: "utf8", timeout: 180000 }); console.log("Deploy complete."); }
    catch (e) { console.error("DEPLOY FAILED:", e.message); process.exit(1); }
  }
  return stats;
}

async function main() {
  if (IMAGES_ONLY) return imagesOnly();
  console.log("=== DEPLOY PUBLISHED ===\n");
  // 1. Read pending_publish items
  var items;
  try { items = await dbContent.select("select=*&status=eq.pending_publish"); }
  catch (e) { console.error("FATAL: Cannot read Supabase:", e.message); process.exit(1); }
  var eligible = items.filter(function (it) {
    return it.verification_status === "verified" && it.approval_status === "approved" && it.refined_guide;
  });
  console.log("Found " + eligible.length + " item(s) pending publish.\n");
  if (eligible.length === 0) {
    console.log("Nothing new to stage.");
    if (process.argv.indexOf("--build") !== -1) {
      console.log("--build flag: rebuilding anyway to refresh homepage/sitemap...");
      try { execSync("node build/build.js", { cwd: ROOT, encoding: "utf8", timeout: 180000 }); console.log("Build complete."); }
      catch (e) { console.error("BUILD FAILED:", e.message); process.exit(1); }
    }
    return;
  }

  // 2. Stage each item
  var staged = [];
  for (var i = 0; i < eligible.length; i++) {
    var item = eligible[i];
    console.log("Staging: " + (item.title || item.id));
    var r = await processItem(item);
    if (r.action === "staged") { staged.push(item); console.log("  OK: " + r.slug); }
    else if (r.action === "already_published") { console.log("  SKIP: already published"); }
    else { console.log("  FAIL: " + r.errors.join("; ")); }
  }
  console.log("\nStaged " + staged.length + " guide(s) to published-guides.json.\n");

  // 2.5 Fetch hero images for the guides staged in this run
  if (staged.length === 0) { console.log("Nothing staged. Done."); return; }
  console.log("Fetching hero images for staged guides...");
  await fetchHeroImages(staged, {});
  console.log("");

  // 3. Run build
  console.log("Running build...");
  try { execSync("node build/build.js", { cwd: ROOT, encoding: "utf8", timeout: 120000 }); console.log("Build complete.\n"); }
  catch (e) { console.error("BUILD FAILED:", e.message); process.exit(1); }

  // 4. Deploy Firebase Hosting
  console.log("Deploying to Firebase Hosting...");
  try { execSync("firebase deploy --only hosting", { cwd: ROOT, encoding: "utf8", timeout: 120000 }); console.log("Deploy complete.\n"); }
  catch (e) { console.error("DEPLOY FAILED:", e.message); console.error("Guides are staged in published-guides.json. Re-run after fixing deploy issue."); process.exit(1); }

  // 5. Mark as published in Supabase
  console.log("Updating Supabase status...");
  for (var j = 0; j < staged.length; j++) {
    try { await dbContent.update(staged[j].id, { status: "published", updated_at: new Date().toISOString() }); }
    catch (e) { console.error("  WARNING: Could not update " + staged[j].id + ": " + e.message); }
  }
  console.log("\n=== DONE === " + staged.length + " guide(s) published to live site.");
}

if (require.main === module) {
  main().catch(function (e) { console.error("FATAL:", e); process.exit(1); });
}

module.exports = { main, imagesOnly, processItem, fetchHeroImage, fetchHeroImages, guideIdentity, validateTripleGate, validateGuide, prepareGuide };
