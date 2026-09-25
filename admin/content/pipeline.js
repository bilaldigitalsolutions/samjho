// MICRO 11 — Categorized -> Refinement pipeline (part 1: core).
// Makes categorized RAW the input to the Micro 9 mock refinement engine.
// Layers stay separate: RAW SOURCE CONTENT / CATEGORIZED METADATA / DRAFT.
// RAW never overwritten. Draft only. Mock provider only. No publish.

(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.SamjhoRefinePipeline = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var NEEDS_MANUAL = "Needs Manual Categorization";
  var PIPELINE_STAGES = ["RAW", "CATEGORIZED", "REFINEMENT", "DRAFT"];
  var ERROR_CODES = {
    INVALID_RAW_INPUT: "INVALID_RAW_INPUT",
    MANUAL_CATEGORIZATION_REQUIRED: "MANUAL_CATEGORIZATION_REQUIRED",
    AI_REFINEMENT_FAILED: "AI_REFINEMENT_FAILED",
    INVALID_GUIDE_OUTPUT: "INVALID_GUIDE_OUTPUT"
  };

  function fail(code, message, extra) {
    return Object.assign({ ok: false, code: code, message: message }, extra || {});
  }
  function text(v) { return String(v == null ? "" : v); }

  function needRefine() {
    if (typeof require === "function") {
      try { return require("../ai/refine.js"); } catch (e) { return null; }
    }
    return (typeof self !== "undefined" ? self : this).SamjhoAIRefine || null;
  }
  function needCat() {
    if (typeof require === "function") {
      try { return require("./categorize.js"); } catch (e) { return null; }
    }
    return (typeof self !== "undefined" ? self : this).SamjhoCategorizer || null;
  }

  // Build the refinement input: RAW + categorized metadata (copies only).
  // Requires a "categorized" categorization; uncategorized/manual => gate.
  function buildRefinementInput(raw, categorization) {
    var R = needRefine();
    var bad = R ? R.validateRawInput(raw) : { ok: !!raw };
    if (!R || !bad.ok) {
      return fail(ERROR_CODES.INVALID_RAW_INPUT,
        "Refinement failed: " + (bad && bad.message ? bad.message : "invalid RAW. No draft created."),
        { input: null, raw: raw || null });
    }
    var cat = categorization || (raw && raw.categorization) || null;
    if (!cat || text(cat.categorization_status).trim() !== "categorized") {
      var why = !cat ? "content is uncategorized"
        : "content is marked '" + NEEDS_MANUAL + "'";
      return fail(ERROR_CODES.MANUAL_CATEGORIZATION_REQUIRED,
        "Manual categorization is required first: " + why + ". Not sent to refinement. RAW unchanged.",
        { input: null, raw: raw });
    }
    return { ok: true, code: "OK",
      message: "Refinement input ready: raw + categorized metadata.",
      input: { raw_content: text(raw.raw_content), title: text(raw.title),
        id: text(raw.id), category: text(raw.category),
        source_name: text(raw.source_name), source_url: text(raw.source_url),
        // DYNAMIC DATE: fetched official date only; "" stays "" for review.
        source_published_date: text(raw.source_published_date),
        source_date_available: text(raw.source_published_date).trim() !== "",
        content_type: text(cat.content_type), top_category: text(cat.category),
        sub_category: text(cat.sub_category), user_group: text(cat.user_group) },
      raw: raw, categorization: cat };
  }

  // Main entry: categorized RAW -> refinement engine -> Guide draft.
  // Never touches RAW (passes a shallow copy carrying categorization).
  // provider: "mock" (sync, browser-safe) | "deepseek" (async, server-side).
  // Returns a plain result for mock and a Promise for deepseek, so callers
  // must handle both (see pipeline-ui.js).
  function refineCategorized(raw, categorization, options) {
    options = options || {};
    var R = needRefine();
    if (!R) {
      return fail(ERROR_CODES.AI_REFINEMENT_FAILED,
        "Refinement failed: mock refiner unavailable. RAW unchanged.",
        { guide: null, raw: raw || null });
    }
    var built = buildRefinementInput(raw, categorization);
    if (!built.ok) return Object.assign({}, built, { guide: null });
    var provider = options.provider || "mock";
    if (provider !== "mock" && provider !== "deepseek") {
      return fail(ERROR_CODES.AI_REFINEMENT_FAILED,
        "Refinement failed: only the mock and deepseek providers are available. RAW unchanged.",
        { guide: null, raw: raw });
    }

    // Build the final pipeline result from a provider result. Draft-only is
    // enforced here; the approval/publish gates are never touched.
    function finalize(res) {
      if (!res || !res.ok) {
        return Object.assign({}, res, { guide: null, raw: raw });
      }
      res.guide.status = "draft";
      return { ok: true, code: "OK",
        message: res.provider === "deepseek"
          ? "Categorized content refined to draft (DeepSeek). Human review still required."
          : "Categorized content refined to draft (mock). Human review still required.",
        guide: res.guide,
        categorization: built.categorization,
        input: built.input,
        raw: raw,
        stages: { RAW: true, CATEGORIZED: true, REFINEMENT: true, DRAFT: true },
        provider: res.provider || "mock" };
    }

    var rawCopy = Object.assign({}, raw, { categorization: built.categorization });
    var res;
    try {
      res = R.refineRawToDraft(rawCopy, {
        provider: provider,
        model: options.model,
        timeoutMs: options.timeoutMs,
        fetchImpl: options.fetchImpl,
        baseUrl: options.baseUrl
      });
    } catch (e) {
      return fail(ERROR_CODES.AI_REFINEMENT_FAILED,
        "Refinement failed: " + (e && e.message ? e.message : String(e)) + ". RAW unchanged.",
        { guide: null, raw: raw });
    }

    // Async (server-side DeepSeek) provider result.
    if (res && typeof res.then === "function") {
      return res.then(finalize).catch(function (err) {
        return fail(ERROR_CODES.AI_REFINEMENT_FAILED,
          "Refinement failed: " + (err && err.message ? err.message : String(err)) + ". RAW unchanged.",
          { guide: null, raw: raw });
      });
    }

    return finalize(res);
  }

  // Pipeline-state helper for admin UI visibility.
  function pipelineState(raw, categorization) {
    var hasRaw = !!(raw && text(raw.raw_content).trim());
    var st = categorization ? text(categorization.categorization_status).trim() : "";
    return { RAW: hasRaw, CATEGORIZED: st === "categorized",
      REFINEMENT: false, DRAFT: false,
      gate: !hasRaw ? "INVALID_RAW" : (st === "categorized" ? "READY" : "MANUAL_CATEGORIZATION_REQUIRED") };
  }

  return { NEEDS_MANUAL: NEEDS_MANUAL, PIPELINE_STAGES: PIPELINE_STAGES,
    ERROR_CODES: ERROR_CODES, buildRefinementInput: buildRefinementInput,
    refineCategorized: refineCategorized, pipelineState: pipelineState };
});
