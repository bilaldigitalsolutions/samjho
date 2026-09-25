// Helpers for DeepSeek provider prompt and validation.
// Exposes schema-validate helper reused by the provider so it can call
// the existing guide schema without importing it directly from refine.js.
"use strict";

var NOT_SPECIFIED = "Not specified in the official source.";

function text(v) { return String(v == null ? "" : v); }
function today() { return new Date().toISOString().slice(0, 10); }

function hasWords(wordSet, str) {
  return groundingScore(wordSet, str) > 0;
}

// Count distinct RAW words (length >= 4) that also appear in `str`.
function groundingScore(wordSet, str) {
  var pieces = String(str).toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, " ").split(/\s+/);
  var seen = {};
  var score = 0;
  for (var i = 0; i < pieces.length; i++) {
    var w = pieces[i];
    if (w.length >= 4 && wordSet[w] && !seen[w]) { seen[w] = true; score++; }
  }
  return score;
}

// HALLUCINATION GUARD (stricter than a raw word-overlap test).
// A statement is treated as grounded only when it shares *substantive*
// evidence with the official source: either at least two distinct RAW words,
// or a single distinctive RAW word of 6+ characters. This stops a lone common
// noun (e.g. "card") from letting an invented claim pass.
function isGroundedText(wordSet, str) {
  var pieces = String(str).toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, " ").split(/\s+/);
  var seen = {};
  var score = 0;
  var hasDistinctive = false;
  for (var i = 0; i < pieces.length; i++) {
    var w = pieces[i];
    if (w.length >= 4 && wordSet[w] && !seen[w]) {
      seen[w] = true;
      score++;
      if (w.length >= 6) hasDistinctive = true;
    }
  }
  return score >= 2 || hasDistinctive;
}

function buildWordSet(raw) {
  var set = {};
  var words = String(raw).toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, " ").split(/\s+/);
  for (var i = 0; i < words.length; i++) {
    if (words[i].length >= 4) set[words[i]] = true;
  }
  return set;
}

// Collect every official source URL carried by the guide. The existing Guide
// schema uses `source_ids`; some responses may also echo `source_url`. Both are
// accepted so validation matches the EXISTING schema rather than a new field.
function guideSourceUrls(guide) {
  var urls = [];
  if (guide && typeof guide === "object") {
    if (text(guide.source_url).trim()) urls.push(text(guide.source_url).trim());
    if (Array.isArray(guide.source_ids)) {
      for (var i = 0; i < guide.source_ids.length; i++) {
        if (text(guide.source_ids[i]).trim()) urls.push(text(guide.source_ids[i]).trim());
      }
    }
  }
  return urls;
}

// Simple independent validation of key guide fields without loading the full
// guide schema module (avoids circular require issues in tests).
function validateGuideFields(guide) {
  var errs = [];
  if (!guide || typeof guide !== "object") return { ok: false, errors: ["guide missing"] };
  if (!text(guide.title).trim()) errs.push("title");
  if (!text(guide.slug).trim()) errs.push("slug");
  if (!text(guide.category).trim()) errs.push("category");
  if (text(guide.status).toLowerCase() !== "draft") errs.push("status");
  if (guideSourceUrls(guide).length === 0) errs.push("source_ids");
  return { ok: errs.length === 0, errors: errs };
}

function assertSourcePreserved(guide, sourceUrl) {
  var want = text(sourceUrl).trim();
  if (!want) return fail("missing source url");
  var urls = guideSourceUrls(guide);
  for (var i = 0; i < urls.length; i++) {
    if (urls[i] === want) return { ok: true };
  }
  return fail("source url mismatch");
}

function fail(reason) {
  return { ok: false, errors: [reason] };
}

module.exports = { text, today, NOT_SPECIFIED, buildWordSet, hasWords, groundingScore, isGroundedText, validateGuideFields, assertSourcePreserved };
