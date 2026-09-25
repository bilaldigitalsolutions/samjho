// =============================================================================
// Samjho — MICRO 14 — Firebase Cloud Function request handler (pure core)
// =============================================================================
// This module contains NO Firebase SDK and NO DeepSeek logic. It is a thin,
// testable adapter between an HTTPS request and the EXISTING Micro 13 secure
// bridge (admin/ai/server-bridge.js -> admin/ai/deepseek.js -> DeepSeek API).
//
// The verbatim copies of the Micro 13 modules live in ./lib (generated at
// build time by build/emit-functions.js) so requires resolve identically:
//   ./lib/ai/server-bridge.js  requires  ./deepseek.js  and  ../schemas/*
//
// Guarantees (unchanged from Micro 13):
//   - DEEPSEEK_API_KEY is read from the server environment only.
//   - Only required refinement input is accepted (req 9/10); everything else
//     is rejected with a clear safe error.
//   - RAW content and official source metadata are returned unchanged.
//   - Result is always status=draft; the function can never approve or publish.
//   - On any failure: no fake draft, no partial content, RAW untouched.
// =============================================================================

"use strict";

// Verbatim copy of the existing secure bridge (Micro 13) — single source of truth.
var bridge = require("./lib/ai/server-bridge.js");

var ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  MANUAL_CATEGORIZATION_REQUIRED: "MANUAL_CATEGORIZATION_REQUIRED",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  FUNCTION_ERROR: "FUNCTION_ERROR"
};

function text(v) { return String(v == null ? "" : v); }

function fail(httpStatus, code, message) {
  return {
    httpStatus: httpStatus,
    result: { ok: false, code: code, message: message, guide: null }
  };
}

// -------------------------------------------------------------------------
// Request validation (requirement 9/10): only the required refinement input.
//   raw: { title, raw_content, source_name, source_url, source_published_date }
//   categorization: { content_type, category, sub_category, user_group,
//                     categorization_status: "categorized" }
// The official published date is accepted as-is: when the source genuinely has
// no date, "" is preserved and surfaced for human review (Micro 13 semantics)
// instead of blocking the flow — it is never replaced by today's date.
// -------------------------------------------------------------------------
function validateRequest(body) {
  if (!body || typeof body !== "object") {
    return fail(400, ERROR_CODES.INVALID_REQUEST,
      "Request body must be a JSON object with 'raw' and 'categorization'. RAW unchanged; nothing created.");
  }
  var raw = body.raw;
  var cat = body.categorization;
  if (!raw || typeof raw !== "object") {
    return fail(400, ERROR_CODES.INVALID_REQUEST,
      "Missing 'raw' object with the official announcement content. RAW unchanged; nothing created.");
  }
  var missing = [];
  if (!text(raw.title).trim()) missing.push("title");
  if (!text(raw.raw_content).trim()) missing.push("raw_content");
  if (!text(raw.source_name).trim()) missing.push("source_name");
  if (!text(raw.source_url).trim()) missing.push("source_url");
  if (missing.length) {
    return fail(400, ERROR_CODES.INVALID_REQUEST,
      "Missing required RAW field(s): " + missing.join(", ") + ". RAW unchanged; nothing created.");
  }
  if (!cat || typeof cat !== "object") {
    return fail(400, ERROR_CODES.MANUAL_CATEGORIZATION_REQUIRED,
      "Missing 'categorization'. Categorize the RAW item first (status must be 'categorized'). RAW unchanged; nothing created.");
  }
  if (text(cat.categorization_status).trim() !== "categorized") {
    var gotStatus = text(cat.categorization_status).trim() || "empty";
    return fail(400, ERROR_CODES.MANUAL_CATEGORIZATION_REQUIRED,
      "Categorization status must be 'categorized' (got '" + gotStatus +
      "'). Manual categorization is required first. RAW unchanged; nothing created.");
  }
  var catMissing = [];
  if (!text(cat.category).trim()) catMissing.push("category");
  if (!text(cat.content_type).trim()) catMissing.push("content_type");
  if (catMissing.length) {
    return fail(400, ERROR_CODES.INVALID_REQUEST,
      "Missing required categorization field(s): " + catMissing.join(", ") + ". RAW unchanged; nothing created.");
  }
  return { ok: true };
}

// -------------------------------------------------------------------------
// Main entry. Returns Promise<{ httpStatus, result }> where result is the
// EXISTING Micro 13 structured refinement result/error format.
// -------------------------------------------------------------------------
function handleRefineRequest(body, options) {
  options = options || {};
  var check = validateRequest(body);
  if (!check.ok) return Promise.resolve(check);

  var raw = body.raw;
  var cat = body.categorization;

  // Shallow copy carrying categorization — the caller's RAW object is never
  // mutated (same contract as the existing pipeline).
  var rawWithCat = Object.assign({}, raw, {
    categorization: {
      content_type: text(cat.content_type),
      category: text(cat.category),
      sub_category: text(cat.sub_category),
      user_group: text(cat.user_group),
      categorization_status: text(cat.categorization_status)
    }
  });

  return bridge.refineWithDeepSeek(rawWithCat, {
    model: options.model || undefined,
    timeoutMs: options.timeoutMs || 30000
  }).then(function (result) {
    // result is already the existing structured format:
    //   success: { ok, code:"OK", guide, raw, provider, model }
    //   failure: { ok:false, code, message, raw, guide:null }
    return { httpStatus: 200, result: result };
  });
}

module.exports = {
  ERROR_CODES: ERROR_CODES,
  validateRequest: validateRequest,
  handleRefineRequest: handleRefineRequest
};