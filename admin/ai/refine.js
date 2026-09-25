// Samjho Admin - AI Refinement foundation (MICRO 9). MOCK ONLY.
// FLOW: Raw Announcement -> AI Refinement -> Draft Guide -> Review Queue
//       -> Human Verification -> Approved -> Publish.
// This file = step 2 only. No provider/API, no DB/auth, no publishing.
// Input: RAW inbox item. Output: Guide-schema draft (status always draft).
// RAW never modified. Unknowns => "Not specified in the official source."

(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.SamjhoAIRefine = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var NOT_SPECIFIED = "Not specified in the official source.";
  var MOCK_PROVIDER = "mock";

  var ERROR_CODES = {
    INVALID_RAW_INPUT: "INVALID_RAW_INPUT",
    AI_REFINEMENT_FAILED: "AI_REFINEMENT_FAILED",
    INVALID_GUIDE_OUTPUT: "INVALID_GUIDE_OUTPUT",
    MANUAL_CATEGORIZATION_REQUIRED: "MANUAL_CATEGORIZATION_REQUIRED"
  };

  function fail(code, message, extra) {
    return Object.assign({ ok: false, code: code, message: message }, extra || {});
  }
  function text(v) { return String(v == null ? "" : v); }
  function cleanLines(raw) {
    return text(raw).replace(/\r/g, "\n").split("\n")
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0; });
  }
  function slugify(t) {
    return text(t).toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, "-")
      .replace(/^-+|-+$/g, "").slice(0, 80) || "draft-guide";
  }
  function today() { return new Date().toISOString().slice(0, 10); }

  function rawWordSet(raw) {
    var words = text(raw).toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, " ").split(/\s+/);
    var set = {};
    for (var i = 0; i < words.length; i++) { if (words[i].length >= 4) set[words[i]] = true; }
    return set;
  }
  function grounded(cands, rawSet) {
    var out = [];
    for (var i = 0; i < (cands || []).length; i++) {
      var c = text(cands[i]).trim();
      if (!c) continue;
      var keys = c.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, " ").split(/\s+/);
      var hit = false;
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].length >= 4 && rawSet[keys[k]]) { hit = true; break; }
      }
      if (hit) out.push(c);
    }
    return out;
  }
  function firstSentences(raw, max) {
    var parts = text(raw).replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
    var out = [];
    for (var i = 0; i < parts.length && out.length < max; i++) {
      var s = parts[i].trim();
      if (s.length >= 20) out.push(s);
    }
    return out;
  }
  function validateRawInput(raw) {
    if (!raw || typeof raw !== "object") {
      return fail(ERROR_CODES.INVALID_RAW_INPUT, "AI refinement failed: RAW announcement is missing.");
    }
    var errors = [];
    if (!text(raw.title).trim()) errors.push("title is required");
    if (!text(raw.raw_content).trim()) errors.push("raw_content is required");
    if (!text(raw.source_url).trim()) errors.push("source_url is required");
    if (!text(raw.source_name).trim()) errors.push("source_name is required");
    if (errors.length) {
      return fail(ERROR_CODES.INVALID_RAW_INPUT,
        "AI refinement failed: invalid RAW input (" + errors.join("; ") + "). RAW left unchanged.");
    }
    return { ok: true };
  }

  function mockRefine(raw) {
    var rawText = text(raw.raw_content);
    var rawSet = rawWordSet(rawText);
    var sourceName = text(raw.source_name).trim();
    var sourceUrl = text(raw.source_url).trim();
    // DYNAMIC DATE FIX: copy the fetched official date only. Empty stays
    // empty (downstream marks unavailable) — never today, never invented.
    var sourceDate = text(raw.source_published_date).trim();
    var sourceDateAvailable = sourceDate !== "";
    // Carry the same availability flag into the draft layer.
    var catDateAvailable = cat && ("source_date_available" in cat)
      ? !!cat.source_date_available : sourceDateAvailable;
    // MICRO 11: optional categorized metadata rides along on the RAW item
    // (raw.categorization) or options. Never invented — only copied.
    var cat = (raw && raw.categorization && typeof raw.categorization === "object")
      ? raw.categorization : null;
    var leads = firstSentences(rawText, 2);
    var summary = leads.length ? leads.join(" ") : text(raw.title).trim();
    if (summary.length > 300) summary = summary.slice(0, 297).trim() + "...";
    var paras = cleanLines(rawText).filter(function (l) { return l.length >= 20; });
    var kept = grounded(paras.slice(0, 4), rawSet);
    // MICRO 11: carry categorized metadata into the draft (copies only).
    // Top-level category prefers categorized value; raw.category is fallback.
    var catCategory = cat ? text(cat.category).trim() : "";
    var needsManual = cat ? (text(cat.category).trim() === "Needs Manual Categorization" ||
      text(cat.categorization_status).trim() === "needs_manual_categorization") : false;
    return {
      id: "",
      title: text(raw.title).trim(),
      slug: slugify(raw.title),
      category: (catCategory && !needsManual ? catCategory.toLowerCase() : (text(raw.category).trim() || "government")),
      summary: summary,
      content: kept.length ? kept.join("\n\n") : summary,
      eligibility: [NOT_SPECIFIED],
      benefits: [NOT_SPECIFIED],
      required_documents: [NOT_SPECIFIED],
      application_process: [NOT_SPECIFIED],
      important_dates: sourceDateAvailable ? [sourceDate + " (as given in the official source)"] : [NOT_SPECIFIED],
      common_mistakes: [NOT_SPECIFIED],
      faqs: [],
      source_ids: [sourceUrl],
      status: "draft",
      last_updated: today(),
      source_name: sourceName,
      source_url: sourceUrl,
      source_published_date: sourceDate,
      raw_ref: text(raw.id).trim(),
      source_date_available: catDateAvailable,
      // Categorized metadata layer (separate from RAW + refined guide body):
      content_type: cat ? text(cat.content_type).trim() : "",
      sub_category: cat ? text(cat.sub_category).trim() : "",
      user_group: cat ? text(cat.user_group).trim() : "",
      categorization_status: cat ? text(cat.categorization_status).trim() : "uncategorized"
    };
  }

  function validateGuideOutput(guide) {
    var errors = [];
    if (!guide || typeof guide !== "object") errors.push("guide output missing");
    else {
      if (!text(guide.title).trim()) errors.push("title is required");
      if (!text(guide.slug).trim()) errors.push("slug is required");
      if (!text(guide.category).trim()) errors.push("category is required");
      if (text(guide.status).toLowerCase() !== "draft") errors.push("status must be draft");
      if (!text(guide.source_url).trim()) errors.push("source_url must be preserved");
    }
    if (errors.length) {
      return fail(ERROR_CODES.INVALID_GUIDE_OUTPUT,
        "AI refinement failed: invalid guide output (" + errors.join("; ") + "). RAW unchanged; nothing published.");
    }
    return { ok: true };
  }

  // Main entry. RAW returned unchanged (result.raw). Draft only, never publish.
  // provider: "mock" | "deepseek" — "deepseek" requires server-side runtime.
  function refineRawToDraft(raw, options) {
    options = options || {};
    var provider = options.provider || MOCK_PROVIDER;
    var inCheck = validateRawInput(raw);
    if (!inCheck.ok) return Object.assign({}, inCheck, { raw: raw || null, guide: null });

    // --- DeepSeek provider path ---
    if (provider === "deepseek") {
      // Server context (Micro 14 function / local Node): use the existing
      // server-side bridge directly — the key never leaves the server.
      if (typeof process !== "undefined" && process && process.env) {
        try {
          var bridge = require("./server-bridge.js");
          if (!bridge.isProviderConfigured()) {
            return fail(ERROR_CODES.AI_REFINEMENT_FAILED,
              "AI refinement failed: DeepSeek provider is not configured. Set DEEPSEEK_API_KEY environment variable on the server. " +
              "RAW unchanged; nothing published.",
              { raw: raw, guide: null, provider: "deepseek", configured: false });
          }
          // Attach categorization to raw if present (bridge expects it).
          var rawWithCat = raw.categorization ? raw : Object.assign({}, raw, { categorization: raw.categorization || null });
          return bridge.refineWithDeepSeek(rawWithCat, {
            model: options.model || undefined,
            timeoutMs: options.timeoutMs || 30000,
            fetchImpl: options.fetchImpl,
            baseUrl: options.baseUrl
          }).then(function (result) {
            if (!result.ok) {
              return Object.assign({}, result, { raw: raw, guide: null });
            }
            // Enforce draft-only status on the returned guide.
            result.guide.status = "draft";
            return {
              ok: true,
              code: "OK",
              message: "DeepSeek refinement complete: RAW restructured into a draft guide. Human verification still required.",
              guide: result.guide,
              raw: raw,
              provider: "deepseek",
              model: result.model
            };
          }).catch(function (err) {
            return fail(ERROR_CODES.AI_REFINEMENT_FAILED,
              "AI refinement failed: DeepSeek error — " + (err && err.message ? err.message : String(err)) + ". RAW unchanged; nothing published.",
              { raw: raw, guide: null, provider: "deepseek" });
          });
        } catch (loadErr) {
          return fail(ERROR_CODES.AI_REFINEMENT_FAILED,
            "AI refinement failed: cannot load DeepSeek server bridge — " + (loadErr && loadErr.message ? loadErr.message : String(loadErr)) +
            ". RAW unchanged; nothing published. Ensure server-bridge.js is deployed on the server side.",
            { raw: raw, guide: null, provider: "deepseek", bridgeError: true });
        }
      }

      // Browser context (MICRO 14/15A+): the browser NEVER contacts the AI provider
      // directly and never holds the API key. POST the required refinement
      // input to the server-side Edge Function, which runs the same bridge
      // server-side and returns the same structured result format.
      // Production: Supabase Edge Function (SamjhoSupabaseEndpoint).
      // Fallback:   Firebase Cloud Function (SamjhoServerEndpoint).
      var _root = typeof self !== "undefined" ? self : this;
      var supEndpoint = _root.SamjhoSupabaseEndpoint;
      var fbEndpoint = _root.SamjhoServerEndpoint;
      if (supEndpoint && typeof supEndpoint.refineViaSupabase === "function") {
        return supEndpoint.refineViaSupabase(raw, raw && raw.categorization ? raw.categorization : null, {
          endpoint: options.serverEndpoint
        }).then(function (result) {
          if (!result.ok) {
            return Object.assign({}, result, { raw: raw, guide: null });
          }
          result.guide.status = "draft";
          return {
            ok: true,
            code: "OK",
            message: "DeepSeek refinement complete (via Supabase Edge Function): RAW restructured into a draft guide. " +
              "Human verification still required.",
            guide: result.guide,
            raw: raw,
            provider: "deepseek",
            model: result.model
          };
        }).catch(function (err) {
          return fail(ERROR_CODES.AI_REFINEMENT_FAILED,
            "AI refinement failed: Supabase endpoint error — " + (err && err.message ? err.message : String(err)) +
            ". RAW unchanged; nothing published.",
            { raw: raw, guide: null, provider: "deepseek" });
        });
      }
      if (fbEndpoint && typeof fbEndpoint.refineViaServer === "function") {
        return fbEndpoint.refineViaServer(raw, raw && raw.categorization ? raw.categorization : null, {
          endpoint: options.serverEndpoint
        }).then(function (result) {
          if (!result.ok) {
            return Object.assign({}, result, { raw: raw, guide: null });
          }
          result.guide.status = "draft";
          return {
            ok: true,
            code: "OK",
            message: "DeepSeek refinement complete (via Firebase Cloud Function): RAW restructured into a draft guide. " +
              "Human verification still required.",
            guide: result.guide,
            raw: raw,
            provider: "deepseek",
            model: result.model
          };
        }).catch(function (err) {
          return fail(ERROR_CODES.AI_REFINEMENT_FAILED,
            "AI refinement failed: server endpoint error — " + (err && err.message ? err.message : String(err)) +
            ". RAW unchanged; nothing published.",
            { raw: raw, guide: null, provider: "deepseek" });
        });
      }
      return fail(ERROR_CODES.AI_REFINEMENT_FAILED,
        "AI refinement failed: no secure server endpoint client is available. " +
        "Load admin/ai/supabase-endpoint.js (or server-endpoint.js) before refine.js. RAW unchanged; nothing published.",
        { raw: raw, guide: null, provider: "deepseek", requiresServer: true });
    }

    // --- Mock provider path (existing behavior, unchanged) ---
    if (provider !== MOCK_PROVIDER) {
      return fail(ERROR_CODES.AI_REFINEMENT_FAILED,
        "AI refinement failed: only the mock and deepseek providers are available. RAW unchanged; nothing published.",
        { raw: raw, guide: null });
    }
    if (options.simulateFailure) {
      return fail(ERROR_CODES.AI_REFINEMENT_FAILED,
        "AI refinement failed: mock simulated failure. RAW unchanged; nothing published.",
        { raw: raw, guide: null });
    }
    var guide;
    try { guide = mockRefine(raw); }
    catch (e) {
      return fail(ERROR_CODES.AI_REFINEMENT_FAILED,
        "AI refinement failed: " + (e && e.message ? e.message : String(e)) + ". RAW unchanged; nothing published.",
        { raw: raw, guide: null });
    }
    guide.status = "draft";
    var outCheck = validateGuideOutput(guide);
    if (!outCheck.ok) return Object.assign({}, outCheck, { raw: raw, guide: null });
    return { ok: true, code: "OK",
      message: "Mock refinement complete: RAW restructured into a draft guide. Human verification still required.",
      guide: guide, raw: raw, provider: "mock" };
  }

  return {
    NOT_SPECIFIED: NOT_SPECIFIED,
    ERROR_CODES: ERROR_CODES,
    validateRawInput: validateRawInput,
    validateGuideOutput: validateGuideOutput,
    refineRawToDraft: refineRawToDraft
  };
});

