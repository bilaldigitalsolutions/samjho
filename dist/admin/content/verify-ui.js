// MICRO 12 UI — Human Verification view (part 1: panel + LEFT source).
// LEFT = RAW SOURCE read-only (+ source link, type, category metadata).
// RIGHT (part 2) = refined draft read-preview + checklist + state + notes.
// Draft stays editable in the EXISTING draft form; verification never
// approves/publishes and never bypasses the Review Queue gate.
(function () {
  "use strict";
  var STORE_KEY = "samjho_verification_store";
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function readStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var p = raw ? JSON.parse(raw) : {};
      return p && typeof p === "object" ? p : {};
    } catch (e) { return {}; }
  }
  function writeStore(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function layerBadge(label, on) {
    return '<span class="inbox-badge ' + (on ? "inbox-badge--approved" : "inbox-badge--draft") + '">' + esc(label) + "</span>";
  }
  function ensurePanel() {
    if (document.getElementById("verify-panel")) return;
    var editor = document.getElementById("draft-editor");
    if (!editor || !editor.parentNode) return;
    var sec = document.createElement("section");
    sec.className = "admin-panel";
    sec.id = "verify-panel";
    sec.innerHTML =
      '<h2 class="admin-panel__title">Human Verification — RAW vs Refined Draft</h2>' +
      '<p class="admin-panel__hint" id="verify-layers"></p>' +
      '<div class="inbox-form__row" id="verify-cols">' +
      '<div class="inbox-form__field" id="verify-left"></div>' +
      '<div class="inbox-form__field" id="verify-right"></div>' +
      "</div>" +
      '<div class="inbox-form__actions">' +
      '<button type="button" id="verify-save" class="admin-btn admin-btn--small">Save Verification</button>' +
      '<button type="button" id="verify-mark-verified" class="admin-btn admin-btn--small">Mark Verified</button>' +
      '<button type="button" id="verify-needs-changes" class="admin-btn admin-btn--small admin-btn--secondary">Request Changes</button>' +
      '<span id="verify-msg" class="inbox-form__msg" role="status"></span>' +
      "</div>" +
      '<p class="admin-panel__hint">Verification never approves or publishes. ' +
      "Verified drafts still go through the existing Review Queue → Approve → Publish gates. " +
      "Reviewer notes are stored separately from RAW and Guide content.</p>";
    editor.parentNode.insertBefore(sec, editor.nextSibling);
  }
  function renderLeft(raw, cat) {
    var left = document.getElementById("verify-left");
    if (!left) return;
    if (!raw) {
      left.innerHTML = "<h3>SOURCE (RAW — read-only)</h3>" +
        '<p class="admin-panel__hint">Open a Content Inbox item to load its RAW source here.</p>';
      return;
    }
    var link = raw.source_url
      ? '<a href="' + esc(raw.source_url) + '" target="_blank" rel="noopener">Open official source ↗</a>'
      : '<span class="inbox-badge inbox-badge--review">Source URL missing</span>';
    left.innerHTML = "<h3>SOURCE (RAW — read-only)</h3>" +
      "<p><strong>" + esc(raw.title || "") + "</strong></p>" +
      "<p class=\"admin-panel__hint\">Source: " + esc(raw.source_name || "—") + "<br/>" +
      "Official Source URL: " + link + "<br/>" +
      "Published Date: " + esc(raw.source_published_date || "Date unavailable — manual review") + "<br/>" +
      "Content Type: " + esc((cat && cat.content_type) || "—") + "<br/>" +
      "Category: " + esc((cat && cat.category) || raw.category || "—") + "<br/>" +
      "Sub-category: " + esc((cat && cat.sub_category) || "—") + "<br/>" +
      "User Group: " + esc((cat && cat.user_group) || "—") + "</p>" +
      '<div class="draft-preview" id="verify-raw-body" readonly></div>';
    var body = document.getElementById("verify-raw-body");
    if (body) body.textContent = raw.raw_content || "";
  }
  function listHtml(arr) {
    if (!Array.isArray(arr) || !arr.length) return "<p>—</p>";
    return "<ul class=\"guide-list\">" + arr.map(function (x) {
      return "<li>" + esc(typeof x === "string" ? x : (x.q || x.question || JSON.stringify(x))) + "</li>";
    }).join("") + "</ul>";
  }
  function renderRight(raw, guide, cat, saved) {
    var right = document.getElementById("verify-right");
    if (!right || !window.SamjhoVerification) return;
    var V = window.SamjhoVerification;
    var g = guide || {};
    var checks = saved ? V.normalizeChecklist(saved.checklist) : V.blankChecklist();
    var notes = saved ? String(saved.reviewer_notes || "") : "";
    var scan = null;
    try { scan = V.scanUnsupported(raw, g); } catch (e) { scan = { ok: true, flagged: [] }; }
    var derived = null;
    try { derived = V.deriveState(checks, notes, scan); } catch (e2) {}
    var rows = V.CHECKLIST.map(function (k) {
      return '<label style="display:block;font-size:13px;margin:4px 0">' +
        '<input type="checkbox" data-verify-check="' + esc(k) + '"' + (checks[k] ? " checked" : "") + "/> " +
        esc(V.LABELS[k]) + "</label>";
    }).join("");
    right.innerHTML = "<h3>REFINED DRAFT (editable in form above)</h3>" +
      "<p><strong>" + esc(g.title || "") + "</strong></p>" +
      "<p class=\"admin-panel__hint\">Summary: " + esc(g.summary || "—") + "</p>" +
      "<p class=\"admin-panel__hint\">Content: " + esc(String(g.content || "").slice(0, 400)) +
      (String(g.content || "").length > 400 ? "…" : "") + "</p>" +
      "<p class=\"admin-panel__hint\">Eligibility: " + esc((g.eligibility || []).join("; ") || "—") + "<br/>" +
      "Benefits: " + esc((g.benefits || []).join("; ") || "—") + "<br/>" +
      "Required Documents: " + esc((g.required_documents || []).join("; ") || "—") + "<br/>" +
      "Application Process: " + esc((g.application_process || []).join("; ") || "—") + "<br/>" +
      "Important Dates: " + esc((g.important_dates || []).join("; ") || "—") + "<br/>" +
      "Common Mistakes: " + esc((g.common_mistakes || []).join("; ") || "—") + "<br/>" +
      "FAQs: " + esc((g.faqs || []).length + " item(s)") + "<br/>" +
      "Official Sources: " + esc((g.source_ids || []).join(", ") || g.source_url || "—") + "</p>" +
      (scan && scan.ok === false
        ? '<p class="admin-panel__hint"><strong>Unsupported info flagged:</strong> ' + esc((scan.flagged || []).join(" | ")) + "</p>"
        : '<p class="admin-panel__hint">Hallucination-guard scan: no unsupported passages vs RAW.</p>') +
      "<h3>Verification checklist</h3>" + rows +
      "<h3>Overall state: " + esc(saved ? saved.state : (derived ? derived.state : "not_verified")) + "</h3>" +
      '<label class="inbox-form__field"><span>Reviewer notes (separate from RAW + Guide; required for Changes Required)</span>' +
      '<textarea id="verify-notes" rows="3">' + esc(notes) + "</textarea></label>";
    var layers = document.getElementById("verify-layers");
    if (layers) {
      layers.innerHTML = "Layers: " + layerBadge("RAW SOURCE", !!raw) + " " +
        layerBadge("CATEGORIZATION", !!cat) + " " + layerBadge("REFINED DRAFT", !!(g && g.title)) +
        " " + layerBadge("HUMAN VERIFICATION", !!(saved && saved.state !== "not_verified"));
    }
  }
  function context() {
    try {
      if (window.SamjhoDraftEditor && typeof window.SamjhoDraftEditor.currentContext === "function") {
        return window.SamjhoDraftEditor.currentContext();
      }
    } catch (e) {}
    return { raw: null, guide: {}, categorization: null, inbox_item_id: null };
  }
  function refresh() {
    ensurePanel();
    if (!window.SamjhoVerification) return;
    var ctx = context();
    var store = readStore();
    var saved = (ctx.inbox_item_id && store[ctx.inbox_item_id]) || null;
    // Load from Supabase if available (source of truth)
    var cdb = window.SamjhoContentDB;
    if (cdb && typeof cdb.select === "function" && ctx.inbox_item_id) {
      cdb.select({ filter: { id: ctx.inbox_item_id }, limit: 1 }).then(function (rows) {
        if (rows && rows[0] && rows[0].verification_data) {
          saved = rows[0].verification_data;
          // Update localStorage cache too
          if (ctx.inbox_item_id) { store[ctx.inbox_item_id] = saved; writeStore(store); }
        }
        renderLeft(ctx.raw, ctx.categorization);
        renderRight(ctx.raw, ctx.guide, ctx.categorization, saved);
      }).catch(function () {
        // Use localStorage fallback
        renderLeft(ctx.raw, ctx.categorization);
        renderRight(ctx.raw, ctx.guide, ctx.categorization, saved);
      });
    } else {
      renderLeft(ctx.raw, ctx.categorization);
      renderRight(ctx.raw, ctx.guide, ctx.categorization, saved);
    }
  }
  function collectChecks() {
    var out = {};
    var boxes = document.querySelectorAll("[data-verify-check]");
    for (var i = 0; i < boxes.length; i++) out[boxes[i].getAttribute("data-verify-check")] = !!boxes[i].checked;
    return out;
  }
  function saveAs(requested) {
    var msg = document.getElementById("verify-msg");
    var ctx = context();
    var notesEl = document.getElementById("verify-notes");
    var notes = notesEl ? notesEl.value : "";
    var res = window.SamjhoVerification.saveVerification({
      raw: ctx.raw, guide: ctx.guide, categorization: ctx.categorization,
      checklist: collectChecks(), reviewer_notes: notes, state: requested || ""
    });
    if (!res.ok) { if (msg) msg.textContent = res.code + ": " + res.message; return; }
    // Persist to localStorage (immediate UI cache)
    var store = readStore();
    if (ctx.inbox_item_id) { store[ctx.inbox_item_id] = res.record; writeStore(store); }
    // Persist to Supabase (source of truth)
    var cdb = window.SamjhoContentDB;
    if (cdb && typeof cdb.update === "function" && ctx.inbox_item_id) {
      cdb.update(ctx.inbox_item_id, {
        verification_status: res.record.state,
        verification_data: res.record
      }).then(function () {
        console.log("[Verify] Saved to Supabase: " + ctx.inbox_item_id + " -> " + res.record.state);
        if (msg) msg.textContent = res.message + " (saved to database)";
      }).catch(function (err) {
        console.error("[Verify] Supabase save failed:", err.message || err);
        if (msg) msg.textContent = res.message + " (local only — DB save failed)";
      });
    }
    if (msg) msg.textContent = res.message;
    refresh();
  }
  function init() {
    ensurePanel();
    refresh();
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.id) return;
      if (t.id === "verify-save") saveAs("");
      else if (t.id === "verify-mark-verified") saveAs("verified");
      else if (t.id === "verify-needs-changes") saveAs("changes_required");
    });
    try { window.addEventListener("storage", function (e) {
      if (e.key === STORE_KEY) refresh();
    }); } catch (e2) {}
    window.SamjhoVerifyUI = { refresh: refresh, readStore: readStore };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

