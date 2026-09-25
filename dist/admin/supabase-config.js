// =============================================================================
// Samjho Admin — Supabase Public Configuration
// =============================================================================
// This file contains ONLY public values safe for browser use:
//   - SUPABASE_URL: the project REST endpoint (public)
//   - SUPABASE_ANON_KEY: the public anonymous key (by design, safe in browser)
//
// NEVER put SUPABASE_SERVICE_ROLE_KEY or DEEPSEEK_API_KEY here.
// =============================================================================
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.SamjhoSupabaseConfig = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  return {
    SUPABASE_URL: "https://clxwcivvxyyodahexjao.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_Udyya4vm0W22IDL-EoS4mw_kuE6mVnu"
  };
});
