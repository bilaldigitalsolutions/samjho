#!/usr/bin/env node
// =============================================================================
// CONTENT QUALITY CHECKER — readability + structure scores for articles.
// =============================================================================
// Scores every article on three axes (formula lives in readability-lib.js):
//   Readability /100 : sentence length, long-sentence share, Flesch Reading
//                      Ease, complex-word share.
//   Structure   /100 : paragraph size, headings, bullet/numbered lists,
//                      outbound authoritative links, numbers/dates, FAQs.
//   Overall     /100 : 0.6 * Readability + 0.4 * Structure.
//
// Usage:
//   node build/scripts/check-quality.js                 # all local guides
//   node build/scripts/check-quality.js --limit=5       # first 5 (test batch)
//   node build/scripts/check-quality.js --slug=epfo-citizens-charter
//   node build/scripts/check-quality.js --supabase      # refined_guide in DB
//   node build/scripts/check-quality.js --json          # machine readable
//   node build/scripts/check-quality.js --issues        # show top issues
//
// Targets: Readability 60+, Overall 70+.
// =============================================================================
"use strict";

const path = require("path");
const lib = require("./readability-lib");

const ROOT = path.resolve(__dirname, "../..");
const TARGET_READABILITY = 60;
const TARGET_OVERALL = 70;

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
const AS_JSON = flag("json");
const SHOW_ISSUES = flag("issues") || flag("verbose");
const USE_SUPABASE = flag("supabase");
const SHOW_ALL_ISSUES = flag("all-issues");

// ---------------------------------------------------------------------------
// Load article sets
// ---------------------------------------------------------------------------

function loadLocalGuides() {
  const store = require(path.join(ROOT, "build", "data", "published-guides"));
  return (Array.isArray(store) ? store : []).filter((g) => g && g.status === "approved");
}

function loadArticleGuides() {
  const articles = require(path.join(ROOT, "build", "data", "articles"));
  const schemes = require(path.join(ROOT, "build", "data", "schemes"));
  return []
    .concat(Array.isArray(articles) ? articles : [])
    .concat(Array.isArray(schemes) ? schemes : []);
}

async function loadSupabaseGuides(opts) {
  opts = opts || {};
  require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
  const db = require(path.join(ROOT, "build", "db-content"));
  // Default: only articles that are actually served (published pipeline
  // stages), because drafts are not rendered or scored on the public site.
  const status = opts.status || "published";
  const filter = status === "all" ? "" : "&status=eq." + status;
  const rows = await db.select("select=id,title,status,refined_guide&refined_guide=not.is.null&order=created_at.desc&limit=300" + filter);
  return rows.map((r) => {
    const g = Object.assign({}, r.refined_guide);
    g.__id = r.id;
    g.__status = r.status;
    return g;
  }).filter((g) => g && (g.content || g.summary));
}

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------

function bar(score) {
  const filled = Math.max(0, Math.min(10, Math.round(score / 10)));
  return "#".repeat(filled) + ".".repeat(10 - filled);
}

function gradeMark(report) {
  const okRead = report.readability >= TARGET_READABILITY;
  const okAll = report.overall >= TARGET_OVERALL;
  if (okRead && okAll) return "PASS";
  if (report.overall >= 55) return "NEAR";
  return "FAIL";
}

function reportLine(r, index) {
  const m = r.metrics;
  return [
    String(index + 1).padStart(3) + ".",
    r.slug.slice(0, 44).padEnd(45),
    "R=" + String(r.readability).padStart(3),
    "S=" + String(r.structure).padStart(3),
    "O=" + String(r.overall).padStart(3),
    gradeMark(r),
    "| sents " + String(m.avgSentenceWords).padStart(5) + "w",
    ">" + String(m.sentencesOver20).padStart(2),
    "| paras " + String(m.avgParagraphWords).padStart(5) + "w",
    "| lists " + String(m.bullets + m.numbered).padStart(3),
    "| links " + String(r.links.length),
    "| data " + String(m.statsCount).padStart(3),
    "| " + bar(r.overall),
  ].join(" ");
}

function summarize(reports) {
  const n = reports.length;
  if (!n) return { count: 0 };
  const avg = (key) => Math.round(reports.reduce((a, r) => a + r[key], 0) / n);
  const avgMetric = (key) => Math.round((reports.reduce((a, r) => a + r.metrics[key], 0) / n) * 10) / 10;
  return {
    count: n,
    readability: avg("readability"),
    structure: avg("structure"),
    overall: avg("overall"),
    avgSentenceWords: avgMetric("avgSentenceWords"),
    avgParagraphWords: avgMetric("avgParagraphWords"),
    totalLinks: reports.reduce((a, r) => a + r.links.length, 0),
    passReadability: reports.filter((r) => r.readability >= TARGET_READABILITY).length,
    passOverall: reports.filter((r) => r.overall >= TARGET_OVERALL).length,
    low: reports.filter((r) => r.overall < 55).length,
    medium: reports.filter((r) => r.overall >= 55 && r.overall < TARGET_OVERALL).length,
    good: reports.filter((r) => r.overall >= TARGET_OVERALL).length,
  };
}

function checkGuides(guides) {
  return guides.map((g) => lib.analyzeGuide(g));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  let guides;
  let sourceLabel;
  if (USE_SUPABASE) {
    guides = await loadSupabaseGuides({ status: value("status", "published") });
    sourceLabel = "Supabase content_items.refined_guide (status=" + value("status", "published") + ")";
  } else {
    guides = loadLocalGuides();
    sourceLabel = "build/data/published-guides.json";
  }
  if (SLUG) guides = guides.filter((g) => (g.slug || "").indexOf(SLUG) !== -1);
  if (LIMIT > 0) guides = guides.slice(0, LIMIT);

  const reports = checkGuides(guides).sort((a, b) => a.overall - b.overall);
  const summary = summarize(reports);

  if (AS_JSON) {
    console.log(JSON.stringify({ source: sourceLabel, summary, reports }, null, 2));
    return summary;
  }

  console.log("==============================================");
  console.log("SAMJHO CONTENT QUALITY CHECKER");
  console.log("==============================================");
  console.log("Source  : " + sourceLabel);
  console.log("Target  : Readability " + TARGET_READABILITY + "+ | Overall " + TARGET_OVERALL + "+");
  console.log("Articles: " + reports.length);
  console.log("");
  reports.forEach((r, i) => console.log(reportLine(r, i)));

  if (SHOW_ISSUES) {
    console.log("\n--- Top issues per article ---");
    reports.forEach((r) => {
      const list = SHOW_ALL_ISSUES ? r.issues : r.issues.slice(0, 3);
      if (!list.length) return;
      console.log("\n" + r.slug + "  (O=" + r.overall + ")");
      list.forEach((issue) => console.log("  - " + issue));
    });
  }

  console.log("\n==============================================");
  console.log("SUMMARY");
  console.log("==============================================");
  console.log("Articles scored      : " + summary.count);
  console.log("Avg Readability      : " + summary.readability + "/100");
  console.log("Avg Structure        : " + summary.structure + "/100");
  console.log("Avg Overall          : " + summary.overall + "/100");
  console.log("Avg sentence length  : " + summary.avgSentenceWords + " words");
  console.log("Avg paragraph length : " + summary.avgParagraphWords + " words");
  console.log("Outbound links total : " + summary.totalLinks +
    " (avg " + (Math.round((summary.totalLinks / summary.count) * 10) / 10) + " per article)");
  console.log("Readability >= " + TARGET_READABILITY + "    : " + summary.passReadability + "/" + summary.count);
  console.log("Overall >= " + TARGET_OVERALL + "        : " + summary.passOverall + "/" + summary.count);
  console.log("Grade split          : GOOD " + summary.good + " | MEDIUM " + summary.medium + " | LOW " + summary.low);
  console.log("==============================================");
  return summary;
}

module.exports = {
  main,
  checkGuides,
  summarize,
  loadLocalGuides,
  loadArticleGuides,
  loadSupabaseGuides,
  TARGET_READABILITY,
  TARGET_OVERALL,
};

if (require.main === module) {
  main().catch((e) => { console.error("FATAL:", e && e.message ? e.message : e); process.exit(1); });
}

