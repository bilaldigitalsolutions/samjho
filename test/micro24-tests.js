// MICRO 24 Tests — Approval Gate + Publishing
var passed = 0, failed = 0;
var fs = require("fs");
var path = require("path");
function assert(label, cond) { if (cond) { passed++; console.log("  PASS: " + label); } else { failed++; console.log("  FAIL: " + label); } }
var pub = require("../build/scripts/publish-approved");
var VALID_GUIDE = {
  title: "Test Publication Guide", slug: "micro24-test-guide", category: "government",
  summary: "Test summary.", content: "Test content.",
  eligibility: ["Test"], benefits: ["Test"], required_documents: ["Test"],
  application_process: ["Test"], important_dates: [], common_mistakes: [],
  faqs: [{ q: "Q?", a: "A." }], source_ids: ["https://pib.gov.in/test"],
  status: "draft", last_updated: "2026-09-20",
};
var APPROVED = {
  id: "test-pub-001", status: "approved", verification_status: "verified",
  approval_status: "approved", refined_guide: Object.assign({}, VALID_GUIDE),
  source_name: "PIB", source_url: "https://pib.gov.in/test",
  source_published_date: "2026-09-15", ministry: "Test",
  release_url: "https://pib.gov.in/test", release_id: "12345",
  fetched_at: "2026-09-20T06:00:00Z",
};

console.log("=== Micro 24 Tests ===");

// 1. Approval Gate
console.log("--- Approval Gate ---");
assert("Approved passes gate", pub.validateApprovalGate(APPROVED).ok === true);
assert("Draft rejected", pub.validateApprovalGate(Object.assign({}, APPROVED, { status: "draft" })).ok === false);
assert("Review rejected", pub.validateApprovalGate(Object.assign({}, APPROVED, { status: "review" })).ok === false);
assert("Unverified rejected", pub.validateApprovalGate(Object.assign({}, APPROVED, { verification_status: "not_verified" })).ok === false);
assert("Approval_pending rejected", pub.validateApprovalGate(Object.assign({}, APPROVED, { approval_status: "pending" })).ok === false);
assert("No guide rejected", pub.validateApprovalGate(Object.assign({}, APPROVED, { refined_guide: null })).ok === false);

// 2. Guide Schema
console.log("--- Guide Schema ---");
assert("Bad guide rejected", pub.validateGuideForPublish({ title: "", slug: "", category: "" }).ok === false);
assert("Valid guide passes", pub.validateGuideForPublish(VALID_GUIDE).ok === true);
assert("No source_ids rejected", pub.validateGuideForPublish(Object.assign({}, VALID_GUIDE, { source_ids: [] })).ok === false);

// 3. Prepare Guide
console.log("--- Prepare Guide ---");
var p = pub.prepareGuideForPublish(APPROVED);
assert("Status=approved", p.status === "approved");
assert("Source in source_ids", p.source_ids[0] === "https://pib.gov.in/test");
assert("Source date preserved", p.source_published_date === "2026-09-15");
assert("_source attached", !!p._source && p._source.content_item_id === "test-pub-001");
assert("Title preserved", p.title === VALID_GUIDE.title);
assert("Date not today", p.source_published_date !== new Date().toISOString().slice(0, 10));
assert("Source name preserved", p._source.source_name === "PIB");
assert("Ministry preserved", p._source.ministry === "Test");
assert("Release ID preserved", p._source.release_id === "12345");

// 4. Async publish actions
console.log("--- Publish Actions ---");
var chain = Promise.resolve();
function testAsync(label, item, expected) {
  chain = chain.then(function () {
    return pub.publishItem(item).then(function (res) { assert(label, res.action === expected); });
  });
}
testAsync("Already published", Object.assign({}, APPROVED, { status: "published" }), "already_published");
testAsync("Draft rejected", Object.assign({}, APPROVED, { status: "draft" }), "rejected_gate");
testAsync("Unverified rejected", Object.assign({}, APPROVED, { verification_status: "pending" }), "rejected_gate");
testAsync("Approval_pending rejected", Object.assign({}, APPROVED, { approval_status: "pending" }), "rejected_gate");
testAsync("Bad guide rejected", Object.assign({}, APPROVED, { refined_guide: { title: "", slug: "", category: "" } }), "rejected_guide_validation");

// 5. Build + dist checks
chain.then(function () {
  console.log("--- Build Output ---");
  assert("publish-approved.js exists", fs.existsSync("build/scripts/publish-approved.js"));
  assert("published-guides.json exists", fs.existsSync("build/data/published-guides.json"));
  var pg = JSON.parse(fs.readFileSync("build/data/published-guides.json", "utf8"));
  assert("published-guides.json is array", Array.isArray(pg));
  assert("dist/guides/ exists", fs.existsSync("dist/guides"));
  var sm = fs.readFileSync("dist/sitemap.xml", "utf8");
  assert("Sitemap has /guides/", sm.indexOf("/guides/") !== -1);
  assert("Sitemap has test-guide-micro7", sm.indexOf("test-guide-micro7") !== -1);
  assert("Existing guide page exists", fs.existsSync("dist/guides/test-guide-micro7/index.html"));

  console.log("--- Security ---");
  var h = 0;
  ["dist/admin/ai", "dist/admin/content"].forEach(function (d) {
    try { fs.readdirSync(d, { recursive: true }).forEach(function (f) {
      if (typeof f === "string" && (f.endsWith(".js") || f.endsWith(".html"))) {
        var t = fs.readFileSync(path.join(d, f), "utf8");
        if (/sk-[a-zA-Z0-9]{20,}/.test(t)) h++;
        if (/api\.deepseek\.com/.test(t)) h++;
      }
    }); } catch (e) {}
  });
  assert("No secrets in dist/admin", h === 0);
  var gc = fs.readFileSync("dist/guides/test-guide-micro7/index.html", "utf8");
  assert("No sk- in published guide", gc.indexOf("sk-") === -1);
  assert("No deepseek.com in published guide", gc.indexOf("api.deepseek.com") === -1);

  console.log("--- Regression ---");
  var rj = fs.readFileSync("admin/content/review.js", "utf8");
  assert("Review.js no mock data", rj.indexOf("draft-001") === -1);
  assert("Review.js has Supabase", rj.indexOf("SamjhoContentDB") !== -1);

  console.log("");
  console.log("=== RESULTS: " + passed + " passed, " + failed + " failed ===");
  if (failed > 0) process.exit(1);
}).catch(function (e) { console.error(e); process.exit(1); });
