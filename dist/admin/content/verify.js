// MICRO 12 — Human Verification core (part 1: registry + guards).
// Pure logic: no DOM, no AI, no DB, no publish. UMD for Node + browser.
// Layers: RAW SOURCE (read-only) / CATEGORIZATION / REFINED DRAFT /
// HUMAN VERIFICATION (checklist + state + reviewer notes, stored apart).
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.SamjhoVerification = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var CHECKLIST = ["title", "summary", "facts", "amounts", "dates",
    "eligibility", "benefits", "documents", "application_process",
    "source_url", "no_unsupported_info"];
  var LABELS = { title: "Title verified", summary: "Summary verified",
    facts: "Facts verified", amounts: "Amounts verified",
    dates: "Dates verified", eligibility: "Eligibility verified",
    benefits: "Benefits verified", documents: "Documents verified",
    application_process: "Application process verified",
    source_url: "Source URL verified",
    no_unsupported_info: "No unsupported information added" };
  var STATES = ["not_verified", "in_progress", "verified", "changes_required"];
  var ERRORS = { INVALID_INPUT: "INVALID_INPUT",
    MISSING_RAW: "MISSING_RAW_SOURCE",
    MISSING_SOURCE_URL: "MISSING_SOURCE_URL",
    UNSUPPORTED_INFO: "UNSUPPORTED_INFO_DETECTED" };
  function fail(code, message, extra) {
    return Object.assign({ ok: false, code: code, message: message }, extra || {});
  }
  function text(v) { return String(v == null ? "" : v); }
  function blankChecklist() {
    var c = {};
    for (var i = 0; i < CHECKLIST.length; i++) c[CHECKLIST[i]] = false;
    return c;
  }
  function normalizeChecklist(input) {
    var c = blankChecklist();
    for (var i = 0; i < CHECKLIST.length; i++) {
      var k = CHECKLIST[i];
      c[k] = !!(input && input[k] === true);
    }
    return c;
  }
  // Unsupported-info scan: refined sentences must share a keyword (>=4 chars)
  // with RAW, else flagged. Mirrors the hallucination-guard rule, no AI.
  function rawWords(rawText) {
    var words = text(rawText).toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, " ").split(/\s+/);
    var set = {};
    for (var i = 0; i < words.length; i++) { if (words[i].length >= 4) set[words[i]] = true; }
    return set;
  }
  // MICRO 12: skip source-echo fields that the refiner copies verbatim from
  // preserved metadata (dates/source echo), not invented facts. Provenance
  // phrases "(as given in the official source)" are always allowed.
  function isEchoAllowed(s) {
    return /\(as given in the official source\)/i.test(s);
  }
  function scanUnsupported(raw, guide) {
    if (!raw || !text(raw.raw_content).trim()) {
      return fail(ERRORS.MISSING_RAW, "Verification blocked: RAW source is missing.");
    }
    var set = rawWords(raw.raw_content);
    var fields = ["title", "summary", "content"];
    var lists = ["eligibility", "benefits", "required_documents",
      "application_process", "important_dates", "common_mistakes"];
    var flagged = [];
    function checkStr(val, label) {
      var parts = text(val).replace(/\s+/g, " ").split(/(?<=[.!?])\s+|\n+/);
      for (var i = 0; i < parts.length; i++) {
        var s = parts[i].trim();
        if (s.length < 20) continue;
        if (s === "Not specified in the official source.") continue;
        var keys = s.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, " ").split(/\s+/);
        var hit = false;
        for (var k = 0; k < keys.length; k++) {
          if (keys[k].length >= 4 && set[keys[k]]) { hit = true; break; }
        }
        if (!hit) flagged.push(label + ": " + (s.length > 90 ? s.slice(0, 90) + "..." : s));
      }
    }
    for (var f = 0; f < fields.length; f++) checkStr(guide[fields[f]], fields[f]);
    for (var l = 0; l < lists.length; l++) {
      if (lists[l] === "important_dates") continue; // source-date echo, not a claim
      var arr = guide[lists[l]];
      if (Array.isArray(arr)) {
        for (var j = 0; j < arr.length; j++) {
          if (isEchoAllowed(arr[j])) continue; // provenance echo, not invented
          checkStr(arr[j], lists[l]);
        }
      }
    }
    if (flagged.length) {
      return { ok: false, flagged: flagged,
        message: "Unsupported information detected (" + flagged.length + " passage(s) not grounded in RAW)." };
    }
    return { ok: true, flagged: [] };
  }

  function deriveState(checklist, notes, scan) {
    var c = normalizeChecklist(checklist);
    var total = CHECKLIST.length;
    var done = 0;
    for (var i = 0; i < CHECKLIST.length; i++) { if (c[CHECKLIST[i]]) done++; }
    if (scan && scan.ok === false) {
      return { state: "changes_required", checked: done, total: total,
        reason: "Unsupported information detected — correction required." };
    }
    if (done === 0) return { state: "not_verified", checked: done, total: total, reason: "" };
    if (done < total) return { state: "in_progress", checked: done, total: total, reason: "" };
    return { state: "verified", checked: done, total: total,
      reason: "All checks verified. Still requires Review Queue approval — verification does not publish." };
  }
  // Save verification. Notes live here, apart from RAW/Guide content.
  // "changes_required" REQUIRES notes. Verified never approves/publishes.
  function saveVerification(args) {
    args = args || {};
    var raw = args.raw;
    var guide = args.guide || {};
    var categorization = args.categorization || null;
    if (!raw || !text(raw.raw_content).trim()) {
      return fail(ERRORS.MISSING_RAW, "Cannot verify: RAW source is missing. No record created.",
        { record: null });
    }
    var sourceUrl = text(raw.source_url || guide.source_url).trim();
    if (!sourceUrl) {
      return fail(ERRORS.MISSING_SOURCE_URL, "Cannot verify: official source URL is missing. No record created.",
        { record: null });
    }
    var checklist = normalizeChecklist(args.checklist);
    var notes = text(args.reviewer_notes).trim();
    var requested = text(args.state).trim();
    var scan = scanUnsupported(raw, guide);
    var derived = deriveState(checklist, notes, scan);
    var state = derived.state;
    if (requested === "changes_required") {
      if (!notes) {
        return fail(ERRORS.INVALID_INPUT, "Changes Required needs reviewer notes explaining the correction.",
          { record: null });
      }
      state = "changes_required";
    }
    if (requested === "verified" && state !== "verified") {
      return fail(ERRORS.INVALID_INPUT,
        "Cannot mark Verified: " + derived.checked + "/" + derived.total + " checks complete" +
        (scan.ok === false ? "; unsupported info flagged" : "") + ". RAW and draft unchanged.",
        { record: null });
    }
    var record = { raw_ref: text(raw.id).trim(), state: state,
      checklist: checklist, checked: derived.checked, total: derived.total,
      reviewer_notes: notes,
      unsupported_flagged: scan.ok === false ? scan.flagged : [],
      source_name: text(raw.source_name), source_url: sourceUrl,
      // DYNAMIC DATE: fetched official date only; "" stays "" for review.
      source_published_date: text(raw.source_published_date),
      source_date_available: text(raw.source_published_date).trim() !== "",
      category: categorization ? text(categorization.category) : text(raw.category),
      sub_category: categorization ? text(categorization.sub_category) : "",
      user_group: categorization ? text(categorization.user_group) : "",
      content_type: categorization ? text(categorization.content_type) : "",
      verified_at: new Date().toISOString().slice(0, 10),
      approves: false, publishes: false };
    return { ok: true, code: "OK",
      message: state === "verified"
        ? "Verified. Draft stays in Review Queue — verification does not approve or publish."
        : (state === "changes_required"
          ? "Changes Required recorded. Draft remains editable in draft/review workflow."
          : "Verification progress saved (" + derived.checked + "/" + derived.total + ")."),
      record: record, draftStays: "draft", approved: false, published: false };
  }
  return { CHECKLIST: CHECKLIST, LABELS: LABELS, STATES: STATES, ERRORS: ERRORS,
    blankChecklist: blankChecklist, normalizeChecklist: normalizeChecklist,
    scanUnsupported: scanUnsupported, deriveState: deriveState,
    saveVerification: saveVerification };
});

