// MICRO 23 Tests — Review Queue -> Supabase
var passed = 0, failed = 0;
function assert(label, cond) {
  if (cond) { passed++; console.log("  PASS: " + label); }
  else { failed++; console.log("  FAIL: " + label); }
}
function assertEqual(label, a, b) { assert(label, a === b); }

console.log("=== Micro 23 Tests ===\n");

// 1. Module structure
console.log("--- Module Structure ---");
var fs = require("fs");
var c = fs.readFileSync("admin/content/review.js", "utf8");
assert("review.js exists and is non-empty", c.length > 1000);
assert("No mock data (var drafts =)", c.indexOf("var drafts =") === -1);
assert("No mock item IDs", c.indexOf("draft-001") === -1);
assert("Has TRANSITIONS", c.indexOf("TRANSITIONS") !== -1);
assert("Has requiresVerified", c.indexOf("requiresVerified") !== -1);
assert("Has SamjhoContentDB", c.indexOf("SamjhoContentDB") !== -1);
assert("Has loadFromDB", c.indexOf("loadFromDB") !== -1);
assert("Has persistUpdate", c.indexOf("persistUpdate") !== -1);
assert("Has renderTable", c.indexOf("renderTable") !== -1);
assert("Has buildForm", c.indexOf("buildForm") !== -1);
assert("Has fillForm", c.indexOf("fillForm") !== -1);
assert("Has onSave", c.indexOf("onSave") !== -1);
assert("Has onTransition", c.indexOf("onTransition") !== -1);
assert("Has openDraft", c.indexOf("openDraft") !== -1);
assert("Has init function", c.indexOf("function init") !== -1);

// 2. Transition rules
console.log("\n--- Transition Rules ---");
assert("send-review from draft", c.indexOf('"send-review": { from: "draft"') !== -1);
assert("approve from review", c.indexOf('"approve": { from: "review"') !== -1);
assert("return-draft from review", c.indexOf('"return-draft": { from: "review"') !== -1);
assert("send-review requires verified", c.indexOf('"send-review"') !== -1 && c.indexOf("requiresVerified: true") !== -1);

// 3. Verification gate
console.log("\n--- Verification Gate ---");
assert("Blocks unverified draft->review", c.indexOf("verification_status !== \"verified\"") !== -1);
assert("Shows error for unverified", c.indexOf("Verification must be") !== -1);

// 4. Workflow status persistence
console.log("\n--- Workflow Persistence ---");
assert("Sets review_status in_review on send-review", c.indexOf("review_status = \"in_review\"") !== -1 || c.indexOf('review_status:"in_review"') !== -1);
assert("Sets approval_status approved on approve", c.indexOf("approval_status = \"approved\"") !== -1 || c.indexOf('approval_status:"approved"') !== -1);
assert("Sets review_status changes_required on return", c.indexOf("review_status = \"changes_required\"") !== -1 || c.indexOf('review_status:"changes_required"') !== -1);

// 5. RAW content in form
console.log("\n--- RAW Content Display ---");
assert("RAW content textarea in form", c.indexOf("r-raw-content") !== -1);
assert("RAW content is readonly", c.indexOf('readonly style="background:#111') !== -1);
assert("RAW content filled from item", c.indexOf("item.raw_content") !== -1);

// 6. Source metadata
console.log("\n--- Source Metadata ---");
assert("Source name displayed", c.indexOf("source_name") !== -1);
assert("Source URL displayed", c.indexOf("source_url") !== -1);
assert("Source published date displayed", c.indexOf("source_published_date") !== -1);
assert("Ministry displayed", c.indexOf("ministry") !== -1);

// 7. DB columns requested
console.log("\n--- DB Query ---");
assert("Selects verification_status", c.indexOf("verification_status") !== -1);
assert("Selects review_status", c.indexOf("review_status") !== -1);
assert("Selects approval_status", c.indexOf("approval_status") !== -1);
assert("Selects refined_guide", c.indexOf("refined_guide") !== -1);
assert("Selects raw_content", c.indexOf("raw_content") !== -1);
assert("Selects raw_html", c.indexOf("raw_html") !== -1);
assert("Selects admin_notes", c.indexOf("admin_notes") !== -1);
assert("Filters draft/review/approved", c.indexOf('s==="draft"||s==="review"||s==="approved"') !== -1);

// 8. No publishing
console.log("\n--- No Publishing ---");
assert("No auto-publish action", c.indexOf('"publish"') === -1 && c.indexOf("publish-article") === -1);

// 9. Dist check
console.log("\n--- Build Output ---");
assert("dist/admin/content/review.js exists", fs.existsSync("dist/admin/content/review.js"));
var dc = fs.readFileSync("dist/admin/content/review.js", "utf8");
assert("dist review.js has Supabase", dc.indexOf("SamjhoContentDB") !== -1);
assert("dist review.js has verification gate", dc.indexOf("requiresVerified") !== -1);
assert("dist review.js has no mock data", dc.indexOf("draft-001") === -1);

// 10. Security
console.log("\n--- Security ---");
var files = [];
["dist/admin/ai", "dist/admin/content"].forEach(function (dir) {
  try {
    fs.readdirSync(dir, { recursive: true, withFileTypes: false }).forEach(function (f) {
      if (typeof f === "string" && (f.endsWith(".js") || f.endsWith(".html"))) {
        files.push(dir + "/" + f);
      }
    });
  } catch (e) {}
});
var skHits = 0;
files.forEach(function (f) {
  try {
    var t = fs.readFileSync(f, "utf8");
    if (/sk-[a-zA-Z0-9]{20,}/.test(t)) skHits++;
    if (/\$SUPABASE_SERVICE_ROLE_KEY/.test(t) || /SERVICE_ROLE_KEY.*=.*["'][^"']+["']/.test(t)) skHits++;
    if (/api\.deepseek\.com/.test(t)) skHits++;
  } catch (e) {}
});
assert("No API keys in dist/admin", skHits === 0);

// 11. Summary
console.log("\n=== RESULTS: " + passed + " passed, " + failed + " failed ===");
if (failed > 0) process.exit(1);