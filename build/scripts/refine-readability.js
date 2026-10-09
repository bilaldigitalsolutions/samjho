#!/usr/bin/env node
// =============================================================================
// REFINE READABILITY — re-refine articles for readability + structure.
// =============================================================================
// Applies build/scripts/readability-lib.js to every article:
//   * splits sentences longer than 15 words at real clause boundaries,
//   * splits paragraphs longer than ~3-4 lines (55 words),
//   * swaps complex words for simple ones (utilize -> use),
//   * adds 2-3 authoritative outbound links (ministry portal / PIB release),
//   * adds the REAL source date where the record has one.
//
// Meaning is never changed: no fact, number or name is added or removed.
//
// Writes to BOTH stores so the admin workflow and the live site match:
//   1. Supabase  content_items.refined_guide (JSONB)
//   2. build/data/published-guides.json      (what build.js renders)
//
// Usage:
//   node build/scripts/refine-readability.js --limit=5     # test batch
//   node build/scripts/refine-readability.js --all         # every article
//   node build/scripts/refine-readability.js --slug=epfo-citizens-charter
//   node build/scripts/refine-readability.js --dry-run     # report only
//   node build/scripts/refine-readability.js --local-only  # skip Supabase
//   node build/scripts/refine-readability.js --supabase-all  # + drafts too
// Requires: SUPABASE_SERVICE_ROLE_KEY (env or .env) unless --local-only.
// =============================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./readability-lib");

const ROOT = path.resolve(__dirname, "../..");
const REPORT_PATH = path.join(ROOT, "build", "data", "readability-report.json");

const args = process.argv.slice(2);
function flag(name) { return args.indexOf("--" + name) !== -1; }
function value(name, fallback) {
  for (let i = 0; i < args.length; i++) {
    if (args[i].indexOf("--" + name + "=") === 0) return args[i].split("=").slice(1).join("=");
  }
  return fallback;
}
const LIMIT = parseInt(value("limit", "0"), 10) || 0;
const SLUG = value("slug", "");
const DRY_RUN = flag("dry-run");
const LOCAL_ONLY = flag("local-only");
const NO_LINKS = flag("no-links");
// Phase 2 also re-refines Supabase rows that have no local store copy (drafts).
const SUPABASE_ALL = flag("supabase-all");
// Rebuild officialReferences from scratch (used after link-logic changes).
const REFRESH_LINKS = flag("refresh-links");

// URL normalisation for matching. PIB releases carry the release id in the
// QUERY STRING (PressReleasePage.aspx?PRID=2313399), so the query must be
// kept — dropping it collapsed every PIB link onto one key. Only the anchor
// and a trailing slash are stripped; case is preserved (PRID is case-sensitive).
function normUrl(u) {
  return String(u || "").trim().replace(/#.*$/, "").replace(/\/+$/, "");
}

// Fetch Supabase rows once and index them by every known source URL.
async function loadSupabaseIndex() {
  if (LOCAL_ONLY) return { index: new Map(), rows: [], db: null };
  require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
  const db = require(path.join(ROOT, "build", "db-content"));
  const rows = await db.select("select=*&limit=300");
  const index = new Map();
  rows.forEach((r) => {
    [r.source_url, r.release_url].forEach((u) => {
      const k = normUrl(u);
      if (k && !index.has(k)) index.set(k, r);
    });
  });
  return { index, rows, db };
}

function matchRow(guide, index) {
  const ids = Array.isArray(guide.source_ids) ? guide.source_ids : [];
  const candidates = []
    .concat(ids.map((x) => (typeof x === "string" ? x : x && x.href)))
    .concat([guide.source_url]);
  for (let i = 0; i < candidates.length; i++) {
    const k = normUrl(candidates[i]);
    if (k && index.has(k)) return index.get(k);
  }
  return null;
}

// Real metadata from the source record — never invented. The row's source_url
// is only copied when it does not contradict the guide's own source_ids.
function enrichFromRow(guide, row) {
  if (!row) return guide;
  const g = Object.assign({}, guide);
  const ids = Array.isArray(g.source_ids) ? g.source_ids : [];
  const canonical = ids.find((x) => typeof x === "string" && /^https?:\/\//i.test(x));
  if (canonical) {
    g.source_url = canonical;
  } else if (!g.source_url && row.source_url) {
    g.source_url = row.source_url;
  }
  if (!g.source_name && row.source_name) g.source_name = row.source_name;
  if (!g.source_published_date && row.source_published_date) g.source_published_date = row.source_published_date;
  if (!g.ministry && row.ministry) g.ministry = row.ministry;
  return g;
}

// True when the fields this pass may rewrite differ between two guide objects.
function guideChanged(a, b) {
  function pick(g) {
    g = g || {};
    return [g.content || "", g.whyMatters || "", g.summary || "",
      g.faqs || g.faq || [], g.officialReferences || g.sources || [],
      g.important_dates || []];
  }
  return JSON.stringify(pick(a)) !== JSON.stringify(pick(b));
}

function logDiff(before, after) {
  const d = (k) => { const delta = after[k] - before[k]; return "(" + (delta >= 0 ? "+" : "") + delta + ")"; };
  return "R " + before.readability + ">" + after.readability + " " + d("readability") +
    " | S " + before.structure + ">" + after.structure + " " + d("structure") +
    " | O " + before.overall + ">" + after.overall + " " + d("overall");
}

async function main() {
  console.log("==============================================");
  console.log("READABILITY RE-REFINE PASS");
  console.log("==============================================");
  console.log("Mode    : " + (DRY_RUN ? "DRY RUN (no writes)" : "LIVE") +
    (LOCAL_ONLY ? " | local only" : " | Supabase + local"));
  console.log("");

  const publishedStore = require(path.join(ROOT, "build", "data", "published-store"));
  let guides = publishedStore.loadPublishedGuides();
  if (SLUG) guides = guides.filter((g) => (g.slug || "").indexOf(SLUG) !== -1);
  if (LIMIT > 0) guides = guides.slice(0, LIMIT);
  if (!guides.length) { console.log("No matching articles. Done."); return null; }

  const { index, db } = await loadSupabaseIndex();
  const results = [];
  const usedRows = new Set();
  const storeRowIds = new Set();
  let updatedLocal = 0;
  let updatedDb = 0;

  for (let i = 0; i < guides.length; i++) {
    const original = guides[i];
    const row = matchRow(original, index);
    if (row) storeRowIds.add(row.id);
    const enriched = enrichFromRow(original, row);
    const result = lib.enhanceGuide(enriched, { addLinks: !NO_LINKS, refreshLinks: REFRESH_LINKS });
    results.push({
      slug: original.slug,
      supabaseId: row ? row.id : null,
      before: result.before,
      after: result.after,
      linksAdded: result.linksAdded,
      changes: result.changes,
    });

    console.log("[" + (i + 1) + "/" + guides.length + "] " + original.slug);
    console.log("   " + logDiff(result.before, result.after));
    console.log("   links " + result.before.links.length + " -> " + result.after.links.length +
      " | data " + result.before.metrics.statsCount + " -> " + result.after.metrics.statsCount +
      " | " + (result.changes.length ? result.changes.length + " change(s)" : "no change needed"));

    if (DRY_RUN) continue;

    if (result.changes.length) {
      try {
        publishedStore.stageApprovedGuide(result.guide);
        updatedLocal++;
        console.log("   local   : staged to published-guides.json");
      } catch (e) {
        console.log("   local   : FAILED - " + e.message);
      }
    } else {
      console.log("   local   : already up to date");
    }

    if (row && db) {
      // Safety guard: never write the same Supabase row twice in one run,
      // and never write a row whose source URL does not match this article.
      const rowUrls = [normUrl(row.source_url), normUrl(row.release_url)];
      const guideUrls = (Array.isArray(original.source_ids) ? original.source_ids : [])
        .map((x) => (typeof x === "string" ? x : x && x.href)).map(normUrl);
      const urlMatches = guideUrls.some((u) => u && rowUrls.indexOf(u) !== -1);
      // Write when this pass changed the guide, or when the stored copy has
      // drifted from the (already refined) local copy.
      const needsWrite = result.changes.length > 0 ||
        guideChanged(row.refined_guide, result.guide);
      if (!urlMatches) {
        console.log("   supabase: SKIPPED - source URL does not match row " + row.id);
      } else if (usedRows.has(row.id)) {
        console.log("   supabase: SKIPPED - row " + row.id + " already written this run");
      } else if (!needsWrite) {
        console.log("   supabase: already up to date (" + row.id + ")");
      } else {
        usedRows.add(row.id);
        try {
          await db.update(row.id, { refined_guide: result.guide });
          updatedDb++;
          console.log("   supabase: refined_guide updated (" + row.id + ")");
        } catch (e) {
          console.log("   supabase: FAILED - " + e.message);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // PHASE 2 — every other Supabase content_items row that has a refined_guide
  // (drafts and rows without a local store copy), so the whole table is
  // re-refined, not only the published set.
  // ---------------------------------------------------------------------------
  if (SUPABASE_ALL && db) {
    console.log("\n----------------------------------------------");
    console.log("PHASE 2: remaining Supabase content_items rows");
    console.log("----------------------------------------------");
    const rows = await db.select("select=*&refined_guide=not.is.null&order=created_at.asc&limit=300");
    let extra = 0;
    for (let n = 0; n < rows.length; n++) {
      const row = rows[n];
      if (storeRowIds.has(row.id) || usedRows.has(row.id)) continue;
      const guide = row.refined_guide;
      if (!guide || (!guide.content && !guide.summary)) continue;
      if (DRY_RUN) { extra++; continue; }
      const enriched = enrichFromRow(guide, row);
      const result = lib.enhanceGuide(enriched, { addLinks: !NO_LINKS, refreshLinks: REFRESH_LINKS });
      if (!result.changes.length && !guideChanged(row.refined_guide, result.guide)) continue;
      usedRows.add(row.id);
      try {
        await db.update(row.id, { refined_guide: result.guide });
        extra++;
        results.push({
          slug: guide.slug || ("row-" + row.id.slice(0, 8)),
          supabaseId: row.id,
          before: result.before,
          after: result.after,
          linksAdded: result.linksAdded,
          changes: result.changes,
        });
        console.log("[" + (results.length) + "] " + (row.title || row.id).slice(0, 60) +
          "  " + logDiff(result.before, result.after));
      } catch (e) {
        console.log("   supabase: FAILED - " + e.message);
      }
    }
    console.log("Supabase rows re-refined in phase 2: " + extra);
  }

  const avg = (key, src) => Math.round(results.reduce((a, r) => a + r[src][key], 0) / results.length);
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    articlesProcessed: results.length,
    localUpdated: updatedLocal,
    supabaseUpdated: updatedDb,
    linksAdded: results.reduce((a, r) => a + r.linksAdded, 0),
    readabilityBefore: avg("readability", "before"),
    readabilityAfter: avg("readability", "after"),
    structureBefore: avg("structure", "before"),
    structureAfter: avg("structure", "after"),
    overallBefore: avg("overall", "before"),
    overallAfter: avg("overall", "after"),
    articles: results,
  };

  console.log("\n==============================================");
  console.log("SUMMARY");
  console.log("==============================================");
  console.log("Articles processed   : " + report.articlesProcessed);
  console.log("Local store updated  : " + report.localUpdated);
  console.log("Supabase updated     : " + report.supabaseUpdated);
  console.log("Outbound links added : " + report.linksAdded);
  console.log("Avg Readability      : " + report.readabilityBefore + " -> " + report.readabilityAfter);
  console.log("Avg Structure        : " + report.structureBefore + " -> " + report.structureAfter);
  console.log("Avg Overall          : " + report.overallBefore + " -> " + report.overallAfter);
  console.log("==============================================");

  if (!DRY_RUN) {
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log("Report written: build/data/readability-report.json");
  }
  return report;
}

module.exports = {
  main,
  normUrl,
  matchRow,
  enrichFromRow,
  guideChanged,
  loadSupabaseIndex,
  logDiff,
};

if (require.main === module) {
  main().catch((e) => { console.error("FATAL:", e && e.message ? e.message : e); process.exit(1); });
}

