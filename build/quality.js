// quality.js — shared content-quality rules for the Samjho build AND the
// publish pipeline. Single source of truth used by:
//   - build/build.js              (thin-page noindex + sitemap filtering)
//   - build/data/published-store.js (publish-time quality gate — thin or
//                                    test content can never be staged)
"use strict";

const THIN_MIN_WORDS = 300;
const THIN_MIN_FAQS = 3;

function plainText(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/[#*_>`~[\]()|]/g, " ");
}

function countWords(s) {
  return (plainText(s).match(/[\p{L}\p{N}]+/gu) || []).length;
}

function guideWordCount(g) {
  if (!g) return 0;
  const body = Array.isArray(g.content) ? g.content.join("\n") : g.content_html || g.content || "";
  let n = countWords(body);
  if (typeof g.summary === "string") n += countWords(g.summary);
  else if (Array.isArray(g.summary)) n += countWords(g.summary.join(" "));
  return n;
}

function guideFaqCount(g) {
  const faqs = (g && (g.faqs || g.faq)) || [];
  return Array.isArray(faqs) ? faqs.length : 0;
}

function isThinGuide(g) {
  return guideWordCount(g) < THIN_MIN_WORDS || guideFaqCount(g) < THIN_MIN_FAQS;
}

// Test/mock junk from the PIB pipeline — never render, never index, never
// list in the sitemap, never publish.
function isTestGuide(g) {
  if (!g) return false;
  return /test|mock/i.test(String(g.slug || "")) || /test|mock/i.test(String(g.title || ""));
}

function articleWordCount(a) {
  if (!a) return 0;
  let n = 0;
  ["quickSummary", "shortAnswer", "simpleExplanation", "whyMatters", "example", "importantPoints", "commonMistakes"].forEach((k) => {
    n += Array.isArray(a[k]) ? countWords(a[k].join(" ")) : countWords(a[k]);
  });
  (Array.isArray(a.faq) ? a.faq : []).forEach((f) => {
    n += countWords(f && (f.q || f.question));
    n += countWords(f && (f.a || f.answer));
  });
  return n;
}

function isThinArticle(a) {
  return articleWordCount(a) < THIN_MIN_WORDS;
}

// Human-readable gate failures for the publish pipeline. Empty array = pass.
function guideQualityErrors(guide) {
  const errors = [];
  if (!guide || typeof guide !== "object") return ["guide object is missing"];
  if (isTestGuide(guide)) {
    errors.push("test/mock content is never published (slug or title contains 'test' or 'mock')");
  }
  const words = guideWordCount(guide);
  const faqs = guideFaqCount(guide);
  if (words < THIN_MIN_WORDS) {
    errors.push("content is " + words + " words — expand to " + THIN_MIN_WORDS + "+ words before publishing");
  }
  if (faqs < THIN_MIN_FAQS) {
    errors.push("only " + faqs + " FAQ(s) — add at least " + THIN_MIN_FAQS + " FAQs before publishing");
  }
  return errors;
}

module.exports = {
  THIN_MIN_WORDS,
  THIN_MIN_FAQS,
  plainText,
  countWords,
  guideWordCount,
  guideFaqCount,
  isThinGuide,
  isTestGuide,
  articleWordCount,
  isThinArticle,
  guideQualityErrors,
};