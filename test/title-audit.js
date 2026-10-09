// Title tag audit — standard format: [Page Topic] | Samjho India
// 1) unit checks on formatTitleTag()
// 2) every built page: suffix, no —/–/•, no double brand, <=60 chars
// 3) exact spec strings for homepage, categories, static pages, calculators
"use strict";
const fs = require("fs");
const path = require("path");
const { formatTitleTag } = require("../build/templates/layout");

const DIST = path.join(__dirname, "..", "dist");
const EXEMPT_DIRS = ["admin", "questions"]; // tool consoles, not public pages

let fail = 0;
function check(label, cond, detail) {
  if (!cond) { fail++; console.log("  FAIL: " + label + (detail ? " -> " + detail : "")); }
}

function unescape(s) {
  return String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

// ---------------------------------------------------------------- 1. unit
console.log("=== 1. formatTitleTag unit checks ===");
const exact = [
  ["Your Questions, Clear Answers, Brighter Decisions | Samjho India", "Your Questions, Clear Answers, Brighter Decisions | Samjho India"], // exact spec (63 chars — passes through)
  ["Government Yojana and Services", "Government Yojana and Services | Samjho India"],
  ["Documents Apply, Update and Download", "Documents Apply, Update and Download | Samjho India"],
  ["Business Register, Comply, Grow", "Business Register, Comply, Grow | Samjho India"],
  ["Money Understand, Calculate, Invest", "Money Understand, Calculate, Invest | Samjho India"],
  ["Education Learn, Score, Succeed", "Education Learn, Score, Succeed | Samjho India"],
  ["About Samjho India", "About Samjho India | Samjho India"],
  ["Contact Samjho India", "Contact Samjho India | Samjho India"],
  ["Privacy Policy", "Privacy Policy | Samjho India"],
  ["Terms and Conditions", "Terms and Conditions | Samjho India"],
  ["Disclaimer", "Disclaimer | Samjho India"],
  ["EMI Calculator", "EMI Calculator | Samjho India"],
  ["Privacy Policy | Samjho India", "Privacy Policy | Samjho India"], // idempotent
  ["GST Kya Hai? Types, Rates, Registration — Samjho", "GST Kya Hai? Types, Rates, Registration | Samjho India"],
  ["Page not found — Samjho", "Page not found | Samjho India"],
  ["Terms & Conditions — Samjho India", "Terms & Conditions | Samjho India"],
  ["Samjho India", "Samjho India"], // brand-only: no double brand
];
exact.forEach(([input, expected]) => {
  const got = formatTitleTag(input);
  check("format(" + JSON.stringify(input) + ")", got === expected, JSON.stringify(got) + " !== " + JSON.stringify(expected));
});
const longCases = [
  "Business Registration 2026 — Udyam, GST, FSSAI Guide",
  "India International Water Week 2026 Begins: Vice-President Asks Citizens to Save Every Drop",
  "SEBI Cancels Recovery Certificate, Rashesh Purohit, TV Vision Limited",
];
longCases.forEach((input) => {
  const got = formatTitleTag(input);
  check("long <=60: " + input.slice(0, 40), got.length <= 60, got.length + " chars: " + got);
  check("long suffix: " + input.slice(0, 40), got.endsWith(" | Samjho India"), got);
  check("long no dash/bullet: " + input.slice(0, 40), !/[\u2013\u2014\u2022]/.test(got), got);
  check("idempotent: " + input.slice(0, 30), formatTitleTag(got) === got, got + " -> " + formatTitleTag(got));
});

// Exact spec strings (applied verbatim; the homepage tag is 63 chars).
const SPEC = {
  "index.html": "Your Questions, Clear Answers, Brighter Decisions | Samjho India",
  "government/index.html": "Government Yojana and Services | Samjho India",
  "documents/index.html": "Documents Apply, Update and Download | Samjho India",
  "business/index.html": "Business Register, Comply, Grow | Samjho India",
  "money/index.html": "Money Understand, Calculate, Invest | Samjho India",
  "education/index.html": "Education Learn, Score, Succeed | Samjho India",
  "about/index.html": "About Samjho India | Samjho India",
  "contact/index.html": "Contact Samjho India | Samjho India",
  "privacy/index.html": "Privacy Policy | Samjho India",
  "terms/index.html": "Terms and Conditions | Samjho India",
  "disclaimer/index.html": "Disclaimer | Samjho India",
  "calculators/emi/index.html": "EMI Calculator | Samjho India",
  "calculators/gst/index.html": "GST Calculator | Samjho India",
  "calculators/age/index.html": "Age Calculator | Samjho India",
  "calculators/discount/index.html": "Discount Calculator | Samjho India",
  "calculators/simple-interest/index.html": "Simple Interest Calculator | Samjho India",
  "calculators/cgpa/index.html": "CGPA Calculator | Samjho India",
};
const SPEC_VALUES = Object.values(SPEC);

// ------------------------------------------------------------- 2. dist scan
console.log("\n=== 2. all dist pages ===");
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (EXEMPT_DIRS.indexOf(e.name) === -1) walk(full);
    } else if (e.name.endsWith(".html")) files.push(full);
  }
})(DIST);

let noTitle = 0, badSuffix = 0, badSep = 0, badDup = 0, badStandalone = 0, overLen = 0;
let inBand = 0, under = 0, over = 0;
const problems = [];
const allTitles = [];
files.forEach((f) => {
  const rel = path.relative(DIST, f).replace(/\\/g, "/");
  const html = fs.readFileSync(f, "utf8");
  const m = html.match(/<title>([\s\S]*?)<\/title>/);
  if (!m) { noTitle++; problems.push(rel + ": NO <title>"); return; }
  const t = unescape(m[1]);
  allTitles.push({ rel, t });
  const suffixOk = t === "Samjho India" || t.endsWith(" | Samjho India");
  const sepOk = !/[\u2013\u2014\u2022]/.test(t);
  const dupOk = !/Samjho India India/.test(t);
  const standOk = !/\|\s*Samjho\s*$/i.test(t);
  // Exact spec strings stand verbatim (homepage = 63); all others <= 60.
  const lenOk = t.length <= 60 || SPEC_VALUES.indexOf(t) !== -1;
  if (!suffixOk) { badSuffix++; problems.push(rel + ": suffix -> " + t); }
  if (!sepOk) { badSep++; problems.push(rel + ": separator -> " + t); }
  if (!dupOk) { badDup++; problems.push(rel + ": double brand -> " + t); }
  if (!standOk) { badStandalone++; problems.push(rel + ": standalone brand -> " + t); }
  if (!lenOk) { overLen++; problems.push(rel + ": " + t.length + " chars -> " + t); }
  if (t.length >= 50 && t.length <= 60) inBand++;
  else if (t.length < 50) under++;
  else over++;
});

check("every page has <title>", noTitle === 0, noTitle + " pages");
check("all titles end with | Samjho India", badSuffix === 0, badSuffix + " pages");
check("no —/–/• in any title", badSep === 0, badSep + " pages");
check("no 'Samjho India India'", badDup === 0, badDup + " pages");
check("no '| Samjho' standalone", badStandalone === 0, badStandalone + " pages");
check("all titles <= 60 chars", overLen === 0, overLen + " pages");

// ------------------------------------------------------- 3. exact spec pages
console.log("\n=== 3. exact spec titles ===");
let specOk = 0;
Object.keys(SPEC).forEach((rel) => {
  const hit = allTitles.find((x) => x.rel === rel);
  if (!hit) { check("spec page exists: " + rel, false); return; }
  if (hit.t === SPEC[rel]) specOk++;
  check("spec: " + rel, hit.t === SPEC[rel], JSON.stringify(hit.t));
});
console.log("exact spec matches: " + specOk + "/" + Object.keys(SPEC).length);

// --------------------------------------------------------------- 4. articles
const HUBS = ["business", "documents", "education", "government", "money"];
const articles = allTitles.filter((x) =>
  /^guides\//.test(x.rel) && x.rel !== "guides/index.html" && HUBS.indexOf(x.rel.split("/")[1]) === -1);
console.log("\n=== 4. article pages ===");
console.log("article pages: " + articles.length);
const articleBad = articles.filter((x) =>
  !x.t.endsWith(" | Samjho India") || /[\u2013\u2014\u2022]/.test(x.t) || x.t.length > 60);
check("all article titles formatted", articleBad.length === 0, articleBad.map((x) => x.rel + " -> " + x.t).join(" | "));

console.log("\n--- 10 sample article titles ---");
articles.slice(0, 10).forEach((x) => console.log("  " + x.t + "   (" + x.t.length + ")"));

console.log("\n--- title length bands (all pages) ---");
console.log("  50-60 chars: " + inBand + " | <50: " + under + " | >60: " + over + " | total: " + allTitles.length);
if (under) console.log("  <50: " + allTitles.filter((x) => x.t.length < 50).slice(0, 15).map((x) => x.rel + " (" + x.t.length + ")").join(", "));

if (problems.length) {
  console.log("\n--- problems (" + problems.length + ") ---");
  problems.slice(0, 25).forEach((p) => console.log("  " + p));
}
console.log("\n=== " + (fail === 0 ? "TITLE AUDIT PASS" : "TITLE AUDIT FAIL (" + fail + ")") + " ===");
process.exit(fail ? 1 : 0);