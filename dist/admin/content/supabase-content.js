// =============================================================================
// MICRO 20 — Supabase Content Database Adapter (browser-safe)
// =============================================================================
// Browser-side module using the authenticated Supabase client.
// Uses SUPABASE_URL + SUPABASE_ANON_KEY (public by design) + user session.
// NEVER imports service-role key or DeepSeek API key.
// =============================================================================

(function () {
  "use strict";

  var root = typeof self !== "undefined" ? self : this;
  var TABLE = "content_items";
  var client = null;

  function getClient() {
    if (client) return client;
    var config = root.SamjhoSupabaseConfig;
    if (!config || !window.supabase) return null;
    client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    return client;
  }

  function select(options) {
    var c = getClient();
    if (!c) return Promise.reject(new Error("Supabase client not available"));
    var query = c.from(TABLE).select(options && options.columns || "*");
    if (options && options.filter) {
      Object.keys(options.filter).forEach(function (key) {
        query = query.eq(key, options.filter[key]);
      });
    }
    if (options && options.order) query = query.order(options.order.column, { ascending: options.order.ascending !== false });
    if (options && options.limit) query = query.limit(options.limit);
    return query.then(function (res) {
      if (res.error) throw res.error;
      return res.data || [];
    });
  }

  function insert(record) {
    var c = getClient();
    if (!c) return Promise.reject(new Error("Supabase client not available"));
    var now = new Date().toISOString();
    record.created_at = record.created_at || now;
    record.updated_at = now;
    return c.from(TABLE).insert(record).select().then(function (res) {
      if (res.error) throw res.error;
      return res.data && res.data[0] ? res.data[0] : record;
    });
  }

  function update(id, fields) {
    var c = getClient();
    if (!c) return Promise.reject(new Error("Supabase client not available"));
    fields.updated_at = new Date().toISOString();
    return c.from(TABLE).update(fields).eq("id", id).select().then(function (res) {
      if (res.error) throw res.error;
      return res.data && res.data[0] ? res.data[0] : null;
    });
  }

  function remove(id) {
    var c = getClient();
    if (!c) return Promise.reject(new Error("Supabase client not available"));
    return c.from(TABLE).delete().eq("id", id).then(function (res) {
      if (res.error) throw res.error;
      return true;
    });
  }

  function findByReleaseId(releaseId) {
    return select({ filter: { release_id: releaseId }, limit: 1 }).then(function (rows) {
      return rows[0] || null;
    });
  }

  function findByReleaseUrl(releaseUrl) {
    return select({ filter: { release_url: releaseUrl }, limit: 1 }).then(function (rows) {
      return rows[0] || null;
    });
  }

  var api = {
    TABLE: TABLE,
    getClient: getClient,
    select: select,
    insert: insert,
    update: update,
    remove: remove,
    findByReleaseId: findByReleaseId,
    findByReleaseUrl: findByReleaseUrl
  };

  if (typeof module === "object" && module.exports) { module.exports = api; }
  else { root.SamjhoContentDB = api; }
})();
