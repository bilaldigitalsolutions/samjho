// =============================================================================
// MICRO 14 — Secure Firebase Cloud Function for DeepSeek — Test Suite
// =============================================================================
// Run: node test/micro14-tests.js
// Tests the secure boundary: request validation -> existing Micro 13 bridge
// -> DeepSeek (transport injected; no network, no real key).
// The function core is pure (no firebase-functions import) so it runs in Node.
// =============================================================================
"use strict";
const path = require("path");
const fs = require("fs");
const vm = require("vm");
const root = path.resolve(__dirname, "..");
var passed = 0; var failed = 0;
var asyncRes14 = [];
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
function clearCache(ps) {
  Object.keys(require.cache).forEach(function (k) {
    if (ps.some(function (p) { return k.indexOf(p) > -1; })) { delete require.cache[k]; }
  });
}
function withTimeout(p, ms, name) {
  return Promise.race([
    Promise.resolve(p),
    new Promise(function (_, rej) { setTimeout(function () { rej(new Error("test timeout: " + name)); }, ms); })
  ]);
}

// A valid categorized RAW item (TEST DATA ONLY, never production input).
var RAW = {
  id: "m14-001", title: "PM-KISAN Scheme",
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

// Schema-valid, RAW-grounded DeepSeek completion used by the mocked transport.
function groundedGuide(ov) {
  var base = {
    title: "PM-KISAN Scheme", slug: "pm-kisan-scheme", category: "Government",
    summary: "PM-KISAN provides Six Thousand Rupees to farmers.",
    content: "Apply at pmkisan.gov.in with an Aadhaar card.",
    eligibility: ["Aadhaar card"], benefits: ["Six Thousand Rupees"],
    required_documents: ["Aadhaar card"],
    application_process: ["Register", "Verify"],
    important_dates: ["28th February 2019"], common_mistakes: [],
    faqs: [{ q: "Amount?", a: "Six Thousand" }],
    source_ids: [RAW.source_url], status: "draft", last_updated: "2024-03-16"
  };
  return Object.assign(base, ov || {});
}
function completion(g) {
  return { id: "c1", object: "chat.completion", model: "deepseek-flash",
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(g) }, finish_reason: "stop" }] };
}
function fakeFetch(status, body, opts) {
  opts = opts || {};
  return function (url, init) {
    if (opts.throwError) return Promise.reject(new Error(opts.throwError));
    var h = (init && init.headers) || {};
    fakeFetch.lastUrl = url; fakeFetch.lastAuth = h.Authorization || h.authorization || "";
    return Promise.resolve({ ok: status >= 200 && status < 300, status: status,
      statusText: String(status), json: function () { return Promise.resolve(body); } });
  };
}
function body(raw, cat) { return { raw: raw, categorization: cat }; }


// ---------------------------------------------------------------------------
// Load the pure function handler. It requires ./lib/ai/server-bridge.js which
// requires ./deepseek.js — the cache keys differ from admin/ai/*. Each section
// re-loads with the right env and injects a mocked transport into the LIB copy.
// ---------------------------------------------------------------------------
var LIB = "functions/lib/ai";
function freshHandler() { return loadModule("functions/refine-handler.js"); }
// Inject a mocked transport into the LIB copy of deepseek.js for this call.
function mockLibProvide(fetchImpl) {
  var p = path.join(root, "functions/lib/ai/deepseek.js");
  var mod = require(p);
  var original = mod.provide.__original || mod.provide;
  var wrapped = function (raw, options) {
    options = options || {};
    options.fetchImpl = fetchImpl;
    return original.call(mod, raw, options);
  };
  wrapped.__original = original;
  require.cache[p].exports.provide = wrapped;
}

section("1. Request validation (requirement 9/10)");
(function () {
  var r;
  r = handler_validate(null);
  assert(!r.ok && r.httpStatus === 400 && r.result.code === "INVALID_REQUEST", "null body rejected");
  r = handler_validate({});
  assert(!r.ok && r.result.code === "INVALID_REQUEST", "empty body rejected");
  r = handler_validate({ raw: {} });
  assert(!r.ok, "missing raw rejected");
  r = handler_validate(body(Object.assign({}, RAW, { raw_content: "" }), CAT));
  assert(!r.ok && r.result.code === "INVALID_REQUEST", "missing raw_content rejected");
  r = handler_validate(body(Object.assign({}, RAW, { source_url: "" }), CAT));
  assert(!r.ok && r.result.message.indexOf("source_url") > -1, "missing source_url rejected");
  r = handler_validate(body(RAW, null));
  assert(!r.ok && r.result.code === "MANUAL_CATEGORIZATION_REQUIRED", "missing categorization rejected");
  r = handler_validate(body(RAW, Object.assign({}, CAT, { categorization_status: "needs_manual_categorization" })));
  assert(!r.ok && r.result.code === "MANUAL_CATEGORIZATION_REQUIRED", "uncategorized status rejected");
  r = handler_validate(body(RAW, Object.assign({}, CAT, { category: "" })));
  assert(!r.ok && r.result.message.indexOf("category") > -1, "missing category rejected");
  r = handler_validate(body(RAW, Object.assign({}, CAT, { content_type: "" })));
  assert(!r.ok && r.result.message.indexOf("content_type") > -1, "missing content_type rejected");
  r = handler_validate(body(RAW, Object.assign({}, CAT, { user_group: "" })));
  assert(r.ok, "empty user_group accepted (optional)");
  r = handler_validate(body(Object.assign({}, RAW, { source_published_date: "" }), CAT));
  assert(r.ok, "empty official date accepted (preserved as-is, never faked)");
  function handler_validate(b) {
    delete process.env.DEEPSEEK_API_KEY;
    clearCache([LIB]);
    var h = freshHandler();
    return h.validateRequest(b);
  }
})();

section("2. Missing API configuration (server-side)");
delete process.env.DEEPSEEK_API_KEY;
clearCache([LIB]);
var h2 = freshHandler();
asyncRes14.push(withTimeout(h2.handleRefineRequest(body(RAW, CAT)), 5000, "no-key").then(function (h) {
  assert(h.httpStatus === 200, "no-key returns HTTP 200 with structured error");
  assert(!h.result.ok && h.result.code === "PROVIDER_DISABLED", "no-key -> PROVIDER_DISABLED");
  assert(h.result.guide === null, "no fake draft on missing configuration");
  assert(String(h.result.message).indexOf("RAW unchanged") > -1, "clear safe message on missing configuration");
}));

section("3. Full secure flow: valid request -> DeepSeek -> schema-valid draft");
process.env.DEEPSEEK_API_KEY = "test-key-not-a-real-secret";
clearCache([LIB]);
var h3 = freshHandler();
mockLibProvide(fakeFetch(200, completion(groundedGuide())));
asyncRes14.push(withTimeout(h3.handleRefineRequest(body(RAW, CAT)), 8000, "valid").then(function (h) {
  var r = h.result;
  assert(h.httpStatus === 200 && r.ok === true, "valid request returns ok");
  assert(r.code === "OK", "structured success code OK");
  assert(r.provider === "deepseek", "provider is deepseek");
  assert(r.guide && r.guide.status === "draft", "result is status=draft");
  assert(r.guide.title === "PM-KISAN Scheme", "guide title preserved");
  assert(r.guide.category === "Government", "category preserved");
  assert(Array.isArray(r.guide.source_ids) && r.guide.source_ids[0] === RAW.source_url, "official source URL preserved");
  assert(fakeFetch.lastUrl.indexOf("api.deepseek.com") > -1, "server called api.deepseek.com (server-side only)");
  assert(fakeFetch.lastAuth === "Bearer test-key-not-a-real-secret", "Bearer key used server-side only");
  assert(loadModule("admin/schemas/index.js").guide.validateGuide(r.guide).valid === true,
    "guide passes EXISTING Guide schema");
  assert(JSON.stringify(r).indexOf("test-key-not-a-real-secret") === -1, "API key never appears in the response");
}));

section("4. Metadata preservation through the function");
mockLibProvide(fakeFetch(200, completion(groundedGuide())));
asyncRes14.push(withTimeout(h3.handleRefineRequest(body(RAW, CAT)), 8000, "meta").then(function (h) {
  var r = h.result;
  assert(r.raw.raw_content === RAW.raw_content, "RAW content unchanged");
  assert(r.raw.source_name === RAW.source_name, "source name preserved");
  assert(r.raw.source_url === RAW.source_url, "source URL preserved");
  assert(r.raw.source_published_date === RAW.source_published_date, "official published date preserved");
  assert(r.raw.categorization.category === "Government", "category preserved in metadata");
  assert(r.raw.categorization.sub_category === "Schemes & Benefits", "sub-category preserved");
  assert(r.raw.categorization.user_group === "Farmers", "user group preserved");
  assert(r.raw.categorization.content_type === "Announcement", "content type preserved");
}));


section("5. Provider failure / malformed response / schema failure");
// Malformed JSON from the provider
mockLibProvide(fakeFetch(200, { choices: [{ message: { content: "not json {broken" } }] }));
asyncRes14.push(withTimeout(h3.handleRefineRequest(body(RAW, CAT)), 8000, "malformed").then(function (h) {
  assert(!h.result.ok, "malformed provider response rejected");
  assert(h.result.guide === null, "no draft on malformed response");
  assert(h.result.code === "MALFORMED_OUTPUT", "malformed -> MALFORMED_OUTPUT");
}));
// Provider network failure
mockLibProvide(fakeFetch(0, null, { throwError: "fetch failed ENOTFOUND" }));
asyncRes14.push(withTimeout(h3.handleRefineRequest(body(RAW, CAT)), 8000, "netfail").then(function (h) {
  assert(!h.result.ok && h.result.code === "API_UNAVAILABLE", "provider unavailable -> API_UNAVAILABLE");
  assert(h.result.guide === null, "no draft on provider failure");
}));
// Rate limit
mockLibProvide(fakeFetch(429, { error: { code: "429", message: "Rate limit reached" } }));
asyncRes14.push(withTimeout(h3.handleRefineRequest(body(RAW, CAT)), 8000, "rate").then(function (h) {
  assert(!h.result.ok && h.result.code === "API_RATE_LIMITED", "rate limit -> API_RATE_LIMITED");
}));
// Invalid API key
mockLibProvide(fakeFetch(401, { error: { code: "401", message: "Authentication Fails" } }));
asyncRes14.push(withTimeout(h3.handleRefineRequest(body(RAW, CAT)), 8000, "auth").then(function (h) {
  assert(!h.result.ok && h.result.code === "INVALID_API_KEY", "invalid API key -> INVALID_API_KEY");
}));
// Timeout
var hangFetch = function (url, init) {
  return new Promise(function (resolve, reject) {
    if (init && init.signal && typeof init.signal.addEventListener === "function") {
      init.signal.addEventListener("abort", function () { reject(new Error("Request timeout after 20ms")); });
    }
  });
};
mockLibProvide(hangFetch);
asyncRes14.push(withTimeout(h3.handleRefineRequest(body(RAW, CAT), { timeoutMs: 20 }), 8000, "timeout").then(function (h) {
  assert(!h.result.ok && h.result.code === "API_TIMEOUT", "timeout -> API_TIMEOUT");
}));
// Schema validation failure (empty title from the model)
mockLibProvide(fakeFetch(200, completion(groundedGuide({ title: "" }))));
asyncRes14.push(withTimeout(h3.handleRefineRequest(body(RAW, CAT)), 8000, "schema").then(function (h) {
  assert(!h.result.ok, "schema-invalid output rejected");
  assert(h.result.guide === null, "no draft on schema validation failure");
  assert(h.result.code === "GUIDE_SCHEMA_VALIDATION_FAILED" || h.result.code === "INVALID_GUIDE_OUTPUT",
    "schema failure -> clear schema error code");
}));
// Model claims published -> rejected (draft-only)
mockLibProvide(fakeFetch(200, completion(groundedGuide({ status: "published" }))));
asyncRes14.push(withTimeout(h3.handleRefineRequest(body(RAW, CAT)), 8000, "sneaky").then(function (h) {
  assert(!h.result.ok, "model claiming 'published' is rejected (must stay draft)");
}));

section("6. Verbatim copies are byte-identical to the originals");
var emitFunctions = loadModule("build/emit-functions.js");
emitFunctions.COPY_MAP.forEach(function (pair) {
  var a = fs.readFileSync(path.join(root, pair[0]));
  var b = fs.readFileSync(path.join(root, "functions", pair[1]));
  assert(a.equals(b), "verbatim: " + pair[0]);
});

section("7. Browser build output: no key, no secret, no direct DeepSeek call");
var distProvider = path.join(root, "dist/admin/ai/provider.js");
var secretHits = [];
var deepseekUrlHits = [];
function scanDist(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { scanDist(full); continue; }
    if (!entry.name.endsWith(".js") && !entry.name.endsWith(".html")) continue;
    const src = fs.readFileSync(full, "utf8");
    if (/sk-[A-Za-z0-9_-]{12,}/.test(src) || /Bearer\s+[A-Za-z0-9_-]{12,}/.test(src)) {
      secretHits.push(full);
    }
    if (entry.name.indexOf("admin") > -1 && /api\.deepseek\.com|chat\/completions/.test(src)) {
      deepseekUrlHits.push(full);
    }
  }
}
if (!fs.existsSync(distProvider)) {
  assert(false, "dist/ present for scanning", "run node build/build.js first");
} else {
  scanDist(path.join(root, "dist"));
  assert(secretHits.length === 0, "dist/ contains no API key value / secret");
  assert(deepseekUrlHits.length === 0, "browser build never calls api.deepseek.com directly");
  assert(!fs.existsSync(path.join(root, "dist/admin/ai/server-bridge.js")), "server-bridge NOT in dist/");
  assert(!fs.existsSync(path.join(root, "dist/admin/ai/deepseek.js")), "deepseek.js NOT in dist/");
  assert(fs.existsSync(path.join(root, "dist/admin/ai/server-endpoint.js")), "server-endpoint client IS in dist/");
}

section("8. Browser client: server-endpoint.js (browser-safe)");
(function () {
  var epSrc = fs.readFileSync(path.join(root, "admin/ai/server-endpoint.js"), "utf8");
  assert(epSrc.indexOf("api.deepseek.com") === -1, "server-endpoint.js never references api.deepseek.com");
  assert(epSrc.indexOf("DEEPSEEK_API_KEY") === -1, "server-endpoint.js never references the key");
  assert(epSrc.indexOf("/api/refineDeepseek") > -1, "server-endpoint.js posts to the Cloud Function rewrite");
  var calls = [];
  var sandbox = {
    console: console,
    fetch: function (url, init) {
      calls.push({ url: url, init: init });
      return Promise.resolve({ status: 200, json: function () {
        return Promise.resolve({ ok: true, code: "OK", guide: { status: "draft" } });
      } });
    }
  };
  vm.createContext(sandbox);
  new vm.Script(epSrc, { filename: "server-endpoint.js" }).runInContext(sandbox);
  var ep = sandbox.SamjhoServerEndpoint;
  assert(typeof ep.refineViaServer === "function", "server-endpoint exposes refineViaServer");
  var rawCopy = Object.assign({}, RAW);
  asyncRes14.push(withTimeout(
    ep.refineViaServer(rawCopy, CAT, { endpoint: "https://example.test/api/refineDeepseek" }),
    5000, "endpoint").then(function (r) {
    assert(r.ok === true && r.guide.status === "draft", "server-endpoint returns the structured result");
    assert(calls[0].url === "https://example.test/api/refineDeepseek", "browser calls only the function URL");
    assert(calls[0].init.method === "POST", "uses POST");
    var sent = JSON.parse(calls[0].init.body);
    assert(sent.raw.raw_content === RAW.raw_content, "browser sends RAW content to the function");
    assert(sent.categorization.category === "Government", "browser sends categorization to the function");
    assert(JSON.stringify(sent).indexOf("test-key-not-a-real-secret") === -1, "browser never sends any API key");
    assert(rawCopy.raw_content === RAW.raw_content, "RAW unchanged by the client call");
  }));
})();



section("9. Firebase config files");
var fbJson = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
assert(fbJson.functions && fbJson.functions.source === "functions", "firebase.json declares functions source");
var rewrites = (fbJson.hosting && fbJson.hosting.rewrites) || [];
var rw = rewrites.filter(function (r) { return r.source === "/api/refineDeepseek" && r.function === "refineDeepseek"; });
assert(rw.length === 1, "hosting rewrite /api/refineDeepseek -> function");
var fnPkg = JSON.parse(fs.readFileSync(path.join(root, "functions/package.json"), "utf8"));
assert(fnPkg.dependencies && fnPkg.dependencies["firebase-functions"], "functions/package.json declares firebase-functions");
assert(fnPkg.main === "index.js", "functions entry is index.js");
var fnIndex = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
assert(fnIndex.indexOf("functions.config()") > -1 || fnIndex.indexOf("functions:secrets:set") > -1,
  "function reads key from Firebase config/secrets (server-side only)");
assert(fnIndex.indexOf("./refine-handler.js") > -1, "function delegates to the pure handler (no duplicated logic)");
assert(fnIndex.indexOf("chat/completions") === -1, "function wrapper contains no direct DeepSeek API logic");
var firebaserc = JSON.parse(fs.readFileSync(path.join(root, ".firebaserc"), "utf8"));
assert(firebaserc.projects && firebaserc.projects.default === "samjho-96e3a", ".firebaserc still targets samjho-96e3a");

section("10. Structural flow: RAW -> CATEGORY -> FUNCTION -> DEEPSEEK -> DRAFT");
mockLibProvide(fakeFetch(200, completion(groundedGuide())));
asyncRes14.push(withTimeout(h3.handleRefineRequest(body(RAW, CAT)), 8000, "flow").then(function (h) {
  var r = h.result;
  assert(r.ok && r.guide && r.guide.status === "draft", "DRAFT stage reached through the function");
  assert(r.provider === "deepseek", "DEEPSEEK stage executed");
  assert(r.raw.categorization.categorization_status === "categorized", "CATEGORY stage preserved");
  assert(r.raw.raw_content === RAW.raw_content, "RAW stage preserved");
  assert(r.guide.source_ids[0] === RAW.source_url, "source flows to the guide for human verification");
}));

function finish14() {
  console.log("\n========================================");
  console.log("MICRO 14 TEST SUMMARY");
  console.log("========================================");
  console.log("Passed:  " + passed);
  console.log("Failed:  " + failed);
  console.log("========================================");
  process.exit(failed > 0 ? 1 : 0);
}
if (asyncRes14.length > 0) {
  Promise.all(asyncRes14.map(function (p) { return p.catch(function (e) {
    failed++; console.log("  FAIL: async test error — " + (e && e.message ? e.message : e));
  }); })).then(finish14).catch(finish14);
} else {
  finish14();
}
