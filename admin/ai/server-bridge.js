// Samjho Admin - Secure DeepSeek Server Bridge (MICRO 13).
// Server-side Node.js module ONLY. Never ships to browser/client.
//
// Secure integration boundary: Samjho admin content workflow <-> DeepSeek API.
// Deployment: Firebase Cloud Functions, standalone Node, or local script.
// NEVER bundled into browser client. API key stays on server only.
//
// Provider contract: refineWithDeepSeek(raw, options) -> Promise<{ok, guide?, raw?, error?}>
// - Returns Guide-schema draft with status "draft" on success
// - NEVER approves, publishes, or bypasses human verification
// - Preserves RAW content and source metadata unchanged
// - Validates output against existing Guide schema before returning
'use strict';

var deepSeek = require("./deepseek.js");
var guideSchema = require("../schemas/guide.js");

var NOT_SPECIFIED = deepSeek.NOT_SPECIFIED || "Not specified in the official source.";

var ERROR_CODES = Object.assign({}, deepSeek.ERROR_CODES || {}, {
  INVALID_RAW_INPUT: "INVALID_RAW_INPUT",
  MANUAL_CATEGORIZATION_REQUIRED: "MANUAL_CATEGORIZATION_REQUIRED",
  GUIDE_SCHEMA_VALIDATION_FAILED: "GUIDE_SCHEMA_VALIDATION_FAILED"
});

function text(v) { return String(v == null ? "" : v); }
function fail(code, message, extra) {
  return Object.assign({ ok: false, code: code, message: message }, extra || {});
}

function validateRawInput(raw) {
  if (!raw || typeof raw !== "object") {
    return fail(ERROR_CODES.INVALID_RAW_INPUT, "Refinement failed: RAW announcement is missing.");
  }
  var errors = [];
  if (!text(raw.title).trim()) errors.push("title is required");
  if (!text(raw.raw_content).trim()) errors.push("raw_content is required");
  if (!text(raw.source_url).trim()) errors.push("source_url is required");
  if (!text(raw.source_name).trim()) errors.push("source_name is required");
  if (errors.length) {
    return fail(ERROR_CODES.INVALID_RAW_INPUT,
      "Refinement failed: invalid RAW input (" + errors.join("; ") + "). RAW left unchanged.");
  }
  return { ok: true };
}

function validateGuideAgainstSchema(guide) {
  if (!guide || typeof guide !== "object") {
    return fail(ERROR_CODES.GUIDE_SCHEMA_VALIDATION_FAILED,
      "Refinement failed: AI returned no guide object. RAW unchanged; nothing published.");
  }
  var validation = guideSchema.validateGuide(guide);
  if (!validation.valid) {
    return fail(ERROR_CODES.GUIDE_SCHEMA_VALIDATION_FAILED,
      "Refinement failed: guide schema validation failed (" + validation.errors.join("; ") + "). RAW unchanged; nothing published.");
  }
  if (text(guide.status).toLowerCase() !== "draft") {
    guide.status = "draft";
  }
  return { ok: true, guide: validation.normalized };
}

function refineWithDeepSeek(raw, options) {
  options = options || {};
  var inputCheck = validateRawInput(raw);
  if (!inputCheck.ok) {
    return Promise.resolve(Object.assign({}, inputCheck, { raw: raw || null, guide: null }));
  }
  var cat = raw && raw.categorization ? raw.categorization : null;
  var catStatus = text(cat && cat.categorization_status).trim();
  if (!cat || catStatus !== "categorized") {
    var why = !cat ? "content is uncategorized" : "content is marked '" + (cat && cat.categorization_status ? cat.categorization_status : "uncategorized") + "'";
    return Promise.resolve(
      fail(ERROR_CODES.MANUAL_CATEGORIZATION_REQUIRED,
        "Manual categorization is required first: " + why + ". Not sent to DeepSeek. RAW unchanged.",
        { raw: raw, guide: null })
    );
  }
  var deepSeekRaw = Object.assign({}, raw, {
    categorization: {
      content_type: text(cat.content_type),
      category: text(cat.category),
      sub_category: text(cat.sub_category),
      user_group: text(cat.user_group),
      categorization_status: catStatus
    }
  });
  return deepSeek.provide(deepSeekRaw, {
    model: options.model || undefined,
    timeoutMs: options.timeoutMs || 30000,
    // Injectable transport for offline tests; production leaves this undefined
    // so the real DeepSeek HTTPS endpoint is used.
    fetchImpl: options.fetchImpl,
    baseUrl: options.baseUrl
  }).then(function (result) {
    if (!result.ok) {
      return Object.assign({}, result, { raw: raw, guide: null });
    }
    var schemaCheck = validateGuideAgainstSchema(result.guide);
    if (!schemaCheck.ok) {
      return Object.assign({}, schemaCheck, { raw: raw, guide: null });
    }
    return {
      ok: true,
      code: "OK",
      message: "DeepSeek refinement complete: RAW restructured into a draft guide. Human verification still required.",
      guide: schemaCheck.guide,
      raw: raw,
      provider: "deepseek",
      model: result.model
    };
  });
}

function getProviderStatus() {
  var enabled = deepSeek.isEnabled();
  return {
    provider: "deepseek",
    configured: enabled,
    keyPresent: enabled,
    model: enabled ? text(process.env.DEEPSEEK_MODEL || "deepseek-flash") : "(not configured)",
    statusLabel: enabled
      ? "Configured - ready to refine"
      : "Not configured - set DEEPSEEK_API_KEY on the server (Firebase config/secrets or env). RAW unchanged; nothing created.",
    statusClass: enabled ? "admin-status--configured" : "admin-status--not-configured"
  };
}

function isProviderConfigured() {
  return deepSeek.isEnabled();
}

module.exports = {
  refineWithDeepSeek: refineWithDeepSeek,
  validateRawInput: validateRawInput,
  validateGuideAgainstSchema: validateGuideAgainstSchema,
  ERROR_CODES: ERROR_CODES,
  NOT_SPECIFIED: NOT_SPECIFIED,
  isProviderConfigured: isProviderConfigured,
  getProviderStatus: getProviderStatus
};
