#!/usr/bin/env node
// PIPELINE RUNNER — Full PIB Content Pipeline (Steps 2-5 + readability check)
// Reads draft PIB items from Supabase, runs Refine → Readability Check →
// Verify → Approve → Stage
// Usage: node build/scripts/run-pipeline.js [--dry-run] [--verbose] [--limit=N]
//            [--skip-readability] [--strict-readability]
//            [--skip-content] [--strict-content]
// Requires: SUPABASE_SERVICE_ROLE_KEY env var
//
// READABILITY CHECK (Step 2.5) uses build/scripts/readability-lib.js:
//   target Readability 60+ and Overall 70+ (see build/scripts/check-quality.js).
//   Default = report only. --strict-readability fails the run below target.
//
// THIN CONTENT CHECK (Step 2.6) uses build/scripts/expand-thin.js helpers:
//   target 300+ words and 5+ FAQs per article (structure + depth only, meaning
//   is never changed). Default = report only. --strict-content fails the run.
"use strict";
const https = require("https");
const path = require("path");
const dbContent = require("../db-content");
const readability = require("./readability-lib");
const SUPABASE_URL = "https://clxwcivvxyyodahexjao.supabase.co";
const EDGE_FUNCTION = SUPABASE_URL + "/functions/v1/refine-deepseek";
const ANON_KEY = "sb_publishable_Udyya4vm0W22IDL-EoS4mw_kuE6mVnu";
const args = process.argv.slice(2);
const DRY_RUN = args.indexOf("--dry-run") !== -1;
const VERBOSE = args.indexOf("--verbose") !== -1;
const SKIP_READABILITY = args.indexOf("--skip-readability") !== -1;
const STRICT_READABILITY = args.indexOf("--strict-readability") !== -1;
const SKIP_CONTENT = args.indexOf("--skip-content") !== -1;
const STRICT_CONTENT = args.indexOf("--strict-content") !== -1;
const TARGET_READABILITY = 60;
const TARGET_OVERALL = 70;
const TARGET_WORDS = 300;
const TARGET_FAQS = 5;
// Optional: process only the first N drafts (small verification runs).
const LIMIT = (function () {
  for (var i = 0; i < args.length; i++) {
    if (args[i].indexOf("--limit=") === 0) return parseInt(args[i].split("=")[1], 10) || 0;
  }
  return 0;
})();

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
      // Readability pass: short sentences, small paragraphs, simple words,
      // 2-3 authoritative outbound links, real source date. Meaning unchanged.
      let report = null;
      let guide = Object.assign({}, result.guide);
      // Attach the REAL source record so the outbound PIB/ministry link and the
      // source date are always available to the readability pass.
      const srcUrl = item.source_url || item.release_url || "";
      if (srcUrl && (!guide.source_ids || !guide.source_ids.length)) guide.source_ids = [srcUrl];
      if (srcUrl && !guide.source_url) guide.source_url = srcUrl;
      if (item.source_name && !guide.source_name) guide.source_name = item.source_name;
      if (item.source_published_date && !guide.source_published_date) guide.source_published_date = item.source_published_date;
      if (item.ministry && !guide.ministry) guide.ministry = item.ministry;
      if (!SKIP_READABILITY) {
        const enhanced = readability.enhanceGuide(guide, {});
        guide = enhanced.guide;
        report = enhanced;
        console.log("  \u2192 Readability " + enhanced.after.readability +
          "/100 | Structure " + enhanced.after.structure +
          "/100 | Overall " + enhanced.after.overall +
          "/100 | links " + enhanced.after.links.length +
          (enhanced.changes.length ? " | " + enhanced.changes.length + " fix(es)" : ""));
      } else {
        report = { guide: guide, changes: [], before: readability.analyzeGuide(guide), after: readability.analyzeGuide(guide), linksAdded: 0 };
      }
      const quality = report.after;
      if (quality.readability < TARGET_READABILITY || quality.overall < TARGET_OVERALL) {
        console.log("  \u26A0 Below target (Readability " + TARGET_READABILITY + "+, Overall " + TARGET_OVERALL + "+): " +
          quality.issues.slice(0, 3).join("; "));
      }
      return {
        ok: true, guide: guide, quality: quality, changes: report.changes,
        model: result.model || "deepseek-flash", label: label + " " + item.title.substring(0, 50),
      };
    } else {
      console.log("  \u2717 FAILED \u2014 " + (result.code || "UNKNOWN") + ": " + (result.message || ""));
      return { ok: false, code: result.code || "UNKNOWN", message: result.message || "", label: label + " " + item.title.substring(0, 50) };
    }
  } catch (err) {
    console.log("  \u2717 ERROR \u2014 " + err.message);
    return { ok: false, code: "EXCEPTION", message: err.message, label: label + " " + item.title.substring(0, 50) };
  }
}

// STEP 2.5 — READABILITY CHECK (structure + readability score per article).
// Target: Readability 60+, Overall 70+. Returns a summary for the pipeline log.
function readabilityCheck(refineResults) {
  var rows = refineResults.filter((r) => r && r.ok && r.guide);
  if (!rows.length) return { count: 0, readable: 0, good: 0, failures: [], avgRead: 0, avgStruct: 0, avgOverall: 0 };
  var failures = [];
  var readSum = 0, structSum = 0, overallSum = 0;
  console.log("-----" + "-------------------------------------------------------");
  rows.forEach(function (r) {
    var q = r.quality || readability.analyzeGuide(r.guide);
    readSum += q.readability; structSum += q.structure; overallSum += q.overall;
    var pass = q.readability >= TARGET_READABILITY && q.overall >= TARGET_OVERALL;
    if (!pass) failures.push({ label: r.label, quality: q });
    console.log(
      "  " + (pass ? "\u2713" : "\u26A0") +
      " R=" + String(q.readability).padStart(3) +
      " S=" + String(q.structure).padStart(3) +
      " O=" + String(q.overall).padStart(3) +
      " | sents " + q.metrics.avgSentenceWords + "w" +
      " | paras " + q.metrics.avgParagraphWords + "w" +
      " | links " + q.links.length +
      " | data " + q.metrics.statsCount +
      " | " + (r.label || "").slice(0, 50)
    );
  });
  var summary = {
    count: rows.length,
    readable: rows.filter((r) => (r.quality || {}).readability >= TARGET_READABILITY).length,
    good: rows.filter((r) => (r.quality || {}).overall >= TARGET_OVERALL).length,
    failures: failures,
    avgRead: Math.round(readSum / rows.length),
    avgStruct: Math.round(structSum / rows.length),
    avgOverall: Math.round(overallSum / rows.length),
  };
  console.log("-----" + "-------------------------------------------------------");
  console.log("Readability " + TARGET_READABILITY + "+ : " + summary.readable + "/" + summary.count +
    " | Overall " + TARGET_OVERALL + "+ : " + summary.good + "/" + summary.count +
    " | avg R " + summary.avgRead + " / S " + summary.avgStruct + " / O " + summary.avgOverall);
  return summary;
}

// ---------------------------------------------------------------------------
// Thin content helpers (Step 2.6) — same rules as build/scripts/expand-thin.js
// ---------------------------------------------------------------------------

// Reader-facing word count: article body + summary + FAQ answers.
function guideWordCount(guide) {
  var parts = [];
  if (guide && guide.content) parts.push(String(guide.content));
  if (guide && guide.summary) parts.push(String(guide.summary));
  var faqs = (guide && (guide.faqs || guide.faq)) || [];
  if (Array.isArray(faqs)) {
    faqs.forEach(function (f) { if (f) parts.push(String(f.a || f.answer || "")); });
  }
  return readability.plainText(parts.join(" ")).split(/\s+/).filter(Boolean).length;
}
function guideFaqCount(guide) {
  var faqs = (guide && (guide.faqs || guide.faq)) || [];
  return Array.isArray(faqs) ? faqs.length : 0;
}
// Content that talks about the source page instead of the topic (Issue 3).
function describesSourcePage(guide) {
  var t = String((guide && guide.content) || "") + " " + String((guide && guide.summary) || "") + " " +
    (guide && Array.isArray(guide.faqs) ? guide.faqs.map(function (f) {
      return String((f && f.q) || "") + " " + String((f && f.a) || "");
    }).join(" ") : "");
  // Mirrors SOURCE_PAGE_PATTERNS in build/scripts/expand-thin.js (Issue 3).
  return [
    /\bthis page\b/i,
    /\bthe page (is|was|does|acts|comes|shows|collects|says|means|carries|provides)\b/i,
    /\bpage (says|shows|collects|carries|means|acts|does)\b/i,
    /\bsource page\b/i,
    /\bshared text\b/i,
    /\bthe text (shared|received)\b/i,
    /\bsource text\b/i,
    /\btext we received\b/i,
    /\bpage says\b/i,
    /\bsource (does not|mentions|names|says|explains|contains|carries|for this)\b/i,
    /\bnot given in the source\b/i,
    /\bopen the page\b/i,
    /\bdo not read this page\b/i,
    /\bas per the source\b/i,
    /\bin the source text\b/i,
    /\bthe official page\b/i,
    /\bcheck the official page\b/i,
    /\blisted on the \w+ website\b/i,
    /\breleased the original information used/i,
  ].some(function (re) { return re.test(t); });
}

// STEP 2.6 — THIN CONTENT CHECK: depth (word count), FAQ count, topic focus.
// Target: 300+ words, 5+ FAQs, no "about the source page" copy.
function thinContentCheck(refineResults) {
  var rows = refineResults.filter((r) => r && r.ok && r.guide);
  if (!rows.length) {
    return { count: 0, passWords: 0, passFaqs: 0, passAll: 0, thinWords: [], lowFaqs: [], offTopic: [], avgWords: 0, avgFaqs: 0 };
  }
  var thinWords = [], lowFaqs = [], offTopic = [];
  var wordSum = 0, faqSum = 0;
  console.log("-----" + "-------------------------------------------------------");
  rows.forEach(function (r) {
    var w = guideWordCount(r.guide);
    var f = guideFaqCount(r.guide);
    var sp = describesSourcePage(r.guide);
    wordSum += w; faqSum += f;
    var ok = w >= TARGET_WORDS && f >= TARGET_FAQS && !sp;
    if (w < TARGET_WORDS) thinWords.push({ label: r.label, words: w });
    if (f < TARGET_FAQS) lowFaqs.push({ label: r.label, faqs: f });
    if (sp) offTopic.push({ label: r.label });
    console.log(
      "  " + (ok ? "\u2713" : "\u26A0") +
      " words " + String(w).padStart(4) + "/" + TARGET_WORDS +
      " | faqs " + String(f).padStart(2) + "/" + TARGET_FAQS +
      (sp ? " | OFF-TOPIC (talks about the source page)" : "") +
      " | " + (r.label || "").slice(0, 50)
    );
  });
  var summary = {
    count: rows.length,
    passWords: rows.length - thinWords.length,
    passFaqs: rows.length - lowFaqs.length,
    passAll: rows.filter(function (r) {
      return guideWordCount(r.guide) >= TARGET_WORDS && guideFaqCount(r.guide) >= TARGET_FAQS && !describesSourcePage(r.guide);
    }).length,
    thinWords: thinWords,
    lowFaqs: lowFaqs,
    offTopic: offTopic,
    avgWords: Math.round(wordSum / rows.length),
    avgFaqs: Math.round((faqSum / rows.length) * 10) / 10,
  };
  console.log("-----" + "-------------------------------------------------------");
  console.log("Words " + TARGET_WORDS + "+ : " + summary.passWords + "/" + summary.count +
    " | FAQs " + TARGET_FAQS + "+ : " + summary.passFaqs + "/" + summary.count +
    " | topic-focused: " + (summary.count - summary.offTopic.length) + "/" + summary.count +
    " | avg " + summary.avgWords + "w / " + summary.avgFaqs + " faqs");
  return summary;
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
    items = await dbContent.select("select=*&status=eq.draft&order=created_at.asc" +
      (LIMIT > 0 ? "&limit=" + LIMIT : ""));
  } catch (e) {
    console.error("FATAL: Cannot read Supabase:", e.message);
    process.exit(1);
  }
  console.log("Found " + items.length + " draft item(s)." + (LIMIT > 0 ? " (--limit=" + LIMIT + ")" : "") + "\n");
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

  // STEP 2.5: READABILITY CHECK
  var readabilitySummary = null;
  if (!SKIP_READABILITY) {
    console.log("========================================");
    console.log("STEP 2.5: READABILITY CHECK");
    console.log("========================================");
    console.log("Target: Readability " + TARGET_READABILITY + "+ | Overall " + TARGET_OVERALL + "+");
    readabilitySummary = readabilityCheck(refineResults);
    if (STRICT_READABILITY && readabilitySummary.failures.length) {
      console.error("\nFATAL: " + readabilitySummary.failures.length +
        " article(s) below the readability target (--strict-readability).");
      process.exit(1);
    }
    if (readabilitySummary.failures.length) {
      console.log("NOTE: " + readabilitySummary.failures.length +
        " article(s) below target (reported only; run with --strict-readability to fail).\n");
    } else {
      console.log("");
    }
  }

  // STEP 2.6: THIN CONTENT CHECK
  var contentSummary = null;
  if (!SKIP_CONTENT) {
    console.log("========================================");
    console.log("STEP 2.6: THIN CONTENT CHECK");
    console.log("========================================");
    console.log("Target: " + TARGET_WORDS + "+ words | " + TARGET_FAQS + "+ FAQs | written about the topic");
    contentSummary = thinContentCheck(refineResults);
    var contentFailures = contentSummary.thinWords.length + contentSummary.offTopic.length +
      contentSummary.lowFaqs.length;
    if (STRICT_CONTENT && contentFailures) {
      console.error("\nFATAL: " + contentFailures + " content issue(s) found (--strict-content).");
      process.exit(1);
    }
    if (contentFailures) {
      console.log("NOTE: " + contentFailures + " content gap(s) reported. Run " +
        "node build/scripts/expand-thin.js to expand them (--strict-content to fail).\n");
    } else {
      console.log("");
    }
  }

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
  if (readabilitySummary && readabilitySummary.count) {
    console.log("Readability:     " + readabilitySummary.avgRead + "/100 (avg, target " + TARGET_READABILITY + "+) — " +
      readabilitySummary.readable + "/" + readabilitySummary.count + " pass");
    console.log("Structure:       " + readabilitySummary.avgStruct + "/100 (avg)");
    console.log("Overall:         " + readabilitySummary.avgOverall + "/100 (avg, target " + TARGET_OVERALL + "+) — " +
      readabilitySummary.good + "/" + readabilitySummary.count + " pass");
  }
  if (contentSummary && contentSummary.count) {
    console.log("Word depth:      " + contentSummary.avgWords + " (avg, target " + TARGET_WORDS + "+) — " +
      contentSummary.passWords + "/" + contentSummary.count + " pass");
    console.log("FAQs:            " + contentSummary.avgFaqs + " (avg, target " + TARGET_FAQS + "+) — " +
      contentSummary.passFaqs + "/" + contentSummary.count + " pass");
    console.log("Topic focus:     " + (contentSummary.count - contentSummary.offTopic.length) + "/" +
      contentSummary.count + " written about the topic");
  }
  console.log("========================================\n");
  console.log("Next step: node build/scripts/deploy-published.js");
}

if (require.main === module) {
  main().catch(function (e) { console.error("FATAL:", e); process.exit(1); });
}
module.exports = {
  main, refineItem, verifyItem, approveItem, stageItem,
  readabilityCheck, thinContentCheck, guideWordCount, guideFaqCount, describesSourcePage,
};

