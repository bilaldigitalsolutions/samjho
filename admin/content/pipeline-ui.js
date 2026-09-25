// MICRO 11 UI — pipeline visibility: RAW → CATEGORIZED → REFINEMENT → DRAFT.
// MICRO 13 — DeepSeek provider status indicator + DeepSeek refinement entry.
//
// Adds a "Send to Refinement" action per categorized row (Mock and DeepSeek).
// Manual/uncategorized rows show the gate message instead. Fills the existing
// draft editor on success. Never publishes, never rewrites RAW. The DeepSeek
// path is server-side only — the browser never sees the API key.

(function () {
  "use strict";

  var EOL_QUOTE = String.fromCharCode(34); // avoids quote-escaping ambiguity below

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function q(s) { return EOL_QUOTE + s + EOL_QUOTE; }

  function pipeBadge(state) {
    var order = ["RAW", "CATEGORIZED", "REFINEMENT", "DRAFT"];
    return order.map(function (s) {
      var on = state && state[s];
      return "<span class=\"inbox-badge " + (on ? "inbox-badge--approved" : "inbox-badge--draft") + "\">" +
        (on ? "✓ " : "") + s + "</span>";
    }).join(" → ");
  }

  function ensurePanel() {
    if (document.getElementById("pipeline-panel")) return;
    var catPanel = document.getElementById("categorization-panel");
    if (!catPanel) return;
    var sec = document.createElement("section");
    sec.className = "admin-panel";
    sec.id = "pipeline-panel";
    sec.innerHTML =
      "<h2 class=\"admin-panel__title\">Refinement Pipeline — RAW → CATEGORIZED → REFINEMENT → DRAFT</h2>" +
      "<div id=\"provider-status\" class=\"provider-status\"></div>" +
      "<p class=\"admin-panel__hint\">Categorized RAW is the input to the existing Micro 9 refinement engine. " +
      "Uncategorized / \"Needs Manual Categorization\" rows are gated with a clear message. Draft only — nothing is published.</p>" +
      "<div class=\"inbox-table-wrap\"><table class=\"inbox-table\" id=\"pipeline-table\">" +
      "<thead><tr><th>Content title</th><th>Pipeline state</th><th>Category → Refinement</th><th>Action</th></tr></thead>" +
      "<tbody id=\"pipeline-tbody\"></tbody></table></div>" +
      "<p id=\"pipeline-msg\" class=\"admin-panel__hint\" role=\"status\"></p>";
    catPanel.parentNode.insertBefore(sec, catPanel.nextSibling);
  }

  function rawById(id) {
    var items = [];
    try {
      if (window.SamjhoInbox && typeof window.SamjhoInbox.listQueued === "function") {
        items = items.concat(window.SamjhoInbox.listQueued());
      }
    } catch (e) {}
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].id) === String(id)) return items[i];
    }
    return null;
  }

  function renderProviderStatus() {
    var statusEl = document.getElementById("provider-status");
    if (!statusEl) return;
    var EP = window.SamjhoSupabaseEndpoint || window.SamjhoServerEndpoint;
    var hasEndpoint = typeof EP !== "undefined" && EP !== null;
    var hasSupabaseURL = !!(EP && typeof EP === "object");
    if (hasEndpoint && hasSupabaseURL) {
      statusEl.innerHTML =
        "<span class=\"provider-status__badge provider-status__badge--configured\">DeepSeek: Available (Supabase Edge Function)</span>" +
        " <span class=\"provider-status__hint\">Use \"Refine (DeepSeek)\" to run AI refinement. The API key is stored server-side in Supabase secrets.</span>";
    } else {
      statusEl.innerHTML =
        "<span class=\"provider-status__badge provider-status__badge--not-configured\">DeepSeek: Not available</span>" +
        " <span class=\"provider-status__hint\">Deploy the Supabase Edge Function to enable AI refinement.</span>";
    }
  }

  function render() {
    ensurePanel();
    renderProviderStatus();
    var tbody = document.getElementById("pipeline-tbody");
    if (!tbody || !window.SamjhoRefinePipeline) return;
    var P = window.SamjhoRefinePipeline;
    var store = {};
    try {
      store = window.SamjhoCategorization ? window.SamjhoCategorization.readStore() : {};
    } catch (e) { store = {}; }
    var keys = Object.keys(store);
    tbody.innerHTML = keys.map(function (k) {
      var c = store[k];
      var raw = rawById(c.raw_ref || k);
      var st = P.pipelineState(raw || { raw_content: "x" }, c);
      var gated = st.gate !== "READY";
      var catLine = esc(c.category) + (c.sub_category ? " / " + esc(c.sub_category) : "") +
        (c.user_group ? " · " + esc(c.user_group) : "") +
        (c.content_type ? " (" + esc(c.content_type) + ")" : "");
      var ref = esc(c.raw_ref || k);
      var actions = gated
        ? "<span class=\"inbox-badge inbox-badge--review\">Manual categorization required first</span>"
        : "<button type=\"button\" class=\"admin-btn admin-btn--small\" data-refine=\"" + ref + "\" data-provider=\"mock\">Refine (Mock)</button>" +
          " <button type=\"button\" class=\"admin-btn admin-btn--small\" data-refine=\"" + ref + "\" data-provider=\"deepseek\">Refine (DeepSeek)</button>";
      return "<tr>" +
        "<td class=\"inbox-table__title\">" + esc(c.title) + "</td>" +
        "<td>" + pipeBadge({ RAW: !!raw || !!c.title, CATEGORIZED: st.CATEGORIZED }) + "</td>" +
        "<td>" + catLine + "</td>" +
        "<td>" + actions + "</td></tr>";
    }).join("");
    var msg = document.getElementById("pipeline-msg");
    if (msg && !keys.length) {
      msg.textContent = "No categorized items yet — run " + q("Categorize All Inbox Items") + " first.";
    } else if (msg) {
      msg.textContent = "";
    }
  }

  function onClick(event) {
    var btn = event.target.closest ? event.target.closest("[data-refine]") : null;
    if (!btn) return;
    var msg = document.getElementById("pipeline-msg");
    var id = btn.getAttribute("data-refine");
    var provider = btn.getAttribute("data-provider") || "mock";
    var raw = rawById(id);
    var store = {};
    try { store = window.SamjhoCategorization.readStore(); } catch (e) {}
    var cat = store[id] || null;
    if (!raw) { if (msg) msg.textContent = "RAW not found for " + id + ". Nothing refined."; return; }
    var P = window.SamjhoRefinePipeline;

    function handleSuccess(r) {
      if (msg) {
        msg.textContent = (provider === "deepseek" ? "DeepSeek" : "Mock") +
          " refined to draft: category " + q(r.guide.category) +
          " carried into the draft. RAW unchanged. Human verification still required.";
      }
      var ed = window.SamjhoDraftEditor;
      if (ed && typeof ed.openWithGuide === "function") {
        ed.openWithGuide(raw, r.guide, provider === "deepseek"
          ? "DeepSeek refinement complete" : "Mock refinement complete");
      } else if (ed && typeof ed.open === "function") {
        ed.open(raw);
      }
    }

    var res = P.refineCategorized(raw, cat, { provider: provider });

    // MICRO 13: the DeepSeek path is asynchronous and runs SERVER-SIDE. A
    // browser can never hold the API key, so any failure surfaces as a clear
    // admin error — no draft is invented and RAW is left untouched.
    if (res && typeof res.then === "function") {
      if (msg) msg.textContent = "Contacting the server-side DeepSeek provider...";
      res.then(function (r) {
        if (!r || !r.ok) {
          if (msg) {
            msg.textContent = ((r && r.code) || "AI_REFINEMENT_FAILED") + ": " +
              ((r && r.message) || "DeepSeek refinement failed. RAW unchanged; nothing published.");
          }
          return;
        }
        handleSuccess(r);
      }).catch(function (err) {
        if (msg) {
          msg.textContent = "AI_REFINEMENT_FAILED: " +
            (err && err.message ? err.message : String(err)) + " RAW unchanged; nothing published.";
        }
      });
      return;
    }

    if (!res.ok) {
      if (msg) msg.textContent = res.code + ": " + res.message;
      return;
    }
    handleSuccess(res);
  }

  // Static CSS for provider status badges (injected into head on init)
  function injectStyles() {
    if (document.getElementById("samjho-provider-status-styles")) return;
    var style = document.createElement("style");
    style.id = "samjho-provider-status-styles";
    style.textContent =
      ".provider-status { margin: 8px 0 12px 0; padding: 8px 12px; border-radius: 6px; background: #f8f9fc; border: 1px solid #e1e5eb; font-size: 13px; }" +
      ".provider-status__badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-weight: 600; font-size: 12px; }" +
      ".provider-status__badge--configured { background: #dcfce7; color: #166534; border: 1px solid #86efac; }" +
      ".provider-status__badge--not-configured { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }" +
      ".provider-status__hint { margin-left: 8px; color: #4b5563; font-size: 12px; }";
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    render();
    document.addEventListener("click", onClick);
    try {
      window.addEventListener("storage", function (e) {
        if (e.key === "samjho_categorization_store" || e.key === "samjho_inbox_queue") render();
      });
    } catch (e) {}
    if (window.SamjhoCategorization && window.SamjhoCategorization.render) {
      var orig = window.SamjhoCategorization.render;
      window.SamjhoCategorization.render = function () { orig(); render(); };
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
