// MICRO 22 — Human Verification → Supabase Tests
"use strict";
const path = require("path");
const fs = require("fs");
const root = path.resolve(__dirname, "..");
var passed = 0, failed = 0, asyncResults = [];
function assert(c, n, d) { if (c) { passed++; console.log("  PASS: " + n); } else { failed++; console.log("  FAIL: " + n + (d ? " — " + d : "")); } }
function section(t) { console.log("\n--- " + t + " ---"); }
function loadMod(r) { return require(path.join(root, r)); }

section("1. Verify module loads");
var verify; try { verify = loadMod("admin/content/verify.js"); } catch (e) { verify = null; }
assert(verify !== null, "verify.js loads");
assert(verify.CHECKLIST.length === 11, "CHECKLIST has 11 items");
assert(typeof verify.saveVerification === "function", "saveVerification exists");
assert(typeof verify.scanUnsupported === "function", "scanUnsupported exists");
assert(typeof verify.deriveState === "function", "deriveState exists");

section("2. RAW content unchanged by verification");
var raw = { id: "v-001", title: "PM-KISAN", raw_content: "The scheme provides Six Thousand Rupees. Apply at pmkisan.gov.in.", source_url: "https://pib.gov.in/test", source_name: "PIB" };
var guide = { title: "PM-KISAN", summary: "Six Thousand Rupees.", source_ids: ["https://pib.gov.in/test"], status: "draft" };
var rawCopy = JSON.stringify(raw);
verify.saveVerification({ raw: raw, guide: guide, checklist: verify.blankChecklist(), reviewer_notes: "", state: "" });
assert(JSON.stringify(raw) === rawCopy, "RAW object not mutated");

section("3. Refined guide intact");
assert(guide.title === "PM-KISAN", "Guide title present");
assert(guide.source_ids[0] === "https://pib.gov.in/test", "Source ID present");
assert(guide.status === "draft", "Status is draft");

section("4. 11-point checklist");
var blank = verify.blankChecklist();
assert(Object.keys(blank).length === 11, "11 keys");
["title", "summary", "facts", "amounts", "dates", "eligibility", "benefits", "documents", "application_process", "source_url", "no_unsupported_info"].forEach(function (k) {
  assert(blank[k] === false, "Key '" + k + "' starts false");
});

section("5. Verification record persists in memory");
var allChecks = {};
["title", "summary", "facts", "amounts", "dates", "eligibility", "benefits", "documents", "application_process", "source_url", "no_unsupported_info"].forEach(function (k) { allChecks[k] = true; });
var sv = verify.saveVerification({ raw: raw, guide: guide, checklist: allChecks, reviewer_notes: "", state: "verified" });
assert(sv.ok, "saveVerification ok");
assert(sv.record.state === "verified", "state = verified");
assert(sv.record.checklist.title === true, "checklist persisted");
assert(sv.record.verified_at.length > 0, "verified_at set");

section("6. Verified status persists");
assert(sv.record.state === "verified", "state = verified");

section("7. Changes_required persists");
var cr = verify.saveVerification({ raw: raw, guide: guide, checklist: { title: true, summary: false }, reviewer_notes: "Summary needs revision", state: "changes_required" });
assert(cr.ok, "changes_required ok");
assert(cr.record.state === "changes_required", "state = changes_required");
assert(cr.record.reviewer_notes === "Summary needs revision", "notes persisted");

section("8. Draft status unchanged");
assert(sv.draftStays === "draft", "draftStays = draft");
assert(sv.record.approves === false, "does not approve");
assert(sv.record.publishes === false, "does not publish");

section("9. Cannot approve via verification");
assert(sv.record.approves === false, "approves false");

section("10. Cannot publish via verification");
assert(sv.record.publishes === false, "publishes false");

section("11. Source URL unchanged");
assert(sv.record.source_url === "https://pib.gov.in/test", "source_url preserved");

section("12. Publication date unchanged");
assert(sv.record.source_published_date === "", "date preserved");

section("13. Changes_required requires notes");
var crNo = verify.saveVerification({ raw: raw, guide: guide, checklist: {}, reviewer_notes: "", state: "changes_required" });
assert(crNo.ok === false, "fails without notes");
assert(crNo.code === "INVALID_INPUT", "code = INVALID_INPUT");

section("14. DB verification persistence");
var hasKey = !!(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (hasKey) {
  var db = loadMod("build/db-content.js");
  var tid = "V22-" + Date.now();
  asyncResults.push(
    db.insert({ release_id: tid, release_url: "https://pib.gov.in/" + tid, source_name: "Test", source_url: "https://pib.gov.in/test", title: "Micro22 Test", raw_content: "Test content.", raw_html: "<p>T</p>", primary_category: "Government", categorization_status: "categorized", status: "draft", refinement_status: "pending", verification_status: "not_verified" }).then(function (ins) {
      var vr = verify.saveVerification({ raw: { id: ins.id, title: ins.title, raw_content: ins.raw_content, source_url: ins.source_url }, guide: { title: ins.title, source_ids: [ins.source_url], status: "draft" }, checklist: { title: true, summary: true, facts: true, amounts: true, dates: true, eligibility: true, benefits: true, documents: true, application_process: true, source_url: true, no_unsupported_info: true }, reviewer_notes: "", state: "verified" });
      assert(vr.ok, "verify ok");
      return db.update(ins.id, { verification_status: "verified", verification_data: vr.record });
    }).then(function (upd) {
      assert(upd.verification_status === "verified", "DB verification_status = verified");
      assert(upd.verification_data !== null, "DB verification_data stored");
      assert(upd.verification_data.state === "verified", "verification_data.state = verified");
      assert(upd.status === "draft", "status stays draft");
      assert(upd.verification_data.approves === false, "no approve");
      assert(upd.verification_data.publishes === false, "no publish");
      return db.findByReleaseId(tid);
    }).then(function (rb) {
      assert(!!rb, "read back ok");
      assert(rb.verification_status === "verified", "persists after re-read");
      assert(rb.verification_data.state === "verified", "verification_data persists");
      assert(rb.raw_content === "Test content.", "RAW preserved");
      return db.remove(rb.id);
    }).then(function () { assert(true, "cleanup done"); })
    .catch(function (e) { assert(false, "DB test failed", e.message); })
  );
} else { console.log("  SKIP: No SUPABASE_SERVICE_ROLE_KEY"); }

function finish() { console.log("\n========================================\nMICRO 22 TEST SUMMARY\n========================================\nPassed:  " + passed + "\nFailed:  " + failed + "\n========================================"); process.exit(failed > 0 ? 1 : 0); }
if (asyncResults.length > 0) { Promise.all(asyncResults).then(finish).catch(function (e) { failed++; console.log("ASYNC:", e.message || e); finish(); }); } else { finish(); }
