#!/usr/bin/env node
// MICRO 24 — Publish Approved Content from Supabase to Static Site
// Reads approved content, validates the full approval gate,
// stages through existing published-store.js.
// SAFETY: Only publishes status=approved + verification=verified + approval=approved

const fs = require("fs");
const path = require("path");
const publishedStore = require("../data/published-store");
const guideSchema = require("../../admin/schemas/guide");
let dbContent;
try { dbContent = require("../db-content"); } catch (e) { console.error("FATAL: Could not load db-content.js:", e.message); process.exit(1); }

function validateApprovalGate(item) {
  var errors = [];
  if (!item || typeof item !== "object") return { ok: false, errors: ["Item is not a valid object"] };
  if (item.status !== "approved") errors.push("status must be 'approved' (got '" + (item.status || "none") + "')");
  if (item.verification_status !== "verified") errors.push("verification_status must be 'verified' (got '" + (item.verification_status || "none") + "')");
  if (item.approval_status !== "approved") errors.push("approval_status must be 'approved' (got '" + (item.approval_status || "none") + "')");
  if (!item.refined_guide || typeof item.refined_guide !== "object") errors.push("refined_guide is missing or not an object");
  return { ok: errors.length === 0, errors };
}

function validateGuideForPublish(guide) {
  var errors = [];
  if (!guide || typeof guide !== "object") return { ok: false, errors: ["Guide object is missing"] };
  var schemaResult = guideSchema.validateGuide(guide);
  if (!schemaResult.valid) errors.push.apply(errors, schemaResult.errors);
  if (!guide.source_ids || !guide.source_ids.length) errors.push("source_ids is required");
  return { ok: errors.length === 0, errors };
}

function prepareGuideForPublish(item) {
  var guide = Object.assign({}, item.refined_guide);
  guide.status = "approved";
  if (item.source_url && (!guide.source_ids || !guide.source_ids.length)) guide.source_ids = [item.source_url];
  if (item.source_published_date && !guide.source_published_date) guide.source_published_date = item.source_published_date;
  if (!guide.last_updated) guide.last_updated = item.source_published_date || new Date().toISOString().slice(0, 10);
  guide._source = {
    content_item_id: item.id, source_name: item.source_name || "", source_url: item.source_url || "",
    release_url: item.release_url || "", release_id: item.release_id || "",
    source_published_date: item.source_published_date || "", fetched_at: item.fetched_at || "", ministry: item.ministry || "",
  };
  return guide;
}

async function publishItem(item) {
  var result = { content_item_id: item.id, slug: null, action: null, errors: [], guide: null };
  // Check already-published FIRST (before gate, since published != approved)
  if (item.status === "published") { result.action = "already_published"; result.slug = item.refined_guide && item.refined_guide.slug; return result; }
  var gateCheck = validateApprovalGate(item);
  if (!gateCheck.ok) { result.errors = gateCheck.errors; result.action = "rejected_gate"; return result; }
  var guide = prepareGuideForPublish(item);
  result.slug = guide.slug;
  var guideCheck = validateGuideForPublish(guide);
  if (!guideCheck.ok) { result.errors = guideCheck.errors; result.action = "rejected_guide_validation"; return result; }
  try { var staged = publishedStore.stageApprovedGuide(guide); result.guide = staged; result.action = "staged"; }
  catch (err) { result.errors.push("Stage failed: " + err.message); result.action = "rejected_stage"; return result; }
  try { await dbContent.update(item.id, { status: "published", updated_at: new Date().toISOString() }); result.action = "published"; }
  catch (err) { console.error("  WARNING: Supabase update failed:", err.message); result.action = "staged_db_error"; }
  return result;
}

async function publishApproved() {
  console.log("MICRO 24 — Publishing approved content from Supabase\n");
  var items;
  try { items = await dbContent.select({ columns: "*", filter: { status: "approved" } }); }
  catch (err) { console.error("FATAL: Could not load from Supabase:", err.message); process.exit(1); }
  var eligible = items.filter(function (it) {
    return it.verification_status === "verified" && it.approval_status === "approved" && it.refined_guide && typeof it.refined_guide === "object";
  });
  console.log("Found " + eligible.length + " eligible approved item(s) to publish.\n");
  if (eligible.length === 0) { console.log("Nothing to publish. Done."); return { published: 0, staged: 0, skipped: 0, failed: 0 }; }
  var results = { published: 0, staged: 0, skipped: 0, failed: 0 };
  for (var i = 0; i < eligible.length; i++) {
    var item = eligible[i];
    console.log("Processing: " + (item.title || item.id) + " (" + ((item.refined_guide && item.refined_guide.slug) || "no-slug") + ")");
    var result = await publishItem(item);
    if (result.action === "published" || result.action === "staged") { results.staged++; console.log("  -> Staged to published-guides.json"); }
    else if (result.action === "already_published") { results.skipped++; console.log("  -> Already published, skipping"); }
    else if (result.action === "staged_db_error") { results.staged++; console.log("  -> Staged but DB update failed"); }
    else { results.failed++; console.log("  -> REJECTED: " + result.errors.join("; ")); }
    console.log("");
  }
  console.log("SUMMARY: Staged=" + results.staged + " Skipped=" + results.skipped + " Failed=" + results.failed);
  return results;
}

if (require.main === module) {
  publishApproved().then(function (r) { if (r.failed > 0) process.exit(1); }).catch(function (e) { console.error("FATAL:", e); process.exit(1); });
}

module.exports = { publishItem, publishApproved, validateApprovalGate, validateGuideForPublish, prepareGuideForPublish };
