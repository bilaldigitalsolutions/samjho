// =============================================================================
// MICRO 20 — Supabase Content Database Adapter (server-side)
// =============================================================================
// Server-side module for Node.js scripts (daily fetch, refine, migration).
// Uses the Supabase REST API with the service_role key for full access.
//
// NEVER import this in browser code. It contains the service-role key.
// =============================================================================

"use strict";

const https = require("https");

const SUPABASE_URL = "https://clxwcivvxyyodahexjao.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TABLE = "content_items";

function getKey() {
  return SUPABASE_SERVICE_KEY;
}

function restRequest(method, path, body) {
  return new Promise(function (resolve, reject) {
    const key = getKey();
    if (!key) return reject(new Error("SUPABASE_SERVICE_ROLE_KEY not set"));
    const url = new URL(SUPABASE_URL + path);
    const data = body ? JSON.stringify(body) : null;
    const headers = {
        "Content-Type": "application/json",
        "apikey": key,
        "Authorization": "Bearer " + key,
      };
      if (method === "POST") headers["Prefer"] = "return=representation";
    const opts = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: headers
    };
    if (data) opts.headers["Content-Length"] = Buffer.byteLength(data);
    const req = https.request(opts, function (res) {
      let body = "";
      res.on("data", function (c) { body += c; });
      res.on("end", function () {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 400) return reject(new Error("HTTP " + res.statusCode + ": " + body));
          resolve(parsed);
        } catch (e) {
          if (res.statusCode >= 400) return reject(new Error("HTTP " + res.statusCode + ": " + body));
          resolve(body);
        }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function insert(item) {
  const record = Object.assign({}, item, {
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  return restRequest("POST", "/rest/v1/" + TABLE, record);
}

function upsertByReleaseId(item) {
  const record = Object.assign({}, item, {
    updated_at: new Date().toISOString()
  });
  return restRequest("POST", "/rest/v1/" + TABLE + "?on_conflict=release_id", record);
}

function upsertByReleaseUrl(item) {
  const record = Object.assign({}, item, {
    updated_at: new Date().toISOString()
  });
  return restRequest("POST", "/rest/v1/" + TABLE + "?on_conflict=release_url", record);
}

function update(id, fields) {
  fields.updated_at = new Date().toISOString();
  return restRequest("PATCH", "/rest/v1/" + TABLE + "?id=eq." + id, fields);
}

function select(query) {
  return restRequest("GET", "/rest/v1/" + TABLE + "?" + (query || "select=*&order=created_at.desc"));
}

function selectOne(query) {
  return restRequest("GET", "/rest/v1/" + TABLE + "?" + (query || "select=*&limit=1")).then(function (rows) {
    return Array.isArray(rows) ? rows[0] || null : null;
  });
}

function count(query) {
  return restRequest("GET", "/rest/v1/" + TABLE + "?select=count" + (query ? "&" + query : "")).then(function (rows) {
    return Array.isArray(rows) && rows[0] ? rows[0].count : 0;
  });
}

function findByReleaseId(releaseId) {
  return selectOne("select=*&release_id=eq." + encodeURIComponent(releaseId) + "&limit=1");
}

function findByReleaseUrl(releaseUrl) {
  return selectOne("select=*&release_url=eq." + encodeURIComponent(releaseUrl) + "&limit=1");
}

function findUnrefined(limit) {
  return select("select=*&categorization_status=eq.categorized&refinement_status=eq.pending&order=created_at.asc&limit=" + (limit || 20));
}

module.exports = {
  TABLE: TABLE,
  insert: insert,
  upsertByReleaseId: upsertByReleaseId,
  upsertByReleaseUrl: upsertByReleaseUrl,
  update: update,
  select: select,
  selectOne: selectOne,
  count: count,
  findByReleaseId: findByReleaseId,
  findByReleaseUrl: findByReleaseUrl,
  findUnrefined: findUnrefined
};
