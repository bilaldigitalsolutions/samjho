// =============================================================================
// Samjho Admin — Authentication Module
// =============================================================================
// Uses Supabase Auth (email/password) to protect admin pages.
// Loads the Supabase JS client from CDN and manages sessions.
//
// Security:
//   - Uses only SUPABASE_URL + SUPABASE_ANON_KEY (public by design)
//   - NEVER exposes DEEPSEEK_API_KEY or SUPABASE_SERVICE_ROLE_KEY
//   - Session tokens are managed by the Supabase client library
// =============================================================================

(function () {
  "use strict";

  var root = typeof self !== "undefined" ? self : this;
  var config = root.SamjhoSupabaseConfig;
  var client = null;

  function getClient() {
    if (client) return client;
    if (!config || !window.supabase) return null;
    client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    return client;
  }

  function getSession() {
    var c = getClient();
    if (!c) return Promise.resolve(null);
    return c.auth.getSession().then(function (res) {
      return (res && res.data && res.data.session) || null;
    }).catch(function () {
      return null;
    });
  }

  function checkSession() {
    return getSession().then(function (session) {
      if (!session) {
        var current = window.location.pathname;
        if (current.indexOf("/admin/login.html") === -1) {
          window.location.href = "/admin/login.html";
        }
        return null;
      }
      return session;
    });
  }

  function requireAuth() {
    return checkSession().then(function (session) {
      if (!session) return null;
      var user = session.user || {};
      return {
        id: user.id || "",
        email: user.email || "",
        role: user.role || ""
      };
    });
  }

  function login(email, password) {
    try {
      var c = getClient();
      if (!c) return Promise.reject(new Error("Supabase client not available — CDN may have failed to load. Check browser console."));
      return c.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          if (res.error) throw res.error;
          return { user: res.data.user, session: res.data.session };
        });
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  function logout() {
    var c = getClient();
    if (!c) { window.location.href = "/admin/login.html"; return Promise.resolve(); }
    return c.auth.signOut().then(function () {
      window.location.href = "/admin/login.html";
    });
  }

  function getAccessToken() {
    return getSession().then(function (session) {
      return (session && session.access_token) || null;
    });
  }

  var api = {
    getClient: getClient,
    getSession: getSession,
    checkSession: checkSession,
    requireAuth: requireAuth,
    login: login,
    logout: logout,
    getAccessToken: getAccessToken
  };

  if (typeof module === "object" && module.exports) { module.exports = api; }
  else { root.SamjhoAuth = api; }
})();
