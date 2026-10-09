// MICRO 26 Tests — Readability library + Content Quality Checker
// Verifies the readability rules without touching the network:
//   1. sentence splitting (max 15 words, no grammar damage)
//   2. paragraph splitting (3-4 lines / 55 words)
//   3. simple-word substitution (utilize -> use, facilitate -> help)
//   4. quoted official statements are never rewritten
//   5. outbound authoritative links (2-3 per article)
//   6. real dates / numbers are kept, never invented
//   7. end-to-end: 5 articles reach Readability 60+ / Overall 70+
var passed = 0, failed = 0;
function assert(label, cond) {
  if (cond) { passed++; console.log("  PASS: " + label); }
  else { failed++; console.log("  FAIL: " + label); }
}

var lib = require("../build/scripts/readability-lib");
var mg = require("../build/templates/master-guide");

console.log("=== Micro 26 Tests: readability ===");

// 1. Sentence length
console.log("--- 1. Sentence length ---");
var longSentence = "The Employees' Provident Fund Organisation has published its official Citizen's Charter, and it outlines the commitment to service delivery standards, and it tells members what timelines to expect.";
var split = lib.splitLongSentence(longSentence, 15);
function wordTokens(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
}
function inOrder(sub, sup) {
  var i = 0;
  for (var j = 0; j < sub.length; j++) {
    while (i < sup.length && sup[i] !== sub[j]) i++;
    if (i >= sup.length) return false;
    i++;
  }
  return true;
}
assert("Long sentence is split", split.length > 1);
assert("Every split part is <= 15 words", split.every(function (s) { return lib.wordCount(s) <= 15; }));
var tBefore = wordTokens(longSentence);
var tAfter = wordTokens(split.join(" "));
assert("Splitting adds no words and keeps order", inOrder(tAfter, tBefore));
assert("Splitting drops only conjunctions (<=3 words)",
  tBefore.length - tAfter.length <= 3);
assert("Short sentence is untouched",
  lib.splitLongSentence("It is free to apply online.", 15).length === 1);
assert("No split inside a decimal (2.4)", lib.splitSentences("India has about 2.4 per cent of world freshwater.").length === 1);
assert("No split inside abbreviations (Shri, PIB)",
  lib.splitSentences("Shri C. P. Radhakrishnan launched it on 22 Sept. in New Delhi.").length === 1);

// 2. Paragraphs
console.log("--- 2. Paragraph length ---");
var longPara = "One sentence here is fine. ".repeat(10).trim() + " Final one.";
var splitPara = lib.splitProseParagraph(longPara, 3, 55);
var paraBlocks = splitPara.split(/\n\s*\n/);
assert("Long paragraph is split into 3+ blocks", paraBlocks.length > 1);
assert("No block over 55 words",
  paraBlocks.every(function (b) { return lib.wordCount(b) <= 55; }));
assert("Paragraph keeps sentence count",
  lib.splitSentences(longPara).length === lib.splitSentences(splitPara).length);

// 3. Simple words
console.log("--- 3. Simple words ---");
assert("utilize -> use", lib.simplifyWords("We utilize the portal.").indexOf("use") !== -1);
assert("facilitate -> help", lib.simplifyWords("It facilitates access.").indexOf("help") !== -1);
assert("phrase: in order to -> to", lib.simplifyWords("in order to apply").indexOf("in order to") === -1);
assert("capitalisation preserved", lib.simplifyWords("Utilize the portal.") === "Use the portal.");
assert("Hinglish words untouched", lib.simplifyWords("Iski yojana me apply karein.") === "Iski yojana me apply karein.");

// 4. Meaning protection
console.log("--- 4. Meaning protection ---");
var quote = 'The Minister said, "We shall not change the rules."';
assert("Quoted text is never rewritten", lib.simplifyWords(quote).indexOf("must not change") === -1);
assert("Quoted text kept verbatim", lib.simplifyWords(quote).indexOf("We shall not change the rules.") !== -1);
assert("Noun forms are not swapped (requests stays)",
  lib.simplifyWords("Online claim settlement requests").indexOf("requests") !== -1);

// Meaning preservation: enhancing an article may only DROP a conjunction and
// insert line breaks — every other word must survive, in order.
function tokens(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
}
var beforeGuide = require("../build/data/published-guides")[1];
var enhanced = lib.enhanceGuide(beforeGuide);
var wBefore = tokens(beforeGuide.content);
var wAfter = tokens(enhanced.guide.content);
assert("Enhanced body adds no new words", inOrder(wAfter, wBefore));
assert("Enhanced body drops at most 3 words (conjunctions only)",
  wBefore.length - wAfter.length <= 3);
assert("Enhanced body keeps every heading",
  (beforeGuide.content.match(/^##+ .+$/gm) || []).every(function (h) {
    return enhanced.guide.content.indexOf(h) !== -1;
  }));

// 5. Outbound authoritative links
console.log("--- 5. Outbound links ---");
var sample = require("../build/data/published-guides").find(function (g) {
  return g.slug === "india-international-water-week-2026";
});
var refs = lib.suggestOfficialReferences(sample, { max: 3 });
assert("2-3 links returned", refs.length >= 2 && refs.length <= 3);
assert("Every link has label + href",
  refs.every(function (r) { return !!r.label && /^https?:\/\//.test(r.href); }));
assert("Article's own PIB release is linked first",
  refs[0].href.indexOf("pib.gov.in") !== -1);
assert("All links are official (.gov.in / .gov / regulator)",
  refs.every(function (r) {
    return /\.(gov\.in|nic\.in|gov|org\.in)($|\/)/.test(r.href.replace(/^https?:\/\//, ""));
  }));
assert("Links are unique", new Set(refs.map(function (r) { return r.href; })).size === refs.length);

// The template must render these as real anchors.
var rendered = mg.renderSourceList(refs);
assert("Template renders <a> anchors", (rendered.match(/<a /g) || []).length === refs.length);
assert("Template renders plain source_ids URLs too",
  mg.renderSourceList(["https://pib.gov.in/PressReleasePage.aspx?PRID=123"]).indexOf("<a ") !== -1);

// 6. Data + dates
console.log("--- 6. Statistical data ---");
var counts = require("../build/data/published-guides").map(function (g) {
  return lib.analyzeGuide(g).metrics.statsCount;
});
assert("Numbers/dates kept across the corpus", counts.reduce(function (a, b) { return a + b; }, 0) > 100);
var dated = lib.sourceDateLine({ source_published_date: "2026-09-22" });
assert("Real source date is formatted", dated === "22 September 2026");
assert("No date invented when none exists", lib.sourceDateLine({ last_updated: "" }) === "");

// 7. End-to-end on 5 articles
console.log("--- 7. Five-article quality gate ---");
var cq = require("../build/scripts/check-quality");
var five = cq.loadLocalGuides().slice(0, 5);
var reports = cq.checkGuides(five);
assert("Checked exactly 5 articles", reports.length === 5);
assert("All 5 at Readability 60+", reports.every(function (r) { return r.readability >= cq.TARGET_READABILITY; }));
assert("All 5 at Overall 70+", reports.every(function (r) { return r.overall >= cq.TARGET_OVERALL; }));
assert("All 5 have 2-3 outbound links",
  reports.every(function (r) { return r.links.length >= 2 && r.links.length <= 3; }));

var summary = cq.summarize(cq.checkGuides(cq.loadLocalGuides()));
console.log("  corpus: R " + summary.readability + " | S " + summary.structure +
  " | O " + summary.overall + " | links " + summary.totalLinks +
  " | avg sentences " + summary.avgSentenceWords + "w");
assert("Corpus average Readability 60+", summary.readability >= 60);
assert("Corpus average Overall 70+", summary.overall >= 70);
assert("Corpus average sentence <= 15 words", summary.avgSentenceWords <= 15);

console.log("\n=== " + passed + " passed, " + failed + " failed ===");
process.exit(failed ? 1 : 0);

