// Admin Draft Editor — content refinement inside the Content Inbox.
// MOCK DATA ONLY: drafts live in an in-memory store. No database, no auth,
// no AI automation, no publishing logic.
//
// Guide field names follow admin/schemas/guide.js exactly.
// Preview is rendered by the EXISTING Master Guide Template
// (build/templates/master-guide.js, exposed here as window.MasterGuideTemplate).

(function () {
  "use strict";

  var currentItemId = null;
  var slugManuallyEdited = false;

  var draftStore = []; // in-memory mock drafts

  var LIST_FIELDS = [
    { id: "g-eligibility", name: "eligibility" },
    { id: "g-benefits", name: "benefits" },
    { id: "g-required-documents", name: "required_documents" },
    { id: "g-application-process", name: "application_process" },
    { id: "g-important-dates", name: "important_dates" },
    { id: "g-common-mistakes", name: "common_mistakes" },
  ];

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function setVal(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value == null ? "" : String(value);
  }

  function linesToList(text) {
    return String(text || "")
      .split("\n")
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line !== ""; });
  }

  function listToLines(list) {
    return Array.isArray(list) ? list.join("\n") : "";
  }

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\u0900-\u097F]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  // ------------------------------------------------------------- FAQ rows
  function addFaqRow(q, a) {
    var wrap = document.getElementById("g-faqs");
    if (!wrap) return;
    var row = document.createElement("div");
    row.className = "faq-row";
    row.innerHTML =
      '<input type="text" class="faq-row__q" placeholder="Question" value="' + esc(q || "") + '" />' +
      '<input type="text" class="faq-row__a" placeholder="Answer" value="' + esc(a || "") + '" />' +
      '<button type="button" class="faq-row__remove" title="Remove FAQ">×</button>';
    row.querySelector(".faq-row__remove").addEventListener("click", function () {
      row.remove();
    });
    wrap.appendChild(row);
  }

  function clearFaqRows() {
    var wrap = document.getElementById("g-faqs");
    if (wrap) wrap.innerHTML = "";
  }

  function readFaqRows() {
    var rows = document.querySelectorAll("#g-faqs .faq-row");
    var faqs = [];
    rows.forEach(function (row) {
      var q = row.querySelector(".faq-row__q").value.trim();
      var a = row.querySelector(".faq-row__a").value.trim();
      if (q && a) faqs.push({ q: q, a: a });
    });
    return faqs;
  }

  // ------------------------------------------------------------- open
  // MICRO 9: open() runs the MOCK AI refinement (admin/ai/refine.js) on the
  // RAW inbox item, then fills the EXISTING Guide-schema form + Master Guide
  // preview. RAW is shown separately and never modified. Draft only.
  function fillFromRefined(guide) {
    setVal("g-title", guide.title || "");
    setVal("g-slug", guide.slug || slugify(guide.title || ""));
    setVal("g-category", guide.category || "government");
    setVal("g-summary", guide.summary || "");
    setVal("g-content", guide.content || "");
    setVal("g-eligibility", listToLines(guide.eligibility));
    setVal("g-benefits", listToLines(guide.benefits));
    setVal("g-required-documents", listToLines(guide.required_documents));
    setVal("g-application-process", listToLines(guide.application_process));
    setVal("g-important-dates", listToLines(guide.important_dates));
    setVal("g-common-mistakes", listToLines(guide.common_mistakes));
    clearFaqRows();
    (guide.faqs || []).forEach(function (f) { addFaqRow(f.q || f.question, f.a || f.answer); });
    setVal("g-source-ids", Array.isArray(guide.source_ids) ? guide.source_ids.join(", ") : (guide.source_url || ""));
    setVal("g-last-updated", guide.last_updated || today());
  }

  function showRawBlock(item) {
    var meta = document.getElementById("refine-raw-meta");
    var body = document.getElementById("refine-raw-body");
    var status = document.getElementById("refine-status");
    if (meta) meta.textContent = "Source: " + (item.source_name || "—") + " · " + (item.source_url || "—") +
      " · Date: " + (item.source_published_date ? item.source_published_date : "Date unavailable — manual review");
    if (body) body.textContent = item.raw_content || "";
    return status;
  }

  function open(item) {
    currentItemId = item ? item.id : null;
    slugManuallyEdited = false;

    var statusEl = showRawBlock(item || {});

    // Mock AI refinement first; fall back to previous manual prefill on error.
    var refined = null;
    var refineError = null;
    try {
      if (window.SamjhoAIRefine && typeof window.SamjhoAIRefine.refineRawToDraft === "function") {
        var res = window.SamjhoAIRefine.refineRawToDraft(item, { provider: "mock" });
        if (res && res.ok) refined = res.guide;
        else refineError = res;
      }
    } catch (e) {
      refineError = { code: "AI_REFINEMENT_FAILED", message: "AI refinement failed: " + (e && e.message ? e.message : String(e)) };
    }

    if (refined) {
      fillFromRefined(refined);
      if (statusEl) statusEl.textContent = "Mock AI refinement complete — draft only, RAW preserved. Missing info marked as \"" +
        (window.SamjhoAIRefine.NOT_SPECIFIED || "Not specified in the official source.") + "\" Human verification still required.";
    } else {
      setVal("g-title", item.title || "");
      setVal("g-slug", slugify(item.title || ""));
      setVal("g-category", item.category || "government");

      var raw = item.raw_content || "";
      setVal("g-content", raw);
      setVal("g-summary", raw.length > 220 ? raw.slice(0, 217).replace(/\s+\S*$/, "") + "…" : raw);

      LIST_FIELDS.forEach(function (f) { setVal(f.id, ""); });
      clearFaqRows();
      setVal("g-source-ids", item.source_name || item.id || "");
      setVal("g-last-updated", today());
      if (statusEl) statusEl.textContent = refineError
        ? (refineError.code + ": " + refineError.message + " (manual prefill used; RAW unchanged; nothing published.)")
        : "AI refiner unavailable — manual prefill used; RAW unchanged.";
    }

    var msg = document.getElementById("draft-form-msg");
    if (msg) msg.textContent = "";

    showEditor(true);
    document.getElementById("editor-item-title").textContent = item.title || "";
    renderPreview(buildGuideFromForm());
  }

  // MICRO 13: additive entry point for a provider draft that was refined
  // SERVER-SIDE (DeepSeek). Skips the browser-side mock refinement and fills the
  // SAME existing Guide-schema form + Master Guide preview. RAW is still shown
  // read-only and is never modified. Draft only — no approval, no publishing.
  function openWithGuide(item, guide, note) {
    currentItemId = item ? item.id : null;
    slugManuallyEdited = false;
    var statusEl = showRawBlock(item || {});
    fillFromRefined(guide || {});
    if (statusEl) {
      statusEl.textContent = (note || "Provider refinement complete") +
        " — draft only, RAW preserved. Missing info marked as \"" +
        (window.SamjhoAIRefine && window.SamjhoAIRefine.NOT_SPECIFIED
          ? window.SamjhoAIRefine.NOT_SPECIFIED : "Not specified in the official source.") +
        "\" Human verification still required.";
    }
    var msg = document.getElementById("draft-form-msg");
    if (msg) msg.textContent = "";
    showEditor(true);
    document.getElementById("editor-item-title").textContent = item.title || "";
    renderPreview(buildGuideFromForm());
  }

  function showEditor(show) {
    var editor = document.getElementById("draft-editor");
    var preview = document.getElementById("draft-preview");
    if (editor) editor.hidden = !show;
    if (preview) preview.hidden = !show;
  }

  // ------------------------------------------------------------- preview
  function buildGuideFromForm() {
    return {
      title: val("g-title"),
      slug: val("g-slug"),
      category: val("g-category"),
      summary: val("g-summary"),
      content: val("g-content"),
      eligibility: linesToList(val("g-eligibility")),
      benefits: linesToList(val("g-benefits")),
      required_documents: linesToList(val("g-required-documents")),
      application_process: linesToList(val("g-application-process")),
      important_dates: linesToList(val("g-important-dates")),
      common_mistakes: linesToList(val("g-common-mistakes")),
      faqs: readFaqRows(),
      source_ids: val("g-source-ids").split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      status: "draft",
      last_updated: val("g-last-updated") || today(),
    };
  }

  function renderPreview(guide) {
    var body = document.getElementById("draft-preview-body");
    if (!body) return;
    if (window.MasterGuideTemplate && typeof window.MasterGuideTemplate.renderMasterGuide === "function") {
      var rendered = window.MasterGuideTemplate.renderMasterGuide(guide);
      body.innerHTML = rendered.html;
    } else {
      body.textContent = "Master Guide Template bundle not loaded.";
    }
  }

  // ------------------------------------------------------------- save draft
  function onSaveDraft(event) {
    event.preventDefault();

    if (!val("g-title")) { flash("Title is required."); return; }
    if (!val("g-slug")) { flash("Slug is required."); return; }

    var guide = buildGuideFromForm();
    guide.status = "draft"; // saving as draft always keeps status 'draft'

    var existing = null;
    for (var i = 0; i < draftStore.length; i++) {
      if (draftStore[i].inbox_item_id === currentItemId) { existing = draftStore[i]; break; }
    }
    if (existing) {
      existing.guide = guide;
      existing.saved_at = today();
    } else {
      draftStore.push({
        inbox_item_id: currentItemId,
        guide: guide,
        status: "draft",
        saved_at: today(),
      });
    }

    flash("Draft saved (status: draft, mock, in-memory only). " + draftStore.length + " draft(s) in store.");
    renderPreview(guide);
  }

  function flash(message) {
    var msg = document.getElementById("draft-form-msg");
    if (msg) msg.textContent = message;
  }

  // MICRO 12: expose current RAW + guide + categorization for the Human
  // Verification panel (verify-ui.js). RAW object is never handed out for
  // editing — the panel renders it read-only; the draft form stays editable.
  function currentContext() {
    var raw = null;
    try {
      if (window.SamjhoInbox && typeof window.SamjhoInbox.listQueued === "function") {
        var q = window.SamjhoInbox.listQueued();
        for (var i = 0; i < q.length; i++) {
          if (String(q[i].id) === String(currentItemId)) { raw = q[i]; break; }
        }
      }
    } catch (e) {}
    var cat = null;
    try {
      if (window.SamjhoCategorization && typeof window.SamjhoCategorization.readStore === "function") {
        var store = window.SamjhoCategorization.readStore();
        cat = store[currentItemId] || null;
      }
    } catch (e2) {}
    return { raw: raw, guide: buildGuideFromForm(), categorization: cat, inbox_item_id: currentItemId };
  }

  // ------------------------------------------------------------- init
  function init() {
    var form = document.getElementById("draft-form");
    if (form) {
      form.addEventListener("submit", onSaveDraft);
      // MICRO 12: keep the verification RIGHT panel live while editing.
      ["input", "change"].forEach(function (evt) {
        form.addEventListener(evt, function () {
          try {
            if (window.SamjhoVerifyUI && typeof window.SamjhoVerifyUI.refresh === "function") {
              window.SamjhoVerifyUI.refresh();
            }
          } catch (e) {}
        });
      });
    }

    var slugInput = document.getElementById("g-slug");
    if (slugInput) {
      slugInput.addEventListener("input", function () { slugManuallyEdited = true; });
    }

    var addFaqBtn = document.getElementById("g-faqs-add");
    if (addFaqBtn) addFaqBtn.addEventListener("click", function () { addFaqRow("", ""); });

    var closeBtn = document.getElementById("editor-close");
    if (closeBtn) closeBtn.addEventListener("click", function () { showEditor(false); });

    window.SamjhoDraftEditor = {
      open: open,
      openWithGuide: openWithGuide,
      drafts: draftStore, // mock store (in-memory only)
      currentContext: currentContext,
      buildGuideFromForm: buildGuideFromForm,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
