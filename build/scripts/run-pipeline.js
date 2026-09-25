#!/usr/bin/env node
// PIPELINE RUNNER — Full PIB Content Pipeline (Steps 2-5)
// Reads draft PIB items from Supabase, runs Refine → Verify → Approve → Stage
// Usage: node build/scripts/run-pipeline.js [--dry-run]
// Requires: SUPABASE_SERVICE_ROLE_KEY env var
"use strict";
const https = require("https");
const path = require("path");
const dbContent = require("../db-content");
const SUPABASE_URL = "https://clxwcivvxyyodahexjao.supabase.co";
const EDGE_FUNCTION = SUPABASE_URL + "/functions/v1/refine-deepseek";
const ANON_KEY = "sb_publishable_Udyya4vm0W22IDL-EoS4mw_kuE6mVnu";
const args = process.argv.slice(2);
const DRY_RUN = args.indexOf("--dry-run") !== -1;
const VERBOSE = args.indexOf("--verbose") !== -1;

function postEdgeFunction(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(EDGE_FUNCTION);
    const opts = {
      hostname: url.hostname, port: 443, path: url.pathname, method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + ANON_KEY, "Content-Length": Buffer.byteLength(data) },
    };
    const req = https.request(opts, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(b);
          if (res.statusCode >= 400) return reject(new Error("HTTP " + res.statusCode + ": " + b.substring(0, 500)));
          resolve(parsed);
        } catch (e) { reject(new Error("Invalid JSON: " + b.substring(0, 200))); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function refineItem(item, index, total) {
  const label = "[" + (index + 1) + "/" + total + "]";
  console.log("\n[Refine] " + label + " " + item.title.substring(0, 70));
  const rawInput = {
    title: item.title || "", raw_content: item.raw_content || "",
    source_name: item.source_name || "", source_url: item.source_url || "",
    source_published_date: item.source_published_date || "",
  };
  const categorization = {
    content_type: item.content_type || "Press Release",
    category: item.primary_category || "Government",
    sub_category: "", user_group: "",
    categorization_status: item.categorization_status || "categorized",
  };
  try {
    const result = await postEdgeFunction({ raw: rawInput, categorization });
    if (result.ok && result.guide) {
      console.log("  \u2713 Refinement OK \u2014 model: " + (result.model || "unknown"));
      return { ok: true, guide: result.guide, model: result.model || "deepseek-flash", label: label + " " + item.title.substring(0, 50) };
    } else {
      console.log("  \u2717 FAILED \u2014 " + (result.code || "UNKNOWN") + ": " + (result.message || ""));
      return { ok: false, code: result.code || "UNKNOWN", message: result.message || "", label: label + " " + item.title.substring(0, 50) };
    }
  } catch (err) {
    console.log("  \u2717 ERROR \u2014 " + err.message);
    return { ok: false, code: "EXCEPTION", message: err.message, label: label + " " + item.title.substring(0, 50) };
  }
}

async function verifyItem(item, index, total) {
  const label = "[" + (index + 1) + "/" + total + "]";
  var errors = [];
  var srcUrl = (item.source_url || "").toLowerCase();
  if (srcUrl.indexOf(".gov.in") === -1 && srcUrl.indexOf(".nic.in") === -1 && srcUrl.indexOf("pib.gov.in") === -1) {
    errors.push("Source URL not from .gov.in or .nic.in: " + item.source_url);
  }
  if (!item.raw_content || item.raw_content.trim().length === 0) errors.push("raw_content is empty");
  if (!item.title || item.title.trim().length === 0) errors.push("title is empty");
  if (errors.length > 0) {
    console.log("[Verify] " + label + " " + item.title.substring(0, 50) + " \u2014 FAIL: " + errors.join("; "));
    return { ok: false, errors };
  }
  if (!DRY_RUN) {
    await dbContent.update(item.id, {
      verification_status: "verified", status: "verified",
      verification_data: JSON.stringify({ checklist: { source_gov_in: true, content_not_empty: true, title_not_empty: true }, verified_at: new Date().toISOString(), verified_by: "pipeline-automation" }),
    });
  }
  console.log("[Verify] " + label + " " + item.title.substring(0, 50) + " \u2014 verified");
  return { ok: true };
}

async function approveItem(item, index, total) {
  const label = "[" + (index + 1) + "/" + total + "]";
  if (!DRY_RUN) {
    await dbContent.update(item.id, { review_status: "reviewed", approval_status: "approved", status: "approved" });
  }
  console.log("[Approve] " + label + " " + item.title.substring(0, 50) + " \u2014 approved");
  return { ok: true };
}

async function stageItem(item, index, total) {
  const label = "[" + (index + 1) + "/" + total + "]";
  if (!DRY_RUN) {
    await dbContent.update(item.id, { status: "pending_publish" });
  }
  console.log("[Stage] " + label + " " + item.title.substring(0, 50) + " \u2014 staged");
  return { ok: true };
}

async function main() {
  console.log("========================================");
  console.log("SAMJHO CONTENT PIPELINE RUNNER");
  console.log("========================================");
  console.log("Mode: " + (DRY_RUN ? "DRY RUN" : "LIVE"));
  console.log("Time: " + new Date().toISOString());
  console.log("");

  // Fetch all draft items
  console.log("--- Fetching draft items from Supabase ---");
  var items;
  try {
    items = await dbContent.select("select=*&status=eq.draft&order=created_at.asc");
  } catch (e) {
    console.error("FATAL: Cannot read Supabase:", e.message);
    process.exit(1);
  }
  console.log("Found " + items.length + " draft item(s).\n");
  if (items.length === 0) { console.log("No items to process. Done."); return; }

  // STEP 2: REFINE
  console.log("========================================");
  console.log("STEP 2: REFINE");
  console.log("========================================");
  var refineResults = [];
  for (var i = 0; i < items.length; i++) {
    var result = await refineItem(items[i], i, items.length);
    refineResults.push(result);
    if (result.ok && !DRY_RUN) {
      await dbContent.update(items[i].id, {
        refined_guide: result.guide, refined_content: result.guide.summary || "",
        refinement_status: "completed", refinement_model: result.model,
        refined_at: new Date().toISOString(), status: "draft",
      });
    }
  }
  var refinedOk = refineResults.filter((r) => r.ok).length;
  var refinedFail = refineResults.filter((r) => !r.ok).length;
  console.log("\nRefined: " + refinedOk + "/" + items.length + " | Failed: " + refinedFail + "/" + items.length);
  if (refinedFail > 0) {
    console.log("Failed items:");
    refineResults.filter((r) => !r.ok).forEach((r) => { console.log("  - " + r.label + " -- " + r.code + ": " + r.message); });
  }
  if (refinedOk === 0) { console.error("\nFATAL: No items refined. Aborting."); process.exit(1); }

  // Re-fetch refined items
  if (!DRY_RUN) {
    items = await dbContent.select("select=*&status=eq.draft&refinement_status=eq.completed&order=created_at.asc");
    console.log("\nRe-fetched " + items.length + " refined item(s).\n");
  }

  // STEP 3: VERIFY
  console.log("========================================");
  console.log("STEP 3: VERIFY");
  console.log("========================================");
  var verifyCount = 0;
  for (var j = 0; j < items.length; j++) {
    var vres = await verifyItem(items[j], j, items.length);
    if (vres.ok) verifyCount++;
  }
  console.log("\nVerified: " + verifyCount + "/" + items.length);
  if (!DRY_RUN) { items = await dbContent.select("select=*&status=eq.verified&order=created_at.asc"); }

  // STEP 4: APPROVE
  console.log("\n========================================");
  console.log("STEP 4: APPROVE");
  console.log("========================================");
  var approveCount = 0;
  for (var k = 0; k < items.length; k++) {
    await approveItem(items[k], k, items.length);
    approveCount++;
  }
  console.log("\nApproved: " + approveCount + "/" + items.length);
  if (!DRY_RUN) { items = await dbContent.select("select=*&status=eq.approved&order=created_at.asc"); }

  // STEP 5: STAGE
  console.log("\n========================================");
  console.log("STEP 5: STAGE FOR PUBLISH");
  console.log("========================================");
  var stageCount = 0;
  for (var l = 0; l < items.length; l++) {
    await stageItem(items[l], l, items.length);
    stageCount++;
  }
  console.log("\nStaged: " + stageCount + "/" + items.length);
  if (!DRY_RUN) {
    var staged = await dbContent.select("select=id&status=eq.pending_publish");
    console.log("Verification: " + staged.length + " item(s) with status='pending_publish' in Supabase.");
  }

  // Summary
  console.log("\n========================================");
  console.log("PIPELINE SUMMARY");
  console.log("========================================");
  console.log("Items processed: " + items.length);
  console.log("Refined:         " + refinedOk + "/" + items.length);
  console.log("Verified:        " + verifyCount + "/" + items.length);
  console.log("Approved:        " + approveCount + "/" + items.length);
  console.log("Staged:          " + stageCount + "/" + items.length);
  console.log("========================================\n");
  console.log("Next step: node build/scripts/deploy-published.js");
}

if (require.main === module) {
  main().catch(function (e) { console.error("FATAL:", e); process.exit(1); });
}
module.exports = { main, refineItem, verifyItem, approveItem, stageItem };

