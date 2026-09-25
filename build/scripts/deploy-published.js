#!/usr/bin/env node
// DEPLOY PUBLISHED — Server-side script to build and deploy published guides.
// Reads items with status="pending_publish" from Supabase,
// stages to published-guides.json, builds, deploys, marks as "published".
//
// Usage: node build/scripts/deploy-published.js
// Requires: SUPABASE_SERVICE_ROLE_KEY env var + Firebase CLI authenticated.

const { execSync } = require("child_process");
const path = require("path");
const publishedStore = require("../data/published-store");
const guideSchema = require("../../admin/schemas/guide");
const pexels = require("../../admin/ai/pexels-fetcher");
let dbContent;
try { dbContent = require("../db-content"); } catch (e) { console.error("FATAL: Could not load db-content.js:", e.message); process.exit(1); }

const ROOT = path.resolve(__dirname, "../..");

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

async function main() {
  console.log("=== DEPLOY PUBLISHED ===\n");
  // 1. Read pending_publish items
  var items;
  try { items = await dbContent.select("select=*&status=eq.pending_publish"); }
  catch (e) { console.error("FATAL: Cannot read Supabase:", e.message); process.exit(1); }
  var eligible = items.filter(function (it) {
    return it.verification_status === "verified" && it.approval_status === "approved" && it.refined_guide;
  });
  console.log("Found " + eligible.length + " item(s) pending publish.\n");
  if (eligible.length === 0) { console.log("Nothing to publish. Done."); return; }

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

  // 2.5 Fetch images for staged guides
  console.log("Fetching images for staged guides...");
  for (var k = 0; k < staged.length; k++) {
    var guide = staged[k];
    if (guide.hero_image) { console.log("  " + guide.slug + ": image already set, skipping"); continue; }
    try {
      var imgResult = await pexels.searchAndDownload(guide.title || "", guide.slug, guide.category);
      if (imgResult.ok) {
        // Update the guide in published-guides.json with image
        var list = publishedStore.loadPublishedGuides ? require("../data/published-store").loadPublishedGuides() : [];
        var pg = require("fs").readFileSync(require("path").join(__dirname, "..", "data", "published-guides.json"), "utf8");
        var guides = JSON.parse(pg);
        for (var m = 0; m < guides.length; m++) {
          if (guides[m].slug === guide.slug) {
            guides[m].hero_image = imgResult.imageUrl;
            guides[m].image_photographer = imgResult.photographer;
            guides[m].image_photographer_url = imgResult.photographerUrl;
            break;
          }
        }
        require("fs").writeFileSync(require("path").join(__dirname, "..", "data", "published-guides.json"), JSON.stringify(guides, null, 2) + "\n");
        console.log("  " + guide.slug + ": image fetched (" + (imgResult.cached ? "cached" : "new") + ") by " + imgResult.photographer);
      } else {
        console.log("  " + guide.slug + ": no image found — " + imgResult.message);
      }
    } catch (imgErr) {
      console.log("  " + guide.slug + ": image error — " + imgErr.message);
    }
  }
  console.log("");

  if (staged.length === 0) { console.log("Nothing staged. Done."); return; }

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

module.exports = { main, processItem, validateTripleGate, validateGuide, prepareGuide };
