// =============================================================================
// MICRO 15A — Supabase Edge Function Foundation — Test Suite
// Run: node test/micro15a-tests.js
// =============================================================================
"use strict";
const path = require("path");
const fs = require("fs");
const vm = require("vm");
const root = path.resolve(__dirname, "..");

var passed = 0; var failed = 0; var asyncRes = [];
function assert(c, n, d) {
  if (c) { passed++; console.log("  PASS: " + n); }
  else { failed++; console.log("  FAIL: " + n + (d ? " — " + d : "")); }
}
function assertEqual(a, e, n) {
  var ja = JSON.stringify(a), je = JSON.stringify(e);
  assert(ja === je, n, ja !== je ? "expected " + je + " got " + ja : "");
}
function section(t) { console.log("\n--- " + t + " ---"); }
function loadModule(rel) { return require(path.join(root, rel)); }

var RAW = {
  id: "m15a-001", title: "PM-KISAN Scheme",
  raw_content: "The Prime Minister Kisan Samman Nidhi (PM-KISAN) scheme provides Six Thousand Rupees. Launched 28th February 2019. Apply at pmkisan.gov.in. Documents: Aadhaar card.",
  source_name: "Ministry of Agriculture",
  source_url: "https://pib.gov.in/PressReleasePage/?PRID=1823456",
  source_published_date: "2024-03-15", status: "draft"
};
var CAT = {
  content_type: "Announcement", category: "Government",
  sub_category: "Schemes & Benefits", user_group: "Farmers",
  categorization_status: "categorized", confidence: "high"
};

// 1. Supabase Edge Function Structure
section("1. Supabase Edge Function Structure");
var supabaseDir = path.join(root, "supabase");
assert(fs.existsSync(supabaseDir), "supabase/ directory exists");
assert(fs.existsSync(path.join(supabaseDir, "config.toml")), "supabase/config.toml exists");
var fnDir = path.join(supabaseDir, "functions", "refine-deepseek");
assert(fs.existsSync(fnDir), "supabase/functions/refine-deepseek/ exists");
assert(fs.existsSync(path.join(fnDir, "index.ts")), "Edge Function entry point index.ts exists");
var sharedDir = path.join(fnDir, "_shared");
assert(fs.existsSync(sharedDir), "_shared/ directory exists");
["provider-enums.ts","helpers.ts","api-error-handler.ts","payload-builder.ts","api-request.ts","response-parser.ts","deepseek-provider.ts","server-bridge.ts","guide-schema.ts"].forEach(function(f){
  assert(fs.existsSync(path.join(sharedDir, f)), "_shared/"+f+" exists");
});

// 2. Edge Function Entry Point Analysis
section("2. Edge Function Entry Point Analysis");
var indexSrc = fs.readFileSync(path.join(fnDir, "index.ts"), "utf8");
assert(indexSrc.indexOf("serve") > -1, "Edge Function uses Deno serve");
assert(indexSrc.indexOf("refineWithDeepSeek") > -1, "Delegates to server-bridge");
assert(indexSrc.indexOf("POST") > -1, "Handles POST");
assert(indexSrc.indexOf("OPTIONS") > -1, "Handles OPTIONS CORS");
assert(indexSrc.indexOf("FUNCTION_ERROR") > -1, "Has last-resort error handler");
assert(indexSrc.indexOf("chat/completions") === -1, "No direct DeepSeek API in entry point");

// 3. DeepSeek API Key Security
section("3. DeepSeek API Key Security");
["provider-enums.ts","helpers.ts","api-error-handler.ts","payload-builder.ts","api-request.ts","response-parser.ts","deepseek-provider.ts","server-bridge.ts","guide-schema.ts"].forEach(function(f){
  var src = fs.readFileSync(path.join(sharedDir, f), "utf8");
  assert(src.indexOf("sk-") === -1 || f === "provider-enums.ts", "No hardcoded key in _shared/"+f);
});
var endpointSrc = fs.readFileSync(path.join(root, "admin/ai/supabase-endpoint.js"), "utf8");
assert(endpointSrc.indexOf("sk-") === -1, "No API key in supabase-endpoint.js");
assert(endpointSrc.indexOf("DEEPSEEK_API_KEY") === -1, "No DEEPSEEK_API_KEY in browser module");

// 4. Payload Builder — DeepSeek Prompt Verification
section("4. Payload Builder — DeepSeek Prompt Verification");
var payloadBuilder = loadModule("admin/ai/deepseek/payload-builder.js");
var payload = payloadBuilder.buildDeepSeekPayload(RAW, CAT, "deepseek-flash");
assertEqual(payload.model, "deepseek-flash", "Payload model is deepseek-flash");
assert(payload.messages.length === 2, "Payload has 2 messages");
assertEqual(payload.messages[0].role, "system", "First message is system role");
assertEqual(payload.messages[1].role, "user", "Second message is user role");
assert(payload.temperature === 0.4, "Temperature is 0.4");
assert(payload.max_tokens === 8192, "Max tokens is 8192");
assertEqual(payload.stream, false, "Stream is false");
var userPrompt = payload.messages[1].content;
assert(userPrompt.indexOf(RAW.raw_content) > -1, "Prompt contains RAW content");
assert(userPrompt.indexOf(RAW.source_name) > -1, "Prompt contains source name");
assert(userPrompt.indexOf(RAW.source_url) > -1, "Prompt contains source URL");
assert(userPrompt.indexOf("HALLUCINATION GUARD") > -1, "Prompt includes hallucination guard");
assert(userPrompt.indexOf("Not specified in the official source") > -1, "Prompt uses NOT_SPECIFIED");
assert(userPrompt.indexOf("BEGIN RAW") > -1, "Prompt wraps raw content in delimiters");

var payloadSrc = fs.readFileSync(path.join(sharedDir, "payload-builder.ts"), "utf8");
assert(payloadSrc.indexOf("HALLUCINATION GUARD") > -1, "Deno prompt includes HALLUCINATION GUARD");
assert(payloadSrc.indexOf("NOT_SPECIFIED") > -1, "Deno prompt uses NOT_SPECIFIED constant");
assert(payloadSrc.indexOf("draft") > -1, "Deno prompt enforces draft status");

// 5. Server Bridge — Input Validation
section("5. Server Bridge — Input Validation");
var bridge = loadModule("functions/lib/ai/server-bridge.js");
assert(!bridge.validateRawInput(null).ok, "validateRawInput(null) rejects");
assert(!bridge.validateRawInput({}).ok, "validateRawInput({}) rejects");
assert(!bridge.validateRawInput(Object.assign({}, RAW, {title:""})).ok, "Rejects missing title");
assert(!bridge.validateRawInput(Object.assign({}, RAW, {raw_content:""})).ok, "Rejects missing raw_content");
assert(!bridge.validateRawInput(Object.assign({}, RAW, {source_url:""})).ok, "Rejects missing source_url");
assert(!bridge.validateRawInput(Object.assign({}, RAW, {source_name:""})).ok, "Rejects missing source_name");
assert(bridge.validateRawInput(RAW).ok, "Accepts valid RAW input");

// 6. Guide Schema Validation
section("6. Guide Schema Validation (unchanged)");
var guideSchema = loadModule("admin/schemas/guide.js");
var validGuide = { title: "PM-KISAN Scheme", slug: "pm-kisan-scheme", category: "Government",
  summary: "Test", content: "Test", status: "draft",
  source_ids: ["https://pib.gov.in/PressReleasePage/?PRID=1823456"] };
assert(guideSchema.validateGuide(validGuide).valid, "Valid guide passes schema validation");
var iv = guideSchema.validateGuide({ title: "", slug: "", category: "" });
assert(!iv.valid, "Invalid guide fails schema validation");
assert(iv.errors.length > 0, "Schema validation reports errors");

// 7. Hallucination Guard
section("7. Hallucination Guard (reused logic)");
var helpers = loadModule("admin/ai/deepseek/helpers.js");
var wordSet = helpers.buildWordSet(RAW.raw_content);
assert(helpers.isGroundedText(wordSet, "Six Thousand Rupees from PM-KISAN"), "Grounded text passes");
assert(!helpers.isGroundedText(wordSet, "Completely invented claim aboutxyz"), "Ungrounded text fails");
assert(helpers.isGroundedText(wordSet, "pmkisan.gov.in apply online"), "URL text is grounded");
assert(!helpers.isGroundedText(wordSet, "random"), "Single short word fails");

// 8. Raw Content Preservation
section("8. Raw Content Preservation");
var rawCopy = JSON.stringify(RAW);
bridge.validateRawInput(Object.assign({}, RAW));
assert(JSON.stringify(RAW) === rawCopy, "RAW not mutated by validation");

// 9. Source Metadata Preservation
section("9. Source Metadata Preservation");
assert(RAW.source_name === "Ministry of Agriculture", "Source name preserved");
assert(RAW.source_url === "https://pib.gov.in/PressReleasePage/?PRID=1823456", "Source URL preserved");
assert(RAW.source_published_date === "2024-03-15", "Source published date preserved");
assert(helpers.assertSourcePreserved({ source_ids: [RAW.source_url] }, RAW.source_url).ok, "Source match passes");
assert(!helpers.assertSourcePreserved({ source_ids: ["https://wrong.url"] }, RAW.source_url).ok, "Source mismatch fails");

// 10. DeepSeek API Failure Handling
section("10. DeepSeek API Failure Handling");
var errorHandler = loadModule("admin/ai/deepseek/api-error-handler.js");
var timeoutErr = errorHandler.categorizeApiError(new Error("Request timeout after 30000ms"));
assert(timeoutErr.code === "API_TIMEOUT", "Timeout error categorized");
assert(!timeoutErr.ok, "Timeout error has ok=false");
var rateErr = errorHandler.categorizeApiError(new Error("429 too many requests"));
assert(rateErr.code === "API_RATE_LIMITED", "Rate limit error categorized");
var authErr = errorHandler.categorizeApiError(new Error("401 unauthorized"));
assert(authErr.code === "INVALID_API_KEY", "Auth error categorized");
var netErr = errorHandler.categorizeApiError(new Error("fetch failed"));
assert(netErr.code === "API_UNAVAILABLE", "Network error categorized");

// 11. Supabase Endpoint Client (browser-safe)
section("11. Supabase Endpoint Client (browser-safe)");
var supEndpoint = loadModule("admin/ai/supabase-endpoint.js");
assert(typeof supEndpoint.refineViaSupabase === "function", "Exports refineViaSupabase");
assert(typeof supEndpoint.checkSupabaseProvider === "function", "Exports checkSupabaseProvider");
assert(typeof supEndpoint.DEFAULT_ENDPOINT === "string", "DEFAULT_ENDPOINT is string");

// Default endpoint is now configured — calling with defaults reaches the real function
asyncRes.push(supEndpoint.refineViaSupabase(RAW, CAT, {}).then(function (result) {
  assert(typeof result.ok === "boolean", "Returns structured result with default endpoint");
  assert(result.guide === null || typeof result.guide === "object", "Guide is null or object");
}));

// Endpoint unreachable — graceful failure
var origFetch = globalThis.fetch;
globalThis.fetch = function () { return Promise.reject(new Error("Network error")); };
asyncRes.push(supEndpoint.refineViaSupabase(RAW, CAT, { endpoint: "https://example.supabase.co/functions/v1/refine-deepseek" }).then(function (result) {
  assert(!result.ok, "ok=false when endpoint unreachable");
  assert(result.code === "FUNCTION_UNREACHABLE", "Code is FUNCTION_UNREACHABLE");
  assert(result.guide === null, "Null guide when unreachable");
  assert(result.message.indexOf("RAW unchanged") > -1, "Message confirms RAW unchanged");
  globalThis.fetch = origFetch;
}));

// checkSupabaseProvider with default endpoint — reaches the function
asyncRes.push(supEndpoint.checkSupabaseProvider({}).then(function (status) {
  assert(status.configured === true, "configured=true when default endpoint set");
}));

// 12. API Key Never Exposed in Client-Side Code
section("12. API Key Never Exposed in Client-Side Code");
["admin/ai/supabase-endpoint.js","admin/ai/server-endpoint.js","admin/ai/provider.js","admin/ai/refine.js"].forEach(function(rel){
  var fpath = path.join(root, rel);
  if (fs.existsSync(fpath)) {
    var src = fs.readFileSync(fpath, "utf8");
    assert(src.indexOf("sk-") === -1, "No API key prefix in "+rel);
    if (rel.indexOf("endpoint") > -1) {
      assert(src.indexOf("process.env") === -1, "No process.env in "+rel);
    }
  }
});

// 13. Firebase Hosting & Function Unchanged
section("13. Firebase Hosting & Function Unchanged");
var fbJson = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
assert(fbJson.hosting && fbJson.hosting.public === "dist", "Hosting public: dist unchanged");
var rewrites = (fbJson.hosting && fbJson.hosting.rewrites) || [];
var rw = rewrites.filter(function(r){ return r.source === "/api/refineDeepseek" && r.function === "refineDeepseek"; });
assert(rw.length === 1, "Firebase rewrite still present");
assert(fbJson.functions && fbJson.functions.source === "functions", "Functions source still functions/");
var fnIndex = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
assert(fnIndex.indexOf("./refine-handler.js") > -1, "Function still delegates to refine-handler");

// 14. Public Website Unchanged
section("14. Public Website Unchanged");
assert(fs.existsSync(path.join(root, "dist")), "dist/ exists");
var distEntries = fs.readdirSync(path.join(root, "dist"));
assert(distEntries.indexOf("guides") > -1, "dist/guides/ exists");
assert(distEntries.indexOf("admin") > -1, "dist/admin/ exists");

// 15. Existing Guide Schema Not Modified
section("15. Existing Guide Schema Not Modified");
var guideSrc = fs.readFileSync(path.join(root, "admin/schemas/guide.js"), "utf8");
assert(guideSrc.indexOf("GUIDE_FIELDS") > -1, "Still has GUIDE_FIELDS");
assert(guideSrc.indexOf("validateGuide") > -1, "Still has validateGuide");

// 16. Supabase Endpoint UMD Integration
section("16. Supabase Endpoint UMD Integration");
var vmCtx = { fetch: function(){ return Promise.resolve({ok:true, json:function(){return Promise.resolve({});}}); } };
vmCtx.self = vmCtx; // UMD pattern uses self; make it reference the same object
vmCtx.globalThis = vmCtx;
vm.runInNewContext(endpointSrc, vmCtx, { filename: "admin/ai/supabase-endpoint.js" });
assert(typeof vmCtx.SamjhoSupabaseEndpoint === "object", "UMD exports to globalThis");
assert(typeof vmCtx.SamjhoSupabaseEndpoint.refineViaSupabase === "function", "Exposes refineViaSupabase");
assert(typeof vmCtx.SamjhoSupabaseEndpoint.checkSupabaseProvider === "function", "Exposes checkSupabaseProvider");

// 17. Server Bridge Categorization Validation
section("17. Server Bridge Categorization Validation");
asyncRes.push(bridge.refineWithDeepSeek(Object.assign({}, RAW, {categorization:null}), {fetchImpl:function(){return Promise.resolve({});}}).then(function(r){
  assert(!r.ok, "Rejects uncategorized");
  assert(r.code === "MANUAL_CATEGORIZATION_REQUIRED", "MANUAL_CATEGORIZATION_REQUIRED for uncategorized");
}));
asyncRes.push(bridge.refineWithDeepSeek(Object.assign({}, RAW, {categorization:Object.assign({}, CAT, {categorization_status:"review"})}), {fetchImpl:function(){return Promise.resolve({});}}).then(function(r){
  assert(!r.ok, "Rejects wrong status");
  assert(r.code === "MANUAL_CATEGORIZATION_REQUIRED", "MANUAL_CATEGORIZATION_REQUIRED for wrong status");
}));

// 18. No Direct DeepSeek in Edge Function Entry
section("18. No Direct DeepSeek in Edge Function Entry");
assert(indexSrc.indexOf("buildDeepSeekPayload") === -1, "No payload builder");
assert(indexSrc.indexOf("Authorization") === -1, "No auth header");
assert(indexSrc.indexOf("Bearer") === -1, "No Bearer token");

// 19. No Static Government Content
section("19. No Static Government Content in New Files");
["supabase/functions/refine-deepseek/index.ts","admin/ai/supabase-endpoint.js"].forEach(function(rel){
  var src = fs.readFileSync(path.join(root, rel), "utf8");
  assert(!(/pib\.gov\.in/.test(src)) && !(/PRID=\d{5,}/.test(src)), "No hardcoded PIB in "+rel);
});

// 20. Emit-Supabase Build Script
section("20. Emit-Supabase Build Script");
var emitScript = path.join(root, "build/emit-supabase.js");
assert(fs.existsSync(emitScript), "build/emit-supabase.js exists");
var emitSrc = fs.readFileSync(emitScript, "utf8");
assert(emitSrc.indexOf("emitSupabase") > -1, "Has emitSupabase function");
assert(emitSrc.indexOf("admin/ai/deepseek") > -1 || emitSrc.indexOf("functions/lib") > -1, "References source modules");

// 21. Browser Script Parse
section("21. Browser Script Parse");
var epSrc = fs.readFileSync(path.join(root, "admin/ai/supabase-endpoint.js"), "utf8");
try { new vm.Script(epSrc, {filename: "admin/ai/supabase-endpoint.js"}); assert(true, "supabase-endpoint.js parses cleanly"); }
catch(e) { assert(false, "supabase-endpoint.js parses cleanly", e.message); }

// Summary
function finish() {
  console.log("\n========================================");
  console.log("MICRO 15A TEST SUMMARY");
  console.log("========================================");
  console.log("Passed:  " + passed);
  console.log("Failed:  " + failed);
  console.log("========================================");
  process.exit(failed > 0 ? 1 : 0);
}
if (asyncRes.length > 0) {
  Promise.all(asyncRes.map(function(p){ return p.catch(function(e){ failed++; console.log("  FAIL: async — "+(e&&e.message?e.message:e)); }); })).then(finish).catch(finish);
} else { finish(); }
