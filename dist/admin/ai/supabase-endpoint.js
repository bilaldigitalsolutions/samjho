// =============================================================================
// Samjho — MICRO 15A — Supabase Edge Function Client (browser-safe)
// =============================================================================
// The browser NEVER contacts the AI provider directly and NEVER sees the API
// key. It only POSTs the required refinement input to the Supabase Edge
// Function, which runs the same server bridge server-side and returns the
// structured result. No secrets live here — this module is safe to ship in dist/.
//
// DO NOT switch production traffic to this yet (Micro 15A = foundation only).
// The active production path remains admin/ai/server-endpoint.js (Firebase).
// =============================================================================

(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.SamjhoSupabaseEndpoint = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Default Supabase Edge Function URL.
  // Will be configurable via options.endpoint; production URL set when Supabase is deployed.
  var DEFAULT_ENDPOINT = "https://clxwcivvxyyodahexjao.supabase.co/functions/v1/refine-deepseek";

  /**
   * refineViaSupabase(raw, categorization, options)
   *   POST { raw, categorization } -> structured refinement result/error.
   *
   * options.endpoint  — Override the Supabase Edge Function URL.
   *
   * Returns Promise<{ ok, code, message, guide, raw, provider, model }>
   * Same result format as the Firebase endpoint (server-endpoint.js).
   */
  function refineViaSupabase(raw, categorization, options) {
    options = options || {};
    var endpoint = options.endpoint || DEFAULT_ENDPOINT;
    if (!endpoint) {
      return Promise.resolve({
        ok: false,
        code: "SUPABASE_ENDPOINT_NOT_CONFIGURED",
        message: "Supabase Edge Function endpoint is not configured yet. " +
          "Set the endpoint URL via options.endpoint or configure it in the admin panel. " +
          "RAW unchanged; nothing created.",
        guide: null
      });
    }

    var payload = JSON.stringify({ raw: raw, categorization: categorization });

    // Get the Supabase access token for JWT-authenticated Edge Function calls
    var headers = { "Content-Type": "application/json" };
    var root = typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {};
    var authMod = root.SamjhoAuth;
    var authPromise = (authMod && typeof authMod.getAccessToken === "function")
      ? authMod.getAccessToken()
      : Promise.resolve(null);

    return authPromise.then(function (token) {
      if (token) headers["Authorization"] = "Bearer " + token;
      return fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: payload,
        credentials: "omit"
      });
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!data || typeof data !== "object") {
          return {
            ok: false,
            code: "FUNCTION_ERROR",
            message: "Supabase Edge Function returned a non-JSON response. RAW unchanged; nothing created.",
            guide: null
          };
        }
        return data;
      });
    }).catch(function (err) {
      return {
        ok: false,
        code: "FUNCTION_UNREACHABLE",
        message: "Cannot reach the Supabase Edge Function (" + endpoint + "): " +
          (err && err.message ? err.message : String(err)) +
          ". RAW unchanged; nothing created. Deploy the Supabase function (see README).",
        guide: null
      };
    });
  }

  /**
   * checkSupabaseProvider(options)
   * Lightweight availability probe (no secrets, no content sent).
   */
  function checkSupabaseProvider(options) {
    options = options || {};
    var endpoint = options.endpoint || DEFAULT_ENDPOINT;
    if (!endpoint) return Promise.resolve({ reachable: false, status: 0, configured: false });
    return fetch(endpoint, { method: "OPTIONS" }).then(function (res) {
      return { reachable: res.status !== 404, status: res.status, configured: true };
    }).catch(function () {
      return { reachable: false, status: 0, configured: true };
    });
  }

  return {
    refineViaSupabase: refineViaSupabase,
    checkSupabaseProvider: checkSupabaseProvider,
    DEFAULT_ENDPOINT: DEFAULT_ENDPOINT
  };
});
