// =============================================================================
// Samjho — MICRO 14 — Secure server endpoint client (browser-safe)
// =============================================================================
// The browser NEVER contacts the AI provider directly and NEVER sees the API
// key. It only POSTs the required refinement input to the Firebase Cloud
// Function (/api/refineDeepseek via the Hosting rewrite), which runs the
// EXISTING Micro 13 server bridge server-side and returns the structured
// result. No secrets live here — this module is safe to ship in dist/.
// =============================================================================

(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.SamjhoServerEndpoint = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_ENDPOINT = "/api/refineDeepseek";

  // POST { raw, categorization } -> structured refinement result/error.
  // options.endpoint lets tests point at a local emulator/mock endpoint.
  function refineViaServer(raw, categorization, options) {
    options = options || {};
    var endpoint = options.endpoint || DEFAULT_ENDPOINT;
    var payload = JSON.stringify({ raw: raw, categorization: categorization });

    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      credentials: "same-origin"
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!data || typeof data !== "object") {
          return {
            ok: false,
            code: "FUNCTION_ERROR",
            message: "Server refinement endpoint returned a non-JSON response. RAW unchanged; nothing created.",
            guide: null
          };
        }
        return data;
      });
    }).catch(function (err) {
      return {
        ok: false,
        code: "FUNCTION_UNREACHABLE",
        message: "Cannot reach the server refinement endpoint (" + endpoint + "): " +
          (err && err.message ? err.message : String(err)) +
          ". RAW unchanged; nothing created. Deploy the Firebase function (see README).",
        guide: null
      };
    });
  }

  // Lightweight availability probe (no secrets, no content sent).
  function checkServerProvider(options) {
    options = options || {};
    var endpoint = options.endpoint || DEFAULT_ENDPOINT;
    return fetch(endpoint, { method: "OPTIONS" }).then(function (res) {
      return { reachable: res.status !== 404, status: res.status };
    }).catch(function () {
      return { reachable: false, status: 0 };
    });
  }

  return {
    refineViaServer: refineViaServer,
    checkServerProvider: checkServerProvider,
    DEFAULT_ENDPOINT: DEFAULT_ENDPOINT
  };
});