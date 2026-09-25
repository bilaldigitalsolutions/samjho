#!/usr/bin/env node
// =============================================================================
// PIB Press Release Fetcher — CLI Script
// =============================================================================
// Fetches press releases from PIB (pib.gov.in), deduplicates against
// existing content_items in Supabase, and inserts new releases.
//
// Usage:
//   node scripts/pib-fetcher.js              (fetch default 20 releases)
//   node scripts/pib-fetcher.js --limit=5    (fetch 5 releases)
//
// Requires: SUPABASE_SERVICE_ROLE_KEY environment variable
// =============================================================================

"use strict";

var https = require("https");
var pibFetcher = require("../admin/sources/pib-fetcher.js");
var dbContent;

try {
  dbContent = require("../build/db-content.js");
} catch (e) {
  console.error("[PIB Fetch] FATAL: Could not load db-content.js:", e.message);
  console.error("[PIB Fetch] Set SUPABASE_SERVICE_ROLE_KEY environment variable.");
  process.exit(1);
}

// Parse --limit=N from command line args
var LIMIT = 20;
process.argv.forEach(function (arg) {
  var m = arg.match(/^--limit=(\d+)$/);
  if (m) LIMIT = parseInt(m[1], 10);
});

// Node.js https.get wrapper that follows redirects (max 5)
function httpsGet(url, _depth) {
  _depth = _depth || 0;
  if (_depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise(function (resolve, reject) {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, function (res) {
        if (res.statusCode === 301 || res.statusCode === 302) {
          var loc = res.headers.location;
          var next = loc.indexOf("http") === 0 ? loc : "https://pib.gov.in" + loc;
          httpsGet(next, _depth + 1).then(resolve, reject);
          return;
        }
        var data = "";
        res.on("data", function (chunk) {
          data += chunk;
        });
        res.on("end", function () {
          resolve(data);
        });
      })
      .on("error", reject);
  });
}

async function main() {
  console.log("[PIB Fetch] Starting PIB press release fetch...");
  console.log("[PIB Fetch] Limit: " + LIMIT + " releases");
  console.log("");

  // 1. Fetch releases from PIB
  console.log("[PIB Fetch] Fetching PIB listing page...");
  var result = await pibFetcher.fetchPibReleases(httpsGet, { limit: LIMIT });

  console.log("[PIB Fetch] Fetched: " + result.results.length + " release(s)");
  console.log("[PIB Fetch] Failures: " + result.failures.length);

  if (result.failures.length > 0) {
    result.failures.forEach(function (f) {
      console.log("  [!] " + f.code + ": " + f.message + " (" + (f.url || "") + ")");
    });
  }

  if (result.results.length === 0) {
    console.log("[PIB Fetch] No releases to insert. Done.");
    return;
  }

  // 2. Get existing release_ids from Supabase to dedup
  console.log("");
  console.log("[PIB Fetch] Checking existing releases in Supabase...");
  var existing;
  try {
    existing = await dbContent.select(
      "select=release_id&release_id=not.is.null"
    );
  } catch (e) {
    console.error("[PIB Fetch] WARNING: Could not query existing releases:", e.message);
    existing = [];
  }

  var existingIds = {};
  if (Array.isArray(existing)) {
    existing.forEach(function (r) {
      if (r.release_id) existingIds[r.release_id] = true;
    });
  }
  console.log("[PIB Fetch] Existing in DB: " + Object.keys(existingIds).length + " release(s)");

  // 3. Insert new releases
  console.log("");
  console.log("[PIB Fetch] Inserting new releases...");
  var inserted = 0;
  var skipped = 0;
  var errors = 0;

  for (var i = 0; i < result.results.length; i++) {
    var r = result.results[i];
    var releaseId = r.release_id || "";

    if (releaseId && existingIds[releaseId]) {
      skipped++;
      console.log("  [=] Skipped (dup): " + (r.title || "").substring(0, 60) + " [PRID:" + releaseId + "]");
      continue;
    }

    try {
      await dbContent.insert({
        release_id: releaseId,
        release_url: r.release_url || r.source_url || "",
        source_name: r.source_name || "Press Information Bureau (PIB)",
        source_url: r.source_url || "https://pib.gov.in/",
        title: r.title || "",
        ministry: r.ministry || "",
        raw_content: r.raw_content || "",
        raw_html: r.raw_html || "",
        source_published_date: r.source_published_date || "",
        published_time: r.published_time || "",
        primary_category: r.primary_category || "needs_manual_categorization",
        categorization_status: r.categorization_status || "uncategorized",
        content_type: "Press Release",
        fetch_status: "success",
        refinement_status: "pending",
        status: "draft",
        verification_status: "not_verified",
        review_status: "pending_review",
        approval_status: "not_approved",
        admin_notes: r.admin_notes || "Fetched from PIB via CLI.",
      });
      inserted++;
      console.log("  [+] Inserted: " + (r.title || "").substring(0, 60) + " [PRID:" + releaseId + "] [" + (r.primary_category || "?") + "]");
    } catch (e) {
      errors++;
      console.error("  [x] Error inserting " + releaseId + ": " + (e.message || e));
    }
  }

  // 4. Summary
  console.log("");
  console.log("========================================");
  console.log("PIB FETCH SUMMARY");
  console.log("========================================");
  console.log("Fetched from PIB:  " + result.results.length);
  console.log("Inserted to DB:    " + inserted);
  console.log("Skipped (dup):     " + skipped);
  console.log("Errors:            " + errors);
  console.log("========================================");

  if (errors > 0) process.exit(1);
}

main().catch(function (err) {
  console.error("[PIB Fetch] FATAL:", err.message || err);
  process.exit(1);
});
