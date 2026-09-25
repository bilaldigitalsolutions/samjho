// Samjho Admin - DeepSeek AI Provider (MICRO 13).
// Server-side Node module ONLY. Not exposed to browser/client.
//
// Provider contract: provide(raw, options) -> Promise<{ ok, guide?, error? }>
// - raw = RAW inbox item (with categorization attached).
// - options.model, options.timeoutMs, options.headers are env/server-side.
// - MUST NOT invent facts/dates/amounts/URLs/eligibility/benefits.
// - Missing fields -> "Not specified in the official source."
// - Status always "draft". Never publish/approve/bypass human verification.
//
// IMPORTANT: This module must NEVER be bundled for browser use. It reads
// secrets ONLY from environment on the server side.
//
// Usage:
//   const provider = require('./deepseek.js');
//   const result = await provider.provide(rawItem, {
//     model: process.env.DEEPSEEK_MODEL,
//     timeoutMs: 30000
//   });

'use strict';

var NOT_SPECIFIED = "Not specified in the official source.";
var DEFAULT_BASE_URL = "https://api.deepseek.com";
var DEEPSEEK_BASE_URL = DEFAULT_BASE_URL;

var ERROR_CODES = {
  MISSING_API_KEY: "MISSING_API_KEY",
  PROVIDER_DISABLED: "PROVIDER_DISABLED",
  INVALID_API_KEY: "INVALID_API_KEY",
  API_UNAVAILABLE: "API_UNAVAILABLE",
  API_TIMEOUT: "API_TIMEOUT",
  API_RATE_LIMITED: "API_RATE_LIMITED",
  INVALID_API_RESPONSE: "INVALID_API_RESPONSE",
  MALFORMED_OUTPUT: "MALFORMED_OUTPUT",
  INVALID_GUIDE_OUTPUT: "INVALID_GUIDE_OUTPUT"
};

function readProcessEnv(key) {
  try {
    if (typeof process !== "undefined" && process && process.env) {
      return process.env[key];
    }
  } catch (e) {}
  return undefined;
}

function fail(code, message, extra) {
  return Object.assign({ ok: false, code: code, message: message }, extra || {});
}
function text(v) { return String(v == null ? "" : v); }
function today() { return new Date().toISOString().slice(0, 10); }

function getApiKey() {
  return readProcessEnv("DEEPSEEK_API_KEY");
}

function getModel(options) {
  return text(options && options.model) || text(readProcessEnv("DEEPSEEK_MODEL") || "deepseek-flash");
}

// Base URL is configurable (env or per-call override) so operations can point at
// a gateway/proxy without editing application code.
function getBaseUrl(options) {
  return text((options && options.baseUrl) || readProcessEnv("DEEPSEEK_BASE_URL") || DEFAULT_BASE_URL);
}

function isEnabled() {
  var key = getApiKey();
  return !!(key && key.trim());
}

module.exports = {
  NOT_SPECIFIED: NOT_SPECIFIED,
  DEEPSEEK_BASE_URL: DEEPSEEK_BASE_URL,
  DEFAULT_BASE_URL: DEFAULT_BASE_URL,
  ERROR_CODES: ERROR_CODES,
  readProcessEnv: readProcessEnv,
  getApiKey: getApiKey,
  getModel: getModel,
  getBaseUrl: getBaseUrl,
  isEnabled: isEnabled,
  fail: fail,
  text: text,
  today: today
};
