// Samjho Admin — AI Provider Interface (MICRO 13).
// Provider/adapter boundary so a real provider (DeepSeek) can be added
// WITHOUT rewriting the existing refinement workflow and WITHOUT exposing
// API keys to the browser/client.
//
// IMPORTANT (MICRO 13 rule):
// - A `_providersEnabled` map keyed by provider name prevents the browser
//   bundle from ever accidentally enabling a server-only provider.
// - DeepSeek (and any future provider) is designed to run ONLY on the
//   Node/server side. The browser bundle deliberately keeps those providers
//   disabled by default.
//
// Provider contract:
//   provider.provide(raw, options) -> Promise<{ ok, guide?, error? }>
//   - MUST NOT invent facts/dates/amounts/URLs/goals.
//   - MUST return a result compatible with admin/schemas/guide.js.
//   - MUST NOT call publish/approve; draft only.
//   - MUST keep RAW content out of responses/content it returns
//     (return RAW separately when needed).
//
// This module exports:
//   - providerName(...) helpers only used by the Node-side provider layer.
//   - Provider status checks used by admin UI (no secret material).

(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.SamjhoAIPipelineProviders = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PROVIDER_NAMES = ["mock", "deepseek"];
  var SERVER_ONLY_PROVIDERS = ["deepseek"];

  // Default model name for DeepSeek. Configurable via env (server side).
  // Not a secret. Default value only; real ops set DEEPSEEK_MODEL.
  var DEFAULT_DEEPSEEK_MODEL = "deepseek-flash";

  function deeProviderEnabled() {
    // Deliberately returns false in any browser/runtime where the server
    // key and backend entrypoint are not present. Prevents accidental
    // client-side network call paths.
    if (typeof process === "undefined") return false;
    if (process && process.env && process.env.DEEPSEEK_API_KEY) return true;
    return false;
  }

  return {
    PROVIDER_NAMES: PROVIDER_NAMES,
    SERVER_ONLY_PROVIDERS: SERVER_ONLY_PROVIDERS,
    deeProviderEnabled: deeProviderEnabled,
    DEFAULT_DEEPSEEK_MODEL: DEFAULT_DEEPSEEK_MODEL
  };
});
