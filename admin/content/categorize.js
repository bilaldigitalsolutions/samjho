// MICRO 10 — Categorization Foundation, part 1: constants + rules.
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.SamjhoCategorizer = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var NEEDS_MANUAL = "Needs Manual Categorization";
  var CATEGORIES = ["Government", "Documents", "Business", "Money", "Education"];
  var GOV_SUBS = ["Schemes & Benefits", "Scholarships", "Government Services"];
  var USER_GROUPS = ["Farmers", "Women", "Students", "Senior Citizens",
    "Families / Low Income", "Workers", "Persons with Disabilities", "Entrepreneurs"];
  var CONTENT_TYPES = ["Announcement", "Press Release"];
  var STATUSES = ["uncategorized", "categorized", "needs_manual_categorization"];
  var ERROR_CODES = { INVALID_RAW_INPUT: "INVALID_RAW_INPUT", CATEGORIZATION_FAILED: "CATEGORIZATION_FAILED" };

  function fail(code, message, extra) {
    return Object.assign({ ok: false, code: code, message: message }, extra || {});
  }
  function text(v) { return String(v == null ? "" : v); }
  function norm(s) { return text(s).toLowerCase(); }
  function has(hay, words) {
    for (var i = 0; i < words.length; i++) { if (hay.indexOf(words[i]) !== -1) return true; }
    return false;
  }

  // Raw-only keyword rules. >=2 hits required for confidence (see part 2).
  var RULES = [
    { category: "Government", sub: "Scholarships", type: "Announcement",
      keywords: ["scholarship", "fellowship", "pre-matric", "post-matric", "nsp", "merit-cum-means"],
      group: [["Students", ["student", "scholar", "school", "college", "university", "nsp"]]] },
    { category: "Government", sub: "Schemes & Benefits", type: "Announcement",
      keywords: ["yojana", "scheme", "benefit", "subsidy", "pension", "pm-kisan", "kisan", "ujjwala", "ayushman", "ration"],
      group: [["Farmers", ["kisan", "farmer", "crop", "pm-kisan"]],
        ["Women", ["women", "ladli", "matru", "beti", "mahila"]],
        ["Senior Citizens", ["senior citizen", "old age pension", "vayoshree"]],
        ["Families / Low Income", ["ration", "bpl", "low income", "family", "aawas", "ujjwala"]],
        ["Workers", ["worker", "labour", "e-shram", "unorganised"]],
        ["Persons with Disabilities", ["disability", "divyang", "disabled"]],
        ["Entrepreneurs", ["startup", "msme", "udyam", "entrepreneur", "mudra"]],
        ["Students", ["student", "scholarship", "education"]]] },
    { category: "Government", sub: "Government Services", type: "Press Release",
      keywords: ["press release", "pib", "portal", "apply online", "certificate", "passport", "aadhaar", "voter"],
      group: [] },
    { category: "Documents", sub: "", type: "Announcement",
      keywords: ["aadhaar", "pan card", "passport", "voter id", "birth certificate", "caste certificate", "domicile"],
      group: [] },
    { category: "Business", sub: "", type: "Announcement",
      keywords: ["gst", "msme", "udyam", "startup", "company registration", "trademark", "shop act", "business loan"],
      group: [["Entrepreneurs", ["startup", "msme", "udyam", "entrepreneur", "business", "trademark"]]] },
    { category: "Money", sub: "", type: "Announcement",
      keywords: ["savings", "interest rate", "ppf", "nps", "mutual fund", "credit score", "emi", "loan interest"],
      group: [] },
    { category: "Education", sub: "", type: "Announcement",
      keywords: ["admission", "exam", "board result", "neet", "jee", "cuet", "syllabus", "school", "college"],
      group: [["Students", ["student", "exam", "school", "college", "university", "admission"]]] }
  ];
  function scoreRule(hay, rule) {
    var hits = 0;
    for (var i = 0; i < rule.keywords.length; i++) {
      if (hay.indexOf(rule.keywords[i]) !== -1) hits++;
    }
    return hits;
  }
  function pickGroup(hay, rule) {
    for (var i = 0; i < rule.group.length; i++) {
      if (has(hay, rule.group[i][1])) return rule.group[i][0];
    }
    return "";
  }
  function validateRaw(item) {
    if (!item || typeof item !== "object") {
      return fail(ERROR_CODES.INVALID_RAW_INPUT, "Categorization failed: RAW item is missing.");
    }
    var errors = [];
    if (!text(item.title).trim()) errors.push("title is required");
    if (!text(item.raw_content).trim()) errors.push("raw_content is required");
    if (!text(item.source_name).trim()) errors.push("source_name is required");
    if (!text(item.source_url).trim()) errors.push("source_url is required");
    if (errors.length) {
      return fail(ERROR_CODES.INVALID_RAW_INPUT,
        "Categorization failed: invalid RAW (" + errors.join("; ") + "). No fake article created.");
    }
    return { ok: true };
  }
  // Mock categorize. Never touches RAW. Source fields copied unchanged.
  function mockCategorize(item) {
    var hay = norm(item.title + "\n" + item.raw_content);
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < RULES.length; i++) {
      var s = scoreRule(hay, RULES[i]);
      if (s > bestScore) { bestScore = s; best = RULES[i]; }
    }
    if (!best || bestScore < 2) {
      return { content_type: "", category: NEEDS_MANUAL, sub_category: "", user_group: "",
        categorization_status: "needs_manual_categorization", confidence: "low",
        reason: "No confident category found in raw source content." };
    }
    return { content_type: best.type, category: best.category, sub_category: best.sub || "",
      user_group: pickGroup(hay, best), categorization_status: "categorized",
      confidence: bestScore >= 3 ? "high" : "medium",
      reason: "Matched " + bestScore + " raw-content keyword(s) for " + best.category +
        (best.sub ? " / " + best.sub : "") + "." };
  }
  // Main entry. Returns { ok, categorization, raw } — raw is the SAME object.
  function categorizeRaw(item, options) {
    options = options || {};
    var provider = options.provider || "mock";
    var check = validateRaw(item);
    if (!check.ok) return Object.assign({}, check, { categorization: null, raw: item || null });
    if (provider !== "mock") {
      return fail(ERROR_CODES.CATEGORIZATION_FAILED,
        "Categorization failed: only the mock provider is available (no AI connected). RAW unchanged.",
        { categorization: null, raw: item });
    }
    if (options.simulateFailure) {
      return fail(ERROR_CODES.CATEGORIZATION_FAILED,
        "Categorization failed: mock simulated failure. RAW unchanged.",
        { categorization: null, raw: item });
    }
    var cat;
    try { cat = mockCategorize(item); }
    catch (e) {
      return fail(ERROR_CODES.CATEGORIZATION_FAILED,
        "Categorization failed: " + (e && e.message ? e.message : String(e)) + ". RAW unchanged.",
        { categorization: null, raw: item });
    }
    return { ok: true, code: "OK",
      message: cat.categorization_status === "categorized"
        ? "Mock categorization complete: " + cat.category + (cat.sub_category ? " / " + cat.sub_category : "") + "."
        : "Categorization unclear: marked '" + NEEDS_MANUAL + "'.",
      categorization: { raw_ref: text(item.id).trim(), content_type: cat.content_type,
        category: cat.category, sub_category: cat.sub_category, user_group: cat.user_group,
        categorization_status: cat.categorization_status, confidence: cat.confidence,
        reason: cat.reason, provider: "mock",
        source_name: text(item.source_name), source_url: text(item.source_url),
        // DYNAMIC DATE: fetched official date only; "" stays "" for review.
        source_published_date: text(item.source_published_date),
        source_date_available: text(item.source_published_date).trim() !== "" },
      raw: item };
  }
  function isRefineEligible(result) {
    return Boolean(result && result.ok && result.raw &&
      text(result.raw.title).trim() && text(result.raw.raw_content).trim());
  }
  return { NEEDS_MANUAL: NEEDS_MANUAL, CATEGORIES: CATEGORIES, GOV_SUBS: GOV_SUBS,
    USER_GROUPS: USER_GROUPS, CONTENT_TYPES: CONTENT_TYPES, STATUSES: STATUSES,
    ERROR_CODES: ERROR_CODES, categorizeRaw: categorizeRaw,
    validateRaw: validateRaw, isRefineEligible: isRefineEligible };
});
