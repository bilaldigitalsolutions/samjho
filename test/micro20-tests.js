// MICRO 20 — Database Adapter Tests
"use strict";
const path = require("path");
const fs = require("fs");
const root = path.resolve(__dirname, "..");
var passed = 0, failed = 0, asyncResults = [];
function assert(c, n, d) { if (c) { passed++; console.log("  PASS: " + n); } else { failed++; console.log("  FAIL: " + n + (d ? " — " + d : "")); } }
function section(t) { console.log("\n--- " + t + " ---"); }
function loadMod(r) { return require(path.join(root, r)); }

section("1. Database adapter loads");
var db; try { db = loadMod("build/db-content.js"); } catch (e) { db = null; }
assert(db !== null, "db-content.js loads");
if (db) {
  assert(typeof db.insert === "function", "insert");
  assert(typeof db.select === "function", "select");
  assert(typeof db.update === "function", "update");
  assert(typeof db.findByReleaseId === "function", "findByReleaseId");
  assert(typeof db.findByReleaseUrl === "function", "findByReleaseUrl");
  assert(typeof db.findUnrefined === "function", "findUnrefined");
}

section("2. Schema structure");
var mPath = path.join(root, "supabase", "migrations", "20260921000000_content_items.sql");
assert(fs.existsSync(mPath), "Migration file exists");
var m = fs.readFileSync(mPath, "utf8");
["verification_status", "review_status", "approval_status", "raw_content", "raw_html", "refined_guide", "source_url", "release_id"].forEach(function (col) {
  assert(m.indexOf(col) > -1, "Column " + col + " in schema");
});

section("3. Browser adapter loads");
var bdb; try { bdb = loadMod("admin/content/supabase-content.js"); } catch (e) { bdb = null; }
assert(bdb !== null, "supabase-content.js loads");
if (bdb) { assert(typeof bdb.select === "function", "select"); assert(typeof bdb.insert === "function", "insert"); assert(typeof bdb.update === "function", "update"); }

section("4. Verify module loads");
var verify; try { verify = loadMod("admin/content/verify.js"); } catch (e) { verify = null; }
assert(verify !== null, "verify.js loads");
if (verify) {
  assert(Array.isArray(verify.CHECKLIST), "CHECKLIST is array");
  assert(verify.CHECKLIST.length === 11, "CHECKLIST has 11 items");
  assert(typeof verify.blankChecklist === "function", "blankChecklist");
  assert(typeof verify.saveVerification === "function", "saveVerification");
  assert(typeof verify.scanUnsupported === "function", "scanUnsupported");
  assert(typeof verify.deriveState === "function", "deriveState");
}

section("5. Verify functional tests");
if (verify) {
  var raw = { id: "test-raw-001", title: "PM-KISAN", raw_content: "The scheme provides Six Thousand Rupees.", source_url: "https://pib.gov.in/test" };
  var guide = { title: "PM-KISAN", summary: "Six Thousand Rupees.", source_ids: ["https://pib.gov.in/test"], status: "draft" };
  var blank = verify.blankChecklist();
  assert(blank.title === false, "blankChecklist: title false");
  assert(blank.no_unsupported_info === false, "blankChecklist: no_unsupported_info false");
  var n = verify.normalizeChecklist({ title: true, summary: true });
  assert(n.title === true, "normalizeChecklist: title true");
  assert(n.facts === false, "normalizeChecklist: facts default false");
  var scan = verify.scanUnsupported(raw, guide);
  assert(scan.ok === true, "scanUnsupported: grounded draft ok");
  var badGuide = { title: "X", summary: "Aliens visited India on spaceships last Tuesday.", source_ids: ["https://pib.gov.in/test"], status: "draft" };
  var badScan = verify.scanUnsupported(raw, badGuide);
  assert(badScan.ok === false, "scanUnsupported: flags unsupported info");
  var st1 = verify.deriveState({ title: true, summary: true, facts: true, amounts: true, dates: true, eligibility: true, benefits: true, documents: true, application_process: true, source_url: true, no_unsupported_info: true }, "", { ok: true });
  assert(st1.state === "verified", "deriveState: all checked = verified");
  var st2 = verify.deriveState({ title: true, summary: false }, "", { ok: true });
  assert(st2.state === "in_progress", "deriveState: partial = in_progress");
  var sv = verify.saveVerification({ raw: raw, guide: guide, checklist: { title: true, summary: true, facts: true, amounts: true, dates: true, eligibility: true, benefits: true, documents: true, application_process: true, source_url: true, no_unsupported_info: true }, reviewer_notes: "", state: "verified" });
  assert(sv.ok === true, "saveVerification: ok");
  assert(sv.record.state === "verified", "saveVerification: state verified");
  assert(sv.record.approves === false, "saveVerification: no approve");
  assert(sv.record.publishes === false, "saveVerification: no publish");
  assert(sv.draftStays === "draft", "saveVerification: stays draft");
}

section("6. DB integration (requires key)");
var hasKey = !!(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (hasKey && db) {
  var tid = "TEST-M20-" + Date.now();
  asyncResults.push(
    db.insert({ release_id: tid, release_url: "https://pib.gov.in/" + tid, source_name: "Test", source_url: "https://pib.gov.in/test", title: "Micro20 Test", raw_content: "Test.", raw_html: "<p>T</p>", primary_category: "Government", categorization_status: "categorized", status: "draft", refinement_status: "pending", verification_status: "not_verified" }).then(function (ins) {
      assert(!!ins.id, "Inserted with UUID");
      return db.update(ins.id, { verification_status: "verified", review_status: "pending_review" });
    }).then(function (upd) {
      assert(upd.verification_status === "verified", "verification_status = verified");
      assert(upd.status === "draft", "status stays draft");
      return db.findByReleaseId(tid);
    }).then(function (rb) {
      assert(!!rb, "read back by release_id");
      assert(rb.verification_status === "verified", "verified persists");
      assert(rb.raw_content === "Test.", "RAW preserved");
      return db.remove(rb.id);
    }).then(function () { assert(true, "cleanup done"); })
    .catch(function (e) { assert(false, "DB test failed", e.message); })
  );
} else { console.log("  SKIP: No SUPABASE_SERVICE_ROLE_KEY"); }

function finish() { console.log("\n========================================\nMICRO 20 TEST SUMMARY\n========================================\nPassed:  " + passed + "\nFailed:  " + failed + "\n========================================"); process.exit(failed > 0 ? 1 : 0); }
if (asyncResults.length > 0) { Promise.all(asyncResults).then(finish).catch(function (e) { failed++; console.log("ASYNC:", e.message || e); finish(); }); } else { finish(); }
