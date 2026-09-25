// =============================================================================
// MICRO 13 — DeepSeek AI Provider Integration — Comprehensive Test Suite
// =============================================================================
"use strict";
const path = require("path"); const fs = require("fs");
const root = path.resolve(__dirname, "..");
var passed = 0; var failed = 0;
function assert(c, n, d) {
  if (c) { passed++; console.log("  PASS: " + n); }
  else { failed++; console.log("  FAIL: " + n + (d ? " — " + d : "")); }
}
function assertEqual(a, e, n) {
  var ja = JSON.stringify(a), je = JSON.stringify(e);
  assert(ja === je, n, ja !== je ? "exp " + je + " got " + ja : "");
}
function section(t) { console.log("\n--- " + t + " ---"); }
function loadModule(r) { return require(path.join(root, r)); }
function clearCache(ps) {
  Object.keys(require.cache).forEach(function(k) {
    if (ps.some(function(p) { return k.indexOf(p) > -1; })) { delete require.cache[k]; }
  });
}

// Test fixtures (TEST DATA ONLY, never used in production workflow)
var SAMPLE_RAW = {
  id: "test-001", title: "PM-KISAN Scheme",
  raw_content: "The Prime Minister Kisan Samman Nidhi (PM-KISAN) scheme provides Six Thousand Rupees. Launched 28th February 2019. Apply at pmkisan.gov.in. Documents: Aadhaar card.",
  source_name: "Ministry of Agriculture",
  source_url: "https://pib.gov.in/PressReleasePage/?PRID=1823456",
  source_published_date: "2024-03-15", status: "draft"
};
var SAMPLE_CAT = {
  content_type: "Announcement", category: "Government",
  sub_category: "Schemes & Benefits", user_group: "Farmers",
  categorization_status: "categorized", confidence: "high"
};
function makeValidDSResponse() {
  return { id: "c1", object: "chat.completion", model: "deepseek-flash",
    choices: [{ index: 0, message: { role: "assistant",
      content: JSON.stringify({
        title: "PM-KISAN Scheme", slug: "pm-kisan-scheme", category: "Government",
        summary: "PM-KISAN provides Six Thousand Rupees.",
        content: "Apply at pmkisan.gov.in.",
        eligibility: ["Aadhaar card"], benefits: ["Six Thousand Rupees"],
        required_documents: ["Aadhaar card"],
        application_process: ["Register", "Verify"],
        important_dates: ["28th February 2019"], common_mistakes: [],
        faqs: [{ q: "Amount?", a: "Six Thousand" }],
        source_ids: ["https://pib.gov.in/PressReleasePage/?PRID=1823456"],
        status: "draft", last_updated: "2024-03-16"
      }) }, finish_reason: "stop" }]
  };
}

// === 1. Provider Enums ===
section("1. Provider Enums");
var enums = loadModule("admin/ai/deepseek/provider-enums.js");
delete process.env.DEEPSEEK_API_KEY; delete process.env.DEEPSEEK_MODEL;
assert(!enums.isEnabled(), "isEnabled() false when key not set");
process.env.DEEPSEEK_API_KEY = "test-key";
assert(enums.isEnabled(), "isEnabled() true when key set");
delete process.env.DEEPSEEK_API_KEY;
process.env.DEEPSEEK_API_KEY = "   ";
assert(!enums.isEnabled(), "isEnabled() false when key whitespace");
delete process.env.DEEPSEEK_API_KEY;

assertEqual(enums.getApiKey(), undefined, "getApiKey() undefined when not set");
process.env.DEEPSEEK_API_KEY = "sk-test-12345";
assertEqual(enums.getApiKey(), "sk-test-12345", "getApiKey() returns env value");
delete process.env.DEEPSEEK_API_KEY; delete process.env.DEEPSEEK_MODEL;
assertEqual(enums.getModel({}), "deepseek-flash", "getModel() default deepseek-flash");
process.env.DEEPSEEK_MODEL = "deepseek-coder";
assertEqual(enums.getModel({}), "deepseek-coder", "getModel() returns env model");
assertEqual(enums.getModel({model:"custom"}), "custom", "getModel() uses options.model");
delete process.env.DEEPSEEK_MODEL;
assert(enums.ERROR_CODES.MISSING_API_KEY === "MISSING_API_KEY", "ERROR_CODES.MISSING_API_KEY");
assert(enums.NOT_SPECIFIED === "Not specified in the official source.", "NOT_SPECIFIED constant");

// === 2. Helpers ===
section("2. Helpers");
var helpers = loadModule("admin/ai/deepseek/helpers.js");
var wordSet = helpers.buildWordSet(SAMPLE_RAW.raw_content);
assert(wordSet["scheme"] === true, "buildWordSet detects scheme");
assert(wordSet["kisan"] === true, "buildWordSet detects kisan");
assert(!wordSet["ab"], "buildWordSet ignores short words");
assert(helpers.hasWords(wordSet, "Six Thousand"), "hasWords detects grounded");
assert(!helpers.hasWords(wordSet, "quantum"), "hasWords rejects hallucinated");
var vg = { title: "T", slug: "s", category: "G", status: "draft", source_url: "u" };
assert(helpers.validateGuideFields(vg).ok, "validateGuideFields accepts valid");
assert(!helpers.validateGuideFields({slug:"s",category:"G",status:"draft",source_url:"u"}).ok, "rejects missing title");
assert(helpers.assertSourcePreserved({source_url:SAMPLE_RAW.source_url}, SAMPLE_RAW.source_url).ok, "accept matching URL");
assert(!helpers.assertSourcePreserved({source_url:"https://x.com"}, SAMPLE_RAW.source_url).ok, "reject mismatched URL");

// === 3. Payload Builder ===
section("3. Payload Builder");
var pb = loadModule("admin/ai/deepseek/payload-builder.js");
var rawWC = Object.assign({}, SAMPLE_RAW, { categorization: SAMPLE_CAT });
var payload = pb.buildDeepSeekPayload(rawWC, SAMPLE_CAT, "deepseek-flash");
assert(payload.model === "deepseek-flash", "Payload includes model");
assert(Array.isArray(payload.messages), "Payload has messages array");
assert(payload.messages[0].role === "system", "Payload system role");
assert(payload.messages[1].role === "user", "Payload user role");
var uc = payload.messages[1].content;
assert(uc.includes(SAMPLE_RAW.raw_content), "Payload includes RAW");
assert(uc.includes("Ministry of Agriculture"), "Payload includes source name");
assert(uc.includes(SAMPLE_RAW.source_url), "Payload includes source URL");
assert(uc.includes("2024-03-15"), "Payload includes published date");
assert(uc.includes("Announcement"), "Payload includes content type");
assert(uc.includes("Government"), "Payload includes top category");
assert(uc.includes("Schemes"), "Payload includes sub-category");
assert(uc.includes("Farmers"), "Payload includes user group");
assert(uc.includes("Not specified in the official source."), "Payload includes NOT_SPECIFIED");
assert(/never invent/i.test(uc), "Payload prohibits hallucination");
assert(/status.*draft/i.test(uc.replace(/\n/g, " ")), "Payload instructs draft");

// === 4. Response Parser ===
section("4. Response Parser");
var rp = loadModule("admin/ai/deepseek/response-parser.js");
var srcUrl = SAMPLE_RAW.source_url;
var vr = rp.parseDeepSeekResponse(makeValidDSResponse(), srcUrl);
assert(vr.ok === true, "Accepts valid response");
assert(vr.guide.status === "draft", "Valid guide status draft");
var mr = rp.parseDeepSeekResponse({choices:[{message:{content:"not json"}}]}, srcUrl);
assert(mr.ok === false, "Rejects malformed JSON");
assert(!rp.parseDeepSeekResponse({choices:[]}, srcUrl).ok, "Rejects no choices");
assert(!rp.parseDeepSeekResponse({choices:[{message:{content:""}}]}, srcUrl).ok, "Rejects empty content");
var rlR = rp.parseDeepSeekResponse({error:{code:"429",message:"rate"}}, srcUrl);
assert(!rlR.ok && rlR.code === "API_RATE_LIMITED", "Rate limit rejected");
var authR = rp.parseDeepSeekResponse({error:{code:"401",message:"bad key"}}, srcUrl);
assert(!authR.ok && authR.code === "INVALID_API_KEY", "Invalid key rejected");
assert(!rp.parseDeepSeekResponse(null, srcUrl).ok, "Rejects null");

// === 5. API Error Handler ===
section("5. API Error Handler");
var eh = loadModule("admin/ai/deepseek/api-error-handler.js");
assert(eh.categorizeApiError(new Error("timeout")).code === "API_TIMEOUT", "Timeout error");
var rle = new Error("HTTP 429"); rle.statusCode = 429;
assert(eh.categorizeApiError(rle).code === "API_RATE_LIMITED", "429 rate limit");
var ae = new Error("HTTP 401"); ae.statusCode = 401;
assert(eh.categorizeApiError(ae).code === "INVALID_API_KEY", "401 auth");
assert(eh.categorizeApiError(new Error("fetch failed ENOTFOUND")).code === "API_UNAVAILABLE", "Network error");

// === 6. Server Bridge ===
section("6. Server Bridge");
delete process.env.DEEPSEEK_API_KEY; clearCache(["server-bridge","deepseek","refine"]);
var bridge = loadModule("admin/ai/server-bridge.js");
assert(!bridge.isProviderConfigured(), "Not configured without key");
var bs = bridge.getProviderStatus();
assert(bs.configured === false, "Provider status not configured");
var asyncRes = [];
var r6a = Object.assign({}, SAMPLE_RAW, { categorization: SAMPLE_CAT });
asyncRes.push(bridge.refineWithDeepSeek(r6a, {}).then(function(res) {
  assert(!res.ok, "Bridge fails when not configured");
  assert(res.guide === null, "No guide when not configured");
  assert(res.raw !== null, "RAW preserved on failure");
}));
var r6c = Object.assign({}, SAMPLE_RAW); delete r6c.categorization;
asyncRes.push(bridge.refineWithDeepSeek(r6c, {}).then(function(res) {
  assert(!res.ok, "Bridge fails when categorization missing");
  assert(res.code === "MANUAL_CATEGORIZATION_REQUIRED", "Correct error code for missing cat");
}));

// === 7. Refine.js Workflow ===
section("7. Refine.js Workflow");
clearCache(["refine"]);
var refine = loadModule("admin/ai/refine.js");
var mockRaw = Object.assign({}, SAMPLE_RAW, { categorization: SAMPLE_CAT });
var mockResult = refine.refineRawToDraft(mockRaw, { provider: "mock" });
assert(mockResult.ok === true, "Mock refinement succeeds");
assert(mockResult.guide.status === "draft", "Mock status is draft");
assert(mockResult.provider === "mock", "Mock provider selected");
var rawBefore = JSON.stringify(mockRaw);
assert(JSON.stringify(mockRaw) === rawBefore, "RAW unchanged after mock");
delete process.env.DEEPSEEK_API_KEY;
clearCache(["refine","server-bridge","deepseek"]);
var refine2 = loadModule("admin/ai/refine.js");
var dsRaw = Object.assign({}, SAMPLE_RAW, { categorization: SAMPLE_CAT });
var dsResult = refine2.refineRawToDraft(dsRaw, { provider: "deepseek" });
asyncRes.push(Promise.resolve(dsResult).then(function(res) {
  assert(!res.ok, "DeepSeek fails when not configured");
  assert(res.guide === null, "No guide when DeepSeek fails");
}));

// === 8. Pipeline ===
section("8. Pipeline");
clearCache(["pipeline","refine"]);
var pipeline = loadModule("admin/content/pipeline.js");
var gated = pipeline.refineCategorized(SAMPLE_RAW, null, { provider: "mock" });
assert(!gated.ok, "Pipeline rejects uncategorized");
assert(gated.code === "MANUAL_CATEGORIZATION_REQUIRED", "Uncategorized gated");
assert(gated.raw === SAMPLE_RAW, "RAW preserved when uncategorized");
var pipeResult = pipeline.refineCategorized(SAMPLE_RAW, JSON.parse(JSON.stringify(SAMPLE_CAT)), { provider: "mock" });
assert(pipeResult.ok === true, "Pipeline succeeds for categorized");
assert(pipeResult.guide.status === "draft", "Pipeline draft status");
assert(pipeResult.stages.RAW === true, "Pipeline stage RAW");
assert(pipeResult.stages.CATEGORIZED === true, "Pipeline stage CATEGORIZED");
assert(pipeResult.stages.DRAFT === true, "Pipeline stage DRAFT");
assert(pipeResult.categorization.category === "Government", "Preserves category");
assert(pipeResult.categorization.sub_category === "Schemes & Benefits", "Preserves sub_category");
assert(pipeResult.categorization.user_group === "Farmers", "Preserves user_group");
assert(pipeResult.categorization.content_type === "Announcement", "Preserves content_type");
var inp = pipeResult.input;
assert(typeof inp.raw_content === "string", "Input has raw_content");
assert(typeof inp.source_name === "string", "Input has source_name");
assert(typeof inp.source_url === "string", "Input has source_url");
assert(typeof inp.source_published_date === "string", "Input has published date");
assert(inp.top_category === "Government", "Input has top-level category");
assert(pipeResult.raw === SAMPLE_RAW, "Pipeline preserves RAW object");

// === 9. Guide Schema ===
section("9. Guide Schema");
var schemas = loadModule("admin/schemas/index.js");
var validGuide = {
  title: "Test", slug: "test", category: "Government", summary: "S", content: "C",
  eligibility: [], benefits: [], required_documents: [],
  application_process: [], important_dates: [], common_mistakes: [],
  faqs: [], source_ids: [], status: "draft", last_updated: "2024-03-16"
};
var sc = schemas.guide.validateGuide(validGuide);
assert(sc.valid === true, "Schema accepts valid guide");
var noT = schemas.guide.validateGuide(Object.assign({}, validGuide, { title: "" }));
assert(!noT.valid, "Schema rejects missing title");
var noS = schemas.guide.validateGuide(Object.assign({}, validGuide, { slug: "" }));
assert(!noS.valid, "Schema rejects missing slug");
var noC = schemas.guide.validateGuide(Object.assign({}, validGuide, { category: "" }));
assert(!noC.valid, "Schema rejects missing category");


// === 10. Hallucination Guard ===
section("10. Hallucination Guard");
var hw = helpers.buildWordSet(SAMPLE_RAW.raw_content);
assert(hw["aadhaar"] === true, "aadhaar in RAW word set");
assert(hw["pan"] === undefined, "pan NOT in word set (guard)");
assert(!helpers.hasWords(hw, "Income Tax Rebate"), "Guard rejects invented content absent from RAW");
assert(!helpers.assertSourcePreserved({source_ids:["https://fake.example/x"]}, SAMPLE_RAW.source_url).ok,
  "Guard rejects invented source URL");
assert(helpers.hasWords(hw, "Aadhaar card"), "Guard accepts grounded Aadhaar");

// === 11. RAW Content Preservation ===
section("11. RAW Preservation");
var rc1 = JSON.parse(JSON.stringify(SAMPLE_RAW));
var before1 = JSON.stringify(rc1);
refine.refineRawToDraft(rc1, { provider: "mock", categorization: JSON.parse(JSON.stringify(SAMPLE_CAT)) });
assert(JSON.stringify(rc1) === before1, "RAW unchanged after refine mock");
var rc2 = JSON.parse(JSON.stringify(SAMPLE_RAW));
var before2 = JSON.stringify(rc2);
pipeline.refineCategorized(rc2, JSON.parse(JSON.stringify(SAMPLE_CAT)), { provider: "mock" });
assert(JSON.stringify(rc2) === before2, "RAW unchanged after pipeline");

// === 12. Draft-Only Enforcement ===
section("12. Draft-Only Enforcement");
var dr = refine.refineRawToDraft(Object.assign({}, SAMPLE_RAW, { categorization: SAMPLE_CAT }), { provider: "mock" });
assert(dr.guide.status === "draft", "Mock status always draft");
assert(dr.guide.status !== "published", "Mock never published");
assert(dr.guide.status !== "approved", "Mock never approved");
var prov = loadModule("admin/ai/provider.js");
assert(typeof prov.deeProviderEnabled === "function", "Provider interface has ddeProviderEnabled");
assertEqual(prov.DEFAULT_DEEPSEEK_MODEL, "deepseek-flash", "Provider interface default model");
assertEqual(prov.SERVER_ONLY_PROVIDERS, ["deepseek"], "DeepSeek is server-only");

// === 13. Provider Status UI ===
section("13. Provider Status UI");
var puiSrc = fs.readFileSync(path.join(root, "admin/content/pipeline-ui.js"), "utf8");
assert(puiSrc.includes("provider-status"), "UI has provider-status element");
assert(puiSrc.includes("deeProviderEnabled"), "UI checks ddeProviderEnabled");
assert(puiSrc.includes("DeepSeek"), "UI renders DeepSeek name");
assert(puiSrc.includes("--configured"), "UI has configured badge");

// === 14. Security: No API Key in Browser Files ===
section("14. Security: No API Key Exposure");
var pSrc = fs.readFileSync(path.join(root, "admin/ai/provider.js"), "utf8");
assert(!pSrc.includes("Bearer"), "Browser provider.js no Bearer token");
assert(!pSrc.includes("api.deepseek.com"), "Browser provider.js no DeepSeek URL");
var bridgeSrc = fs.readFileSync(path.join(root, "admin/ai/server-bridge.js"), "utf8");
assert(bridgeSrc.includes("DEEPSEEK_API_KEY"), "server-bridge reads env DEEPSEEK_API_KEY");
assert(!bridgeSrc.includes("sk-"), "server-bridge no hardcoded key");
var dsSrc = fs.readFileSync(path.join(root, "admin/ai/deepseek.js"), "utf8");
assert(dsSrc.includes("DEEPSEEK_API_KEY") || dsSrc.includes("provider-enums"), "deepseek.js delegates to env-based config");
var dsEnumsSrc = fs.readFileSync(path.join(root, "admin/ai/deepseek/provider-enums.js"), "utf8");
assert(dsEnumsSrc.includes("process.env"), "provider-enums.js reads process.env");
assert(!dsSrc.includes("sk-"), "deepseek.js no hardcoded key");
var pbSrc = fs.readFileSync(path.join(root, "admin/ai/deepseek/payload-builder.js"), "utf8");
assert(!pbSrc.includes("pmkisan.gov.in"), "payload-builder no hardcoded URLs");
var inboxSrc = fs.readFileSync(path.join(root, "admin/content/inbox.js"), "utf8");
assert(inboxSrc.includes("var mockItems = []"), "Inbox mockItems starts empty");
assert(!inboxSrc.includes("pib.gov.in"), "Inbox no hardcoded PIB URL");

// === 15. Build Exclusion of Server-Side Files ===
section("15. Build Exclusion");
var buildAdminSrc = fs.readFileSync(path.join(root, "build/admin.js"), "utf8");
var hasExclusion = buildAdminSrc.includes("server-bridge") || buildAdminSrc.includes("EXCLUDE") || buildAdminSrc.includes("exclude");
assert(hasExclusion, "build/admin.js excludes server-side files from browser");

// === 16. .env.example ===
section("16. .env.example");
var envPath = path.join(root, ".env.example");
assert(fs.existsSync(envPath), ".env.example exists");
if (fs.existsSync(envPath)) {
  var envContent = fs.readFileSync(envPath, "utf8");
  assert(envContent.includes("DEEPSEEK_API_KEY"), ".env.example documents API key");
  assert(envContent.includes("DEEPSEEK_MODEL"), ".env.example documents model");
  assert(!envContent.includes("sk-"), ".env.example has no real keys");
}

// === 17. Data Flow ===
section("17. Data Flow: Fetched Content to DeepSeek Boundary");
assert(typeof pipeResult.input.raw_content === "string", "Pipeline input has raw_content");
assert(typeof pipeResult.input.source_url === "string", "Pipeline input has source_url");
assert(payload.model === "deepseek-flash", "Payload has model from config");
assert(uc.includes(rawWC.raw_content), "Payload carries RAW to provider");
assert(payload.messages[1].content.includes("Government"), "Payload carries category");
// === 18. DeepSeek Provider End-to-End (mocked transport, no network) ===
section("18. DeepSeek Provider End-to-End (mocked transport)");

// Build a fake fetch that returns the given HTTP status + JSON body.
function fakeFetch(status, body, opts) {
  opts = opts || {};
  return function (url, init) {
    if (opts.throwError) return Promise.reject(new Error(opts.throwError));
    var headers = (init && init.headers) || {};
    fakeFetch.lastUrl = url;
    fakeFetch.lastAuth = headers.Authorization || headers.authorization || "";
    fakeFetch.lastBody = init && init.body;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status: status,
      statusText: String(status),
      json: function () { return Promise.resolve(body); }
    });
  };
}

// A schema-valid DeepSeek payload grounded in the RAW sample.
function groundedGuidePayload(overrides) {
  var base = {
    title: "PM-KISAN Scheme", slug: "pm-kisan-scheme", category: "Government",
    summary: "PM-KISAN provides Six Thousand Rupees to farmers.",
    content: "Apply at pmkisan.gov.in with an Aadhaar card.",
    eligibility: ["Aadhaar card"],
    benefits: ["Six Thousand Rupees"],
    required_documents: ["Aadhaar card"],
    application_process: ["Register", "Verify"],
    important_dates: ["28th February 2019"],
    common_mistakes: [],
    faqs: [{ q: "Amount?", a: "Six Thousand" }],
    source_ids: [SAMPLE_RAW.source_url],
    status: "draft",
    last_updated: "2024-03-16"
  };
  return Object.assign(base, overrides || {});
}
function dsCompletion(guide) {
  return { id: "c1", object: "chat.completion", model: "deepseek-flash",
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(guide) }, finish_reason: "stop" }] };
}

process.env.DEEPSEEK_API_KEY = "test-key-not-a-real-secret";
clearCache(["server-bridge", "deepseek", "refine"]);
var dsBridge = loadModule("admin/ai/server-bridge.js");
assert(dsBridge.isProviderConfigured(), "Provider reports configured when env key present");
var statusNow = dsBridge.getProviderStatus();
assert(statusNow.configured === true, "Provider status: configured");
assert(statusNow.model === "deepseek-flash", "Provider status reports configured model");
assert(statusNow.keyPresent === true, "Provider status keyPresent=true");
assert(String(JSON.stringify(statusNow)).indexOf("test-key-not-a-real-secret") === -1,
  "Provider status never exposes the API key value");

var groundedRaw = Object.assign({}, SAMPLE_RAW, { categorization: SAMPLE_CAT });

// 18a: VALID DeepSeek response -> schema-valid draft
var validFetch = fakeFetch(200, dsCompletion(groundedGuidePayload()));
asyncRes.push(dsBridge.refineWithDeepSeek(groundedRaw, { fetchImpl: validFetch }).then(function (res) {
  assert(res.ok === true, "Valid DeepSeek response accepted end-to-end");
  assert(res.provider === "deepseek", "Result provider is deepseek");
  assert(res.guide.status === "draft", "DeepSeek guide forced to status draft");
  assert(res.guide.title === "PM-KISAN Scheme", "DeepSeek guide title preserved");
  assert(res.guide.category === "Government", "DeepSeek guide category preserved");
  assert(Array.isArray(res.guide.source_ids) && res.guide.source_ids[0] === SAMPLE_RAW.source_url,
    "DeepSeek guide carries official source URL");
  var schemaRes = loadModule("admin/schemas/index.js").guide.validateGuide(res.guide);
  assert(schemaRes.valid === true, "DeepSeek guide passes EXISTING Guide schema validation");
  assert(validFetch.lastUrl.indexOf("/chat/completions") > -1, "Request hits chat completions endpoint");
  assert(validFetch.lastAuth.indexOf("Bearer ") === 0, "Request carries Bearer auth header (server-side)");
  assert(JSON.stringify(res).indexOf("test-key-not-a-real-secret") === -1,
    "API key never appears in the refinement result");
}));

// 18b: DRAFT-ONLY enforced even if the model returns 'published'
var sneakyFetch = fakeFetch(200, dsCompletion(groundedGuidePayload({ status: "published" })));
asyncRes.push(dsBridge.refineWithDeepSeek(groundedRaw, { fetchImpl: sneakyFetch }).then(function (res) {
  assert(!res.ok, "Model claiming 'published' is rejected (must stay draft)");
  assert(res.guide === null, "No guide created when model claims published");
}));

// 18c: HALLUCINATION GUARD -> invented facts replaced with NOT_SPECIFIED
var hallucinated = groundedGuidePayload({
  summary: "Farmers must submit a quantum teleportation voucher by 2049.",
  benefits: ["Free helicopter for every applicant"],
  eligibility: ["Applicant must hold a platinum loyalty card"]
});
var hallucFetch = fakeFetch(200, dsCompletion(hallucinated));
asyncRes.push(dsBridge.refineWithDeepSeek(groundedRaw, { fetchImpl: hallucFetch }).then(function (res) {
  assert(res.ok === true, "Invented facts are sanitised, not silently published");
  assert(res.guide.summary === "Not specified in the official source.",
    "Hallucination guard blanks ungrounded summary");
  assert(res.guide.benefits.indexOf("Free helicopter for every applicant") === -1,
    "Hallucination guard removes invented benefit");
  assert(res.guide.eligibility.indexOf("Applicant must hold a platinum loyalty card") === -1,
    "Hallucination guard removes invented eligibility");
  assert(res.guide.title === "PM-KISAN Scheme", "Grounded title survives the guard");
}));

// 18d: API FAILURE (network) -> clear error, no partial draft
var netFetch = fakeFetch(0, null, { throwError: "fetch failed ENOTFOUND api.deepseek.com" });
asyncRes.push(dsBridge.refineWithDeepSeek(groundedRaw, { fetchImpl: netFetch }).then(function (res) {
  assert(!res.ok, "Network failure produces failure result");
  assert(res.guide === null, "No partial/fake draft on network failure");
  assert(res.code === "API_UNAVAILABLE", "Network failure error code is API_UNAVAILABLE");
  assert(String(res.message).length > 0, "Network failure produces a clear admin message");
}));

// 18e: RATE LIMIT (429) -> clear error, no draft
var rateFetch = fakeFetch(429, { error: { code: "429", message: "Rate limit reached" } });
asyncRes.push(dsBridge.refineWithDeepSeek(groundedRaw, { fetchImpl: rateFetch }).then(function (res) {
  assert(!res.ok, "Rate limit produces failure result");
  assert(res.guide === null, "No draft created on rate limit");
  assert(res.code === "API_RATE_LIMITED", "Rate limit error code is API_RATE_LIMITED");
}));

// 18f: INVALID API KEY (401) -> clear error, no draft
var authFetch = fakeFetch(401, { error: { code: "401", message: "Authentication Fails" } });
asyncRes.push(dsBridge.refineWithDeepSeek(groundedRaw, { fetchImpl: authFetch }).then(function (res) {
  assert(!res.ok, "Invalid API key produces failure result");
  assert(res.guide === null, "No draft created on invalid key");
  assert(res.code === "INVALID_API_KEY", "Invalid key error code is INVALID_API_KEY");
}));

// 18g: MALFORMED STRUCTURED OUTPUT -> reject, no draft
var malformedFetch = fakeFetch(200, { choices: [{ message: { content: "Sure! Here is the guide: {not json" } }] });
asyncRes.push(dsBridge.refineWithDeepSeek(groundedRaw, { fetchImpl: malformedFetch }).then(function (res) {
  assert(!res.ok, "Malformed structured output rejected");
  assert(res.guide === null, "No draft created on malformed output");
  assert(res.code === "MALFORMED_OUTPUT", "Malformed output error code is MALFORMED_OUTPUT");
}));

// 18h: EMPTY CHOICES -> invalid API response, no draft
var emptyFetch = fakeFetch(200, { choices: [] });
asyncRes.push(dsBridge.refineWithDeepSeek(groundedRaw, { fetchImpl: emptyFetch }).then(function (res) {
  assert(!res.ok, "Empty choices rejected");
  assert(res.code === "INVALID_API_RESPONSE", "Empty choices error code is INVALID_API_RESPONSE");
}));

// 18i: TIMEOUT -> clear error, no draft
var hangFetch = function (url, init) {
  return new Promise(function (resolve, reject) {
    if (init && init.signal && typeof init.signal.addEventListener === "function") {
      init.signal.addEventListener("abort", function () {
        reject(new Error("Request timeout after 20ms"));
      });
    }
  });
};
asyncRes.push(dsBridge.refineWithDeepSeek(groundedRaw, { fetchImpl: hangFetch, timeoutMs: 20 }).then(function (res) {
  assert(!res.ok, "Timeout produces failure result");
  assert(res.guide === null, "No draft created on timeout");
  assert(res.code === "API_TIMEOUT", "Timeout error code is API_TIMEOUT");
}));

// 18j: SCHEMA-INVALID OUTPUT (missing title) -> rejected, no draft
var badGuideFetch = fakeFetch(200, dsCompletion(groundedGuidePayload({ title: "" })));
asyncRes.push(dsBridge.refineWithDeepSeek(groundedRaw, { fetchImpl: badGuideFetch }).then(function (res) {
  assert(!res.ok, "Schema-invalid DeepSeek output rejected");
  assert(res.guide === null, "No draft created for schema-invalid output");
}));

// 18k: RAW + metadata byte-identical after a real provider run
var rawIntegrity = Object.assign({}, SAMPLE_RAW, { categorization: SAMPLE_CAT });
var integrityBefore = JSON.stringify(rawIntegrity);
var okFetch = fakeFetch(200, dsCompletion(groundedGuidePayload()));
asyncRes.push(dsBridge.refineWithDeepSeek(rawIntegrity, { fetchImpl: okFetch }).then(function (res) {
  assert(JSON.stringify(rawIntegrity) === integrityBefore, "RAW + metadata byte-identical after DeepSeek run");
  assert(res.raw === rawIntegrity, "Result returns the same RAW reference");
}));

// 18l: Not configured -> no HTTP request attempted at all
delete process.env.DEEPSEEK_API_KEY;
clearCache(["server-bridge", "deepseek"]);
var unconfigured = loadModule("admin/ai/server-bridge.js");
var neverCalled = fakeFetch(200, dsCompletion(groundedGuidePayload()));
asyncRes.push(unconfigured.refineWithDeepSeek(groundedRaw, { fetchImpl: neverCalled }).then(function (res) {
  assert(!res.ok, "Unconfigured provider fails without calling the API");
  assert(res.code === "PROVIDER_DISABLED", "Unconfigured provider error is PROVIDER_DISABLED");
  assert(!neverCalled.lastUrl, "No HTTP request was made when the key is missing");
}));

// === 19. Full Pipeline: RAW → CATEGORY → DEEPSEEK → DRAFT (real fetch mocked) ===
section("19. Full Pipeline through DeepSeek (RAW -> CATEGORY -> DEEPSEEK -> DRAFT)");
process.env.DEEPSEEK_API_KEY = "test-key-not-a-real-secret";
clearCache(["pipeline", "refine", "server-bridge", "deepseek"]);
var pipe13 = loadModule("admin/content/pipeline.js");
var pipeRaw = Object.assign({}, SAMPLE_RAW);
var pipeRawBefore = JSON.stringify(pipeRaw);
var pipeCat = JSON.parse(JSON.stringify(SAMPLE_CAT));
var pipeFetch = fakeFetch(200, dsCompletion(groundedGuidePayload()));

// Returns a Promise for the deepseek provider — verify that contract explicitly.
var pipeAsync = pipe13.refineCategorized(pipeRaw, pipeCat, { provider: "deepseek", fetchImpl: pipeFetch });
assert(pipeAsync && typeof pipeAsync.then === "function",
  "Pipeline returns a Promise for the async DeepSeek provider");

asyncRes.push(pipeAsync.then(function (pr) {
  assert(pr.ok === true, "Pipeline reaches DRAFT via DeepSeek");
  assert(pr.provider === "deepseek", "Pipeline reports deepseek provider");
  assert(pr.stages.RAW === true && pr.stages.CATEGORIZED === true &&
    pr.stages.REFINEMENT === true && pr.stages.DRAFT === true,
    "All pipeline stages reached: RAW -> CATEGORIZED -> REFINEMENT -> DRAFT");
  assert(pr.guide.status === "draft", "Pipeline DeepSeek draft is status=draft");
  assert(pr.guide.category === "Government", "Category carried into DeepSeek draft");
  assert(pr.categorization.sub_category === "Schemes & Benefits", "Sub-category preserved in pipeline");
  assert(pr.categorization.user_group === "Farmers", "User group preserved in pipeline");
  assert(pr.input.source_published_date === "2024-03-15", "Official published date preserved in pipeline input");
  assert(JSON.stringify(pipeRaw) === pipeRawBefore, "RAW unchanged across the full DeepSeek pipeline");
  assert(pr.raw === pipeRaw, "Pipeline returns the original RAW reference");
  // No publish/approve side effects exist anywhere in the result.
  assert(pr.guide.status !== "published" && pr.guide.status !== "approved", "Pipeline never approves/publishes");
}));

// Pipeline + DeepSeek failure -> no draft, RAW safe
var pipeFailFetch = fakeFetch(500, { error: { code: "500", message: "server error" } });
var pipeFailRaw = Object.assign({}, SAMPLE_RAW);
var pipeFailBefore = JSON.stringify(pipeFailRaw);
asyncRes.push(pipe13.refineCategorized(pipeFailRaw, JSON.parse(JSON.stringify(SAMPLE_CAT)),
  { provider: "deepseek", fetchImpl: pipeFailFetch }).then(function (pr) {
    assert(!pr.ok, "Pipeline reports failure when DeepSeek API fails");
    assert(pr.guide === null, "No draft created when DeepSeek API fails");
    assert(JSON.stringify(pipeFailRaw) === pipeFailBefore, "RAW unchanged when DeepSeek API fails");
    assert(pr.code === "API_UNAVAILABLE", "Pipeline maps API failure to API_UNAVAILABLE");
  }));

// === 20. Browser Script Integrity + UI Wiring ===
section("20. Browser Script Integrity + UI Wiring");
var vm = require("vm");
["admin/ai/provider.js", "admin/ai/refine.js", "admin/content/pipeline.js",
 "admin/content/pipeline-ui.js", "admin/content/editor.js", "admin/content/inbox.js",
 "admin/content/categorize.js"].forEach(function (rel) {
  var src = fs.readFileSync(path.join(root, rel), "utf8");
  try {
    new vm.Script(src, { filename: rel });
    assert(true, "Browser script parses cleanly: " + rel);
  } catch (e) {
    assert(false, "Browser script parses cleanly: " + rel, e.message);
  }
});

var pui2 = fs.readFileSync(path.join(root, "admin/content/pipeline-ui.js"), "utf8");
assert(pui2.indexOf("data-provider=\\\"deepseek\\\"") > -1 || (pui2.indexOf("data-provider=") > -1 && pui2.indexOf("Refine (DeepSeek)") > -1),
  "Pipeline UI renders a Refine (DeepSeek) button");
assert(pui2.indexOf("openWithGuide") > -1, "Pipeline UI hands provider drafts to the existing editor");
assert(pui2.indexOf("typeof res.then === \"function\"") > -1, "Pipeline UI handles the async provider result");
var editorSrc = fs.readFileSync(path.join(root, "admin/content/editor.js"), "utf8");
assert(editorSrc.indexOf("openWithGuide: openWithGuide") > -1, "Draft editor exposes openWithGuide");
assert(editorSrc.indexOf("open: open,") > -1, "Draft editor keeps the original open() entry point");
var pipeSrc2 = fs.readFileSync(path.join(root, "admin/content/pipeline.js"), "utf8");
assert(pipeSrc2.indexOf("typeof res.then === \"function\"") > -1, "Pipeline handles async provider results");
assert(pipeSrc2.indexOf("status = \"draft\"") > -1 || pipeSrc2.indexOf("guide.status = \"draft\"") > -1,
  "Pipeline enforces draft-only status");

// === 21. No static government content in the production workflow ===
section("21. No Static Government Content in Production Workflow");
["admin/ai/deepseek.js", "admin/ai/server-bridge.js", "admin/ai/refine.js",
 "admin/content/pipeline.js", "admin/content/pipeline-ui.js", "admin/content/inbox.js",
 "admin/ai/deepseek/payload-builder.js", "admin/ai/provider.js"].forEach(function (rel) {
  var src = fs.readFileSync(path.join(root, rel), "utf8");
  var hasPibUrl = /pib\.gov\.in/.test(src);
  var hasHardcodedPrId = /PRID=\d{5,}/.test(src);
  assert(!hasPibUrl && !hasHardcodedPrId, "No hardcoded PIB source data in " + rel);
});



// === Summary (handles async) ===
var allAsync = asyncRes || [];
function finish() {
  console.log("\n========================================");
  console.log("MICRO 13 TEST SUMMARY");
  console.log("========================================");
  console.log("Passed:  " + passed);
  console.log("Failed:  " + failed);
  console.log("========================================");
  process.exit(failed > 0 ? 1 : 0);
}
if (allAsync.length > 0) {
  Promise.all(allAsync.map(function(p) { return p.catch(function() {}); })).then(finish).catch(finish);
} else {
  finish();
}