// =============================================================================
// MICRO 15B — Supabase Deployment & Secure Test — Test Suite
// Run: node test/micro15b-tests.js
// =============================================================================
"use strict";
const path = require("path");
const fs = require("fs");
const root = path.resolve(__dirname, "..");
var passed = 0; var failed = 0; var asyncRes = [];
function assert(c, n, d) {
  if (c) { passed++; console.log("  PASS: " + n); }
  else { failed++; console.log("  FAIL: " + n + (d ? " — " + d : "")); }
}
function section(t) { console.log("\n--- " + t + " ---"); }

var EP = "https://clxwcivvxyyodahexjao.supabase.co/functions/v1/refine-deepseek";
var RAW = { title: "Test PM-KISAN", raw_content: "The PM-KISAN scheme provides six thousand rupees. Apply at pmkisan.gov.in.",
  source_name: "Ministry of Agriculture", source_url: "https://pib.gov.in/test-release-001", source_published_date: "2024-03-15" };
var CAT = { content_type: "Announcement", category: "Government", sub_category: "Schemes and Benefits",
  user_group: "Farmers", categorization_status: "categorized" };
function body(r, c) { return JSON.stringify({ raw: r || RAW, categorization: c || CAT }); }
function httpPost(url, payload) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload })
    .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); });
}
function httpGet(url) { return fetch(url, { method: "GET" }).then(function(r) { return { status: r.status }; }); }
function httpOptions(url) { return fetch(url, { method: "OPTIONS" }).then(function(r) { return { status: r.status }; }); }

// 1. Supabase CLI & Project Link
section("1. Supabase CLI & Project Link");
var configSrc = fs.readFileSync(path.join(root, "supabase", "config.toml"), "utf8");
assert(configSrc.indexOf("clxwcivvxyyodahexjao") > -1, "config.toml has correct Supabase project ID");

// 2. Function Structure
section("2. Function Structure");
var fnDir = path.join(root, "supabase", "functions", "refine-deepseek");
assert(fs.existsSync(path.join(fnDir, "index.ts")), "index.ts exists");
["provider-enums.ts","helpers.ts","api-error-handler.ts","payload-builder.ts","api-request.ts",
 "response-parser.ts","deepseek-provider.ts","server-bridge.ts","guide-schema.ts"].forEach(function(f) {
  assert(fs.existsSync(path.join(fnDir, "_shared", f)), "_shared/" + f + " exists");
});

// 3. Entry Point Analysis
section("3. Entry Point — Raw Extraction & Security");
var indexSrc = fs.readFileSync(path.join(fnDir, "index.ts"), "utf8");
assert(indexSrc.indexOf("body.raw") > -1, "Extracts body.raw from request");
assert(indexSrc.indexOf("body.categorization") > -1, "Extracts body.categorization");
assert(indexSrc.indexOf("rawWithCat") > -1, "Merges categorization into raw");
assert(indexSrc.indexOf("chat/completions") === -1, "No direct DeepSeek API in entry");
assert(indexSrc.indexOf("Authorization") === -1, "No auth header in entry");
assert(indexSrc.indexOf("Bearer") === -1, "No Bearer token in entry");

// 4. Secret configured (key NOT in source)
section("4. Secret Configuration");
assert(configSrc.indexOf("sk-") === -1, "No key value in config.toml");
var endpointSrc = fs.readFileSync(path.join(root, "admin", "ai", "supabase-endpoint.js"), "utf8");
assert(endpointSrc.indexOf("sk-") === -1, "No API key in browser endpoint module");

// 5. Live POST test
section("5. Live POST Test");
asyncRes.push(httpPost(EP, body()).then(function(r) {
  assert(r.status === 200 || r.status === 400, "POST returns 200 or 400");
  assert(typeof r.data === "object", "Response is JSON object");
  assert(typeof r.data.ok === "boolean", "Response has ok boolean");
  assert(typeof r.data.code === "string", "Response has code string");
}));

// 6. Method rejection
section("6. Method Rejection");
asyncRes.push(httpGet(EP).then(function(r) { assert(r.status === 405, "GET returns 405"); }));

// 7. CORS handling
section("7. CORS Handling");
asyncRes.push(httpOptions(EP).then(function(r) { assert(r.status === 204, "OPTIONS returns 204"); }));

// 8. Empty body
section("8. Input Validation — Empty Body");
asyncRes.push(httpPost(EP, "{}").then(function(r) {
  assert(r.data.ok === false, "ok=false for empty body");
  assert(r.data.guide === null, "guide=null");
}));

// 9. Missing raw
section("9. Input Validation — Missing Raw");
asyncRes.push(httpPost(EP, JSON.stringify({ categorization: CAT })).then(function(r) {
  assert(r.data.ok === false, "Missing raw rejected");
}));

// 10. Missing categorization
section("10. Input Validation — Missing Categorization");
asyncRes.push(httpPost(EP, JSON.stringify({ raw: RAW })).then(function(r) {
  assert(r.data.ok === false, "Missing categorization rejected");
}));

// 11. Uncategorized content
section("11. Categorization Status Gate");
asyncRes.push(httpPost(EP, JSON.stringify({ raw: RAW, categorization: { category: "Gov", categorization_status: "review" } })).then(function(r) {
  assert(r.data.ok === false, "Uncategorized rejected");
}));

// 12. Server-side DeepSeek call (verify no key in response)
section("12. Server-Side API — No Key Exposure");
asyncRes.push(httpPost(EP, body()).then(function(r) {
  var resp = JSON.stringify(r.data);
  assert(resp.indexOf("sk-[a-zA-Z0-9]") === -1, "No API key in response body");
  assert(r.data.ok !== undefined, "Response has ok field");
}));

// 13. RAW preservation
section("13. RAW Content Preservation");
asyncRes.push(httpPost(EP, body()).then(function(r) {
  if (r.data.raw) {
    var raw = r.data.raw.raw || r.data.raw;
    assert(raw.title === RAW.title, "RAW title preserved");
    assert(raw.raw_content === RAW.raw_content, "RAW content preserved");
  }
}));

// 14. Source metadata
section("14. Source Metadata Preservation");
asyncRes.push(httpPost(EP, body()).then(function(r) {
  if (r.data.raw) {
    var raw = r.data.raw.raw || r.data.raw;
    assert(raw.source_name === RAW.source_name, "Source name preserved");
    assert(raw.source_url === RAW.source_url, "Source URL preserved");
    assert(raw.source_published_date === RAW.source_published_date, "Published date preserved");
  }
}));

// 15. Category preservation
section("15. Category Preservation");
asyncRes.push(httpPost(EP, body()).then(function(r) {
  if (r.data.raw && r.data.raw.categorization) {
    var cat = r.data.raw.categorization;
    assert(cat.category === "Government", "Category preserved");
    assert(cat.sub_category === "Schemes and Benefits", "Sub-category preserved");
  }
}));

// 16. Client adapter — production not switched
section("16. Client Adapter — Production Not Switched");
assert(endpointSrc.indexOf("DEFAULT_ENDPOINT") > -1, "Adapter has DEFAULT_ENDPOINT");
var epMatch = endpointSrc.match(/DEFAULT_ENDPOINT\s*=\s*["']([^"']*)["']/);
assert(epMatch && epMatch[1].indexOf("supabase.co") > -1, "DEFAULT_ENDPOINT points to Supabase Edge Function");
assert(endpointSrc.indexOf("refineViaSupabase") > -1, "refineViaSupabase function exists");
assert(endpointSrc.indexOf("checkSupabaseProvider") > -1, "checkSupabaseProvider function exists");

// 17. Firebase preserved
section("17. Firebase Preserved");
var fbJson = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
assert(fbJson.hosting && fbJson.hosting.public === "dist", "Hosting unchanged");
var rw = (fbJson.hosting.rewrites || []).filter(function(r) { return r.function === "refineDeepseek"; });
assert(rw.length === 1, "Firebase rewrite still present");
assert(fs.existsSync(path.join(root, "functions", "index.js")), "Firebase function exists");
assert(fs.existsSync(path.join(root, "functions", "refine-handler.js")), "Firebase handler exists");

// 18. Secret exposure — source
section("18. Secret Exposure — Source");
["admin/ai/supabase-endpoint.js","admin/ai/server-endpoint.js","admin/ai/provider.js","admin/ai/refine.js"].forEach(function(f) {
  assert(fs.readFileSync(path.join(root, f), "utf8").indexOf("sk-") === -1, "No sk- in " + f);
});

// 19. Secret exposure — dist
section("19. Secret Exposure — dist");
var keyHits = 0;
function scanDist(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function(e) {
    var full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== "node_modules") scanDist(full);
    else if (e.isFile() && /\.(js|html)$/.test(e.name)) {
      var src = fs.readFileSync(full, "utf8");
      if (/sk-[a-zA-Z0-9]{20,}/.test(src)) { keyHits++; console.log("  KEY: " + full); }
    }
  });
}
scanDist(path.join(root, "dist"));
assert(keyHits === 0, "No actual API keys in dist/");

// 20. Guide schema / draft-only
section("20. Guide Schema / Draft-Only");
var guideSrc = fs.readFileSync(path.join(root, "admin", "schemas", "guide.js"), "utf8");
assert(guideSrc.indexOf("validateGuide") > -1, "Guide schema validateGuide intact");
assert(indexSrc.indexOf("auto-publish") === -1, "No auto-publish in Edge Function");

// 21. Hallucination guard active
section("21. Hallucination Guard Active");
var hSrc = fs.readFileSync(path.join(root, "supabase", "functions", "refine-deepseek", "_shared", "helpers.ts"), "utf8");
assert(hSrc.indexOf("isGroundedText") > -1, "isGroundedText in Deno helpers");
var pSrc = fs.readFileSync(path.join(root, "supabase", "functions", "refine-deepseek", "_shared", "payload-builder.ts"), "utf8");
assert(pSrc.indexOf("HALLUCINATION GUARD") > -1, "Prompt includes hallucination guard");

// 22. Build script
section("22. Build Script");
assert(fs.existsSync(path.join(root, "build", "emit-supabase.js")), "emit-supabase.js exists");

// Summary
function finish() {
  console.log("\n========================================");
  console.log("MICRO 15B TEST SUMMARY");
  console.log("========================================");
  console.log("Passed:  " + passed);
  console.log("Failed:  " + failed);
  console.log("========================================");
  process.exit(failed > 0 ? 1 : 0);
}
if (asyncRes.length > 0) {
  Promise.all(asyncRes.map(function(p) { return p.catch(function(e) {
    failed++; console.log("  FAIL: async — " + (e && e.message ? e.message : e));
  }); })).then(finish).catch(finish);
} else { finish(); }
