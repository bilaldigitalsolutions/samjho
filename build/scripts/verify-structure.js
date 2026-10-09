// TEMP — verify the unified master template across all article pages.
"use strict";
const fs = require("fs");
const path = require("path");

const DIST = path.join(__dirname, "..", "..", "dist", "guides");

const SAMPLES = [
  // 5 master-template (published) articles
  "pm-modi-tribute-lata-didi-jayanti",
  "income-tax-exemption-notifications-startup-india",
  "dgft-policy-relaxation-committee",
  "epfo-central-board-of-trustees-cbt",
  "lg-andaman-nicobar-meets-pm-modi",
  // 5 legacy articles
  "what-is-gst",
  "pm-kisan-yojana",
  "what-is-pan-card",
  "what-is-emi",
  "what-is-aadhaar",
];

const SECTIONS = {
  breadcrumb: "guide-breadcrumb",
  hero: "guide-hero",
  updated: "guide-last-updated",
  author: "article-author",
  summary: "guide-section--summary",
  faqs: "guide-section--faqs",
  sources: "guide-section--sources",
  disclaimer: "guide-section--disclaimer",
  related: "guide-section--related",
};

function read(slug) {
  const f = path.join(DIST, slug, "index.html");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
}

function headings(html) {
  const out = [];
  const re = /<(h[1-4])[^>]*>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(html))) {
    const text = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    if (text) out.push({ level: +m[1][1], text });
  }
  return out;
}

function unescape(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function jsonLdTypes(html) {
  const types = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1]);
      (Array.isArray(data) ? data : [data]).forEach((d) => { if (d && d["@type"]) types.push(d["@type"]); });
    } catch (e) { types.push("PARSE_ERROR"); }
  }
  return types;
}

console.log("=== 10-ARTICLE VERIFICATION ===\n");
const keys = Object.keys(SECTIONS);
let allPass = true;
const rows = [];

console.log(
  "slug".padEnd(46) + "H1 whysec  " +
  keys.map((k) => k.substring(0, 3)).join(" ").padEnd(22) +
  "dup h1len dlen schema  RESULT"
);
console.log("-".repeat(140));

SAMPLES.forEach((slug) => {
  const html = read(slug);
  if (!html) { console.log(slug.padEnd(46) + "FILE MISSING"); allPass = false; return; }

  const hs = headings(html);
  const h1 = hs.filter((h) => h.level === 1).length;
  const whySection = /guide-section--why-matters/.test(html);
  const whyH2 = hs.some((h) => h.level === 2 && /^why it matters$/i.test(h.text));

  const sec = keys.map((k) => (html.indexOf(SECTIONS[k]) !== -1 ? "Y" : "-"));
  const secOk = sec.every((s) => s === "Y");

  const counts = {};
  hs.forEach((h) => { const t = h.text.toLowerCase(); counts[t] = (counts[t] || 0) + 1; });
  const dup = Object.keys(counts).filter((k) => counts[k] > 1).length;

  const title = unescape((html.match(/<title>([\s\S]*?)<\/title>/) || [, ""])[1]);
  const desc = unescape((html.match(/name="description" content="([^"]*)"/) || [, ""])[1]);
  const canonical = /rel="canonical" href="https:\/\/samjhoindia\.com\/guides\//.test(html);
  const ogImage = /property="og:image"/.test(html);
  const types = jsonLdTypes(html);
  const schemaOk = ["BreadcrumbList", "Article", "FAQPage"].every((t) => types.includes(t));

  const pass = h1 === 1 && !whySection && !whyH2 && secOk && dup === 0 &&
    title.length >= 50 && title.length <= 60 && desc.length >= 150 && desc.length <= 160 &&
    canonical && ogImage && schemaOk;
  if (!pass) allPass = false;

  console.log(
    slug.padEnd(46) +
    String(h1).padEnd(3) +
    (whySection ? "SEC " : "ok  ") +
    sec.map((s, i) => s + keys[i][0].toUpperCase() + keys[i][1].toUpperCase() + " ").join(" ").padEnd(30) +
    String(dup).padEnd(4) +
    String(title.length).padEnd(6) +
    String(desc.length).padEnd(6) +
    (schemaOk ? "3/3    " : types.join(",").substring(0, 10).padEnd(7)) +
    (pass ? "PASS" : "FAIL")
  );
  rows.push({ slug, h1, whySection, whyH2, dup, title: title.length, desc: desc.length, types, canonical, ogImage, secOk, schemaOk, pass });
});

console.log("-".repeat(140));

// Structure = the unification itself; SEO bands = the 50-60 / 150-160 targets.
const structFails = rows.filter((r) =>
  r.h1 !== 1 || r.whySection || r.whyH2 || r.dup > 0 || !r.secOk || !r.schemaOk || !r.canonical || !r.ogImage);
const titleInBand = rows.filter((r) => r.title >= 50 && r.title <= 60);
const descInBand = rows.filter((r) => r.desc >= 150 && r.desc <= 160);

console.log("\n--- failures detail ---");
rows.filter((r) => !r.pass).forEach((r) => {
  const reasons = [];
  if (r.h1 !== 1) reasons.push(`H1=${r.h1}`);
  if (r.whySection) reasons.push("why-matters SECTION present");
  if (r.whyH2) reasons.push('"Why It Matters" H2 present');
  if (r.dup) reasons.push(`${r.dup} duplicate headings`);
  if (r.title < 50 || r.title > 60) reasons.push(`title=${r.title}chars`);
  if (r.desc < 150 || r.desc > 160) reasons.push(`desc=${r.desc}chars`);
  if (!r.canonical) reasons.push("no canonical");
  if (!r.ogImage) reasons.push("no og:image");
  if (!["BreadcrumbList", "Article", "FAQPage"].every((t) => r.types.includes(t)))
    reasons.push("schema: " + r.types.join(","));
  console.log(`  ${r.slug}: ${reasons.join(" | ")}`);
});

// --- corpus-wide: every article page must carry the master template ---
console.log("\n=== CORPUS: all dist/guides pages using master template ===");
const dirs = fs.readdirSync(DIST, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
// Category hubs under /guides/ are not article pages — they use their own layout.
const HUBS = ["business", "documents", "education", "government", "money"];
const articlePages = dirs.filter((d) => HUBS.indexOf(d) === -1);
const notMaster = [];
const whyLeft = [];
articlePages.forEach((slug) => {
  const html = read(slug);
  if (!html) return;
  if (html.indexOf("guide-breadcrumb") === -1) notMaster.push(slug);
  if (html.indexOf("guide-section--why-matters") !== -1) whyLeft.push(slug);
});
console.log(`article pages scanned    : ${articlePages.length} (excluded ${HUBS.length} category hubs)`);
console.log(`WITHOUT master template  : ${notMaster.length}${notMaster.length ? " -> " + notMaster.join(", ") : ""}`);
console.log(`with why-matters wrapper : ${whyLeft.length}${whyLeft.length ? " -> " + whyLeft.join(", ") : ""}`);

console.log(`\nSTRUCTURE verdict  : ${structFails.length === 0 ? "PASS" : "FAIL"} (${rows.length - structFails.length}/${rows.length} fully structured)`);
console.log(`SEO title 50-60   : ${titleInBand.length}/${rows.length}`);
console.log(`SEO desc  150-160  : ${descInBand.length}/${rows.length}`);

// --- corpus-wide SEO + hierarchy across ALL article pages -------------------
console.log("\n=== CORPUS SEO + HIERARCHY (all article pages) ===");
let noTitle = 0, shortTitle = 0, longTitle = 0, shortDesc = 0, longDesc = 0;
let h1Bad = 0, dupPages = 0, orphanH3 = 0, noFaqSchema = 0, noCanonical = 0, noOg = 0;
let sectionsMissing = 0, noArticleSchema = 0, noBreadSchema = 0, noViewport = 0;
const CORE = ["guide-breadcrumb", "guide-hero", "guide-last-updated", "article-author",
  "guide-section--summary", "guide-section--faqs", "guide-section--sources",
  "guide-section--disclaimer", "guide-section--related"];

articlePages.forEach((slug) => {
  const html = read(slug);
  if (!html) return;
  const t = unescape((html.match(/<title>([\s\S]*?)<\/title>/) || [, ""])[1]);
  const d = unescape((html.match(/name="description" content="([^"]*)"/) || [, ""])[1]);
  if (!t) noTitle++;
  else if (t.length < 50) shortTitle++;
  else if (t.length > 60) longTitle++;
  if (d.length < 150) shortDesc++;
  else if (d.length > 160) longDesc++;

  const hs = headings(html);
  if (hs.filter((h) => h.level === 1).length !== 1) h1Bad++;
  const c = {};
  hs.forEach((h) => { const k = h.text.toLowerCase(); c[k] = (c[k] || 0) + 1; });
  if (Object.keys(c).filter((k) => c[k] > 1).length) dupPages++;

  // An H3 must always be preceded by an H2 (no H1 -> H3 skips).
  let seenH2 = false;
  for (const h of hs) {
    if (h.level === 2) seenH2 = true;
    if (h.level === 3 && !seenH2) { orphanH3++; break; }
  }

  if (!jsonLdTypes(html).includes("FAQPage")) noFaqSchema++;
  if (!jsonLdTypes(html).includes("Article")) noArticleSchema++;
  if (!jsonLdTypes(html).includes("BreadcrumbList")) noBreadSchema++;
  if (!/name="viewport"/.test(html)) noViewport++;
  if (!/rel="canonical"/.test(html)) noCanonical++;
  if (!/property="og:image"/.test(html)) noOg++;
  if (CORE.some((m) => html.indexOf(m) === -1)) sectionsMissing++;
});

console.log(`article pages            : ${articlePages.length}`);
console.log(`title <50 / >60 / empty  : ${shortTitle} / ${longTitle} / ${noTitle}`);
console.log(`desc  <150 / >160        : ${shortDesc} / ${longDesc}`);
console.log(`pages with H1 != 1       : ${h1Bad}`);
console.log(`pages with duplicate head: ${dupPages}`);
console.log(`pages with orphan H3     : ${orphanH3}`);
console.log(`pages missing FAQPage    : ${noFaqSchema}`);
console.log(`pages missing Article    : ${noArticleSchema}`);
console.log(`pages missing Breadcrumb : ${noBreadSchema}`);
console.log(`pages missing viewport   : ${noViewport}`);
console.log(`pages missing canonical  : ${noCanonical}`);
console.log(`pages missing og:image   : ${noOg}`);
console.log(`pages missing core sect. : ${sectionsMissing}`);

const structOk = structFails.length === 0 && notMaster.length === 0 && whyLeft.length === 0 &&
  h1Bad === 0 && dupPages === 0 && orphanH3 === 0 && noFaqSchema === 0 && noArticleSchema === 0 &&
  noBreadSchema === 0 && noViewport === 0 && noCanonical === 0 && noOg === 0 && sectionsMissing === 0;
console.log(`\nVERIFICATION (structure): ${structOk ? "PASS" : "FAIL"}`);
process.exit(structOk ? 0 : 1);
