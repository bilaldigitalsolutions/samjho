// MICRO 23+25 - Admin Review Queue - Supabase-backed workflow.
// Loads content_items from Supabase. Enforces verification gate.
// Persisted transitions: draft -> review -> approved (and review -> draft).
// Publishing: approved -> published via existing publish pipeline.

(function () {
  "use strict";
  var TRANSITIONS = {
    "send-review": { from: "draft", to: "review", requiresVerified: true },
    "approve": { from: "review", to: "approved", requiresVerified: true },
    "return-draft": { from: "review", to: "draft" }
  };
  var allItems = [];
  var currentItem = null;
  function esc(v) { return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function badgeClass(s) { if(s==="approved")return"inbox-badge inbox-badge--approved";if(s==="review")return"inbox-badge inbox-badge--review";if(s==="published")return"inbox-badge inbox-badge--published";if(s==="pending_publish")return"inbox-badge inbox-badge--review";return"inbox-badge inbox-badge--draft"; }
  function statusLabel(s) { if(!s)return"\u2014";return s.charAt(0).toUpperCase()+s.slice(1); }
  function val(id){var el=document.getElementById(id);return el?el.value.trim():"";}
  function show(id,v){var el=document.getElementById(id);if(el)el.hidden=!v;}
  function today(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
  function flash(msg){var el=document.getElementById("review-msg");if(el){el.textContent=msg;el.style.color=(msg&&msg.indexOf("Error")!==-1)?"#f87171":"#4ade80";}}
  function ensureClient(){var DB=window.SamjhoContentDB;return DB&&typeof DB.select==="function";}

  function loadFromDB() {
    if (!ensureClient()) { flash("Error: Supabase client not available."); return Promise.resolve([]); }
    return window.SamjhoContentDB.select({
      columns: "id,title,slug,primary_category,source_name,source_url,source_published_date,status,verification_status,review_status,approval_status,admin_notes,refined_guide,raw_content,raw_html,ministry,release_id,release_url,updated_at,created_at",
      order: { column: "updated_at", ascending: false }
    }).then(function (rows) {
      return rows.filter(function (r) { var s = r.status; return s==="draft"||s==="review"||s==="approved"||s==="pending_publish"; });
    }).catch(function (err) { console.error("Review: DB load failed:", err); flash("Error: " + (err.message||err)); return []; });
  }
  function persistUpdate(id, fields) {
    if (!ensureClient()) return Promise.reject(new Error("Supabase client not available"));
    return window.SamjhoContentDB.update(id, fields);
  }

  function renderTable() {
    var tbody = document.getElementById("review-tbody");
    var countEl = document.getElementById("review-count");
    var emptyEl = document.getElementById("review-empty");
    if (!tbody) return;
    var html = "";
    for (var i = 0; i < allItems.length; i++) {
      var item = allItems[i];
      var cat = item.primary_category || "\u2014";
      var vs = item.verification_status || "not_verified";
      var vb = vs==="verified" ? '<span class="inbox-badge inbox-badge--approved">Verified</span>'
        : vs==="changes_required" ? '<span class="inbox-badge inbox-badge--review">Changes Required</span>'
        : '<span class="inbox-badge inbox-badge--draft">'+esc(statusLabel(vs))+"</span>";
      var sd = item.source_published_date || "\u2014";
      var up = item.updated_at ? item.updated_at.split("T")[0] : "\u2014";
      html+="<tr>"+"<td>"+esc(item.title||"Untitled")+"</td>"
        +"<td>"+esc(cat)+"</td>"
        +"<td><span class=\""+badgeClass(item.status)+"\">"+statusLabel(item.status)+"</span></td>"
        +"<td>"+vb+"</td>"
        +"<td>"+esc(item.source_name||item.ministry||"\u2014")+"</td>"
        +"<td>"+esc(sd)+"</td>"
        +"<td>"+esc(up)+"</td>"
        +'<td><button class="admin-btn admin-btn--small" data-open-review="'+esc(item.id)+'">Open</button></td>'
        +"</tr>";
    }
    tbody.innerHTML = html;
    if (countEl) countEl.textContent = allItems.length + " item(s) in queue.";
    if (emptyEl) emptyEl.hidden = allItems.length > 0;
  }

  function buildForm() {
    var f = document.getElementById("review-form");
    if (!f) return;
    f.innerHTML =
      '<div class="inbox-form__row"><div class="inbox-form__field"><label>Title</label><input type="text" id="r-title" /></div><div class="inbox-form__field"><label>Slug</label><input type="text" id="r-slug" /></div></div>' +
      '<div class="inbox-form__row"><div class="inbox-form__field"><label>Category</label><input type="text" id="r-category" readonly /></div><div class="inbox-form__field"><label>Source Name</label><input type="text" id="r-source-name" readonly /></div><div class="inbox-form__field"><label>Source URL</label><input type="text" id="r-source-url" readonly /></div></div>' +
      '<div class="inbox-form__row"><div class="inbox-form__field" style="flex:1"><label>Summary</label><textarea id="r-summary" rows="3"></textarea></div></div>' +
      '<div class="inbox-form__row"><div class="inbox-form__field" style="flex:1"><label>Content</label><textarea id="r-content" rows="8"></textarea></div></div>' +
      '<div class="inbox-form__row"><div class="inbox-form__field"><label>Eligibility</label><textarea id="r-eligibility" rows="3"></textarea></div><div class="inbox-form__field"><label>Benefits</label><textarea id="r-benefits" rows="3"></textarea></div></div>' +
      '<div class="inbox-form__row"><div class="inbox-form__field"><label>Required Documents</label><textarea id="r-required-docs" rows="3"></textarea></div><div class="inbox-form__field"><label>Application Process</label><textarea id="r-application-process" rows="3"></textarea></div></div>' +
      '<div class="inbox-form__row"><div class="inbox-form__field"><label>Important Dates</label><textarea id="r-important-dates" rows="2"></textarea></div><div class="inbox-form__field"><label>Common Mistakes</label><textarea id="r-common-mistakes" rows="2"></textarea></div></div>' +
      '<div class="inbox-form__row"><div class="inbox-form__field" style="flex:1"><label>FAQs (Q: ... | A: ...)</label><textarea id="r-faqs" rows="3"></textarea></div></div>' +
      '<div class="inbox-form__row"><div class="inbox-form__field" style="flex:1"><label>Admin Notes</label><textarea id="r-admin-notes" rows="2"></textarea></div></div>' +
      '<div class="inbox-form__row"><div class="inbox-form__field" style="flex:1"><label>RAW Source Content (read-only)</label><textarea id="r-raw-content" rows="6" readonly style="background:#111;color:#aaa;border:1px solid #444;"></textarea></div></div>' +
      '<div class="inbox-form__row"><div class="inbox-form__field"><label>Verification Status</label><input type="text" id="r-verification-status" readonly /></div><div class="inbox-form__field"><label>Review Status</label><input type="text" id="r-review-status" readonly /></div><div class="inbox-form__field"><label>Approval Status</label><input type="text" id="r-approval-status" readonly /></div></div>';
  }

  function fillForm(item) {
    var g = (item.refined_guide && typeof item.refined_guide === "object") ? item.refined_guide : null;
    document.getElementById("r-title").value = (g && g.title) || item.title || "";
    document.getElementById("r-slug").value = (g && g.slug) || item.slug || "";
    document.getElementById("r-category").value = (g && g.category) || item.primary_category || "";
    document.getElementById("r-source-name").value = item.source_name || item.ministry || "";
    document.getElementById("r-source-url").value = item.source_url || "";
    document.getElementById("r-summary").value = (g && g.summary) || "";
    document.getElementById("r-content").value = (g && g.content) || "";
    document.getElementById("r-eligibility").value = a2t(g && g.eligibility);
    document.getElementById("r-benefits").value = a2t(g && g.benefits);
    document.getElementById("r-required-docs").value = a2t(g && g.required_documents);
    document.getElementById("r-application-process").value = a2t(g && g.application_process);
    document.getElementById("r-important-dates").value = a2t(g && g.important_dates);
    document.getElementById("r-common-mistakes").value = a2t(g && g.common_mistakes);
    document.getElementById("r-faqs").value = f2t(g && g.faqs);
    document.getElementById("r-admin-notes").value = item.admin_notes || "";
    document.getElementById("r-raw-content").value = item.raw_content || "";
    document.getElementById("r-verification-status").value = item.verification_status || "not_verified";
    document.getElementById("r-review-status").value = item.review_status || "pending";
    document.getElementById("r-approval-status").value = item.approval_status || "pending";
  }
  function a2t(a) { return (!a || !a.length) ? "" : a.join("\n"); }
  function t2a(t) { if (!t) return []; return t.split("\n").map(function(l){return l.trim();}).filter(Boolean); }
  function f2t(a) { if (!a || !a.length) return ""; return a.map(function(f){return "Q: "+(f.q||"")+" | A: "+(f.a||"");}).join("\n"); }
  function t2f(t) { if (!t) return []; return t.split("\n").map(function(l){
    var p=l.split("|");var q=(p[0]||"").replace(/^Q:\s*/i,"").trim();var a=(p[1]||"").replace(/^A:\s*/i,"").trim();
    return {q:q,a:a}; }).filter(function(f){return f.q||f.a;}); }
  function collectGuide() {
    return {
      title:val("r-title"),slug:val("r-slug"),category:val("r-category"),
      summary:val("r-summary"),content:val("r-content"),
      eligibility:t2a(val("r-eligibility")),benefits:t2a(val("r-benefits")),
      required_documents:t2a(val("r-required-docs")),
      application_process:t2a(val("r-application-process")),
      important_dates:t2a(val("r-important-dates")),
      common_mistakes:t2a(val("r-common-mistakes")),
      faqs:t2f(val("r-faqs")),
      source_ids:currentItem&&currentItem.source_url?[currentItem.source_url]:[],
      last_updated:today()
    };
  }

  function renderPreview(item) {
    var body = document.getElementById("review-preview-body");
    if (!body) return;
    var guide = (item.refined_guide && typeof item.refined_guide === "object") ? item.refined_guide : item;
    if (window.MasterGuideTemplate && typeof window.MasterGuideTemplate.renderMasterGuide === "function") {
      body.innerHTML = window.MasterGuideTemplate.renderMasterGuide(guide).html;
    } else { body.textContent = "Master Guide Template bundle not loaded."; }
    show("review-preview", true);
  }
  function updateWorkflowButtons() {
    if (!currentItem) return;
    var s = currentItem.status, vs = currentItem.verification_status, as = currentItem.approval_status;
    show("btn-send-review", s === "draft" && vs === "verified");
    show("btn-approve", s === "review" && vs === "verified");
    show("btn-return-draft", s === "review");
    show("btn-publish", (s === "approved" && vs === "verified" && as === "approved") || s === "pending_publish");
  }
  function showPanels(open) { show("review-editor", open); if (!open) show("review-preview", false); }

  function onSave() {
    if (!currentItem) return;
    if (!val("r-title")) { flash("Error: Title is required."); return; }
    if (!val("r-slug")) { flash("Error: Slug is required."); return; }
    var guide = collectGuide();
    var fields = { refined_guide: guide, admin_notes: val("r-admin-notes") };
    persistUpdate(currentItem.id, fields).then(function (updated) {
      if (updated) { currentItem.refined_guide = guide; currentItem.admin_notes = fields.admin_notes; }
      renderTable(); renderPreview(currentItem);
      flash("Changes saved to database.");
    }).catch(function (err) { flash("Error saving: " + (err.message || err)); });
  }

  function onTransition(action) {
    if (!currentItem) return;
    var rule = TRANSITIONS[action];
    if (!rule) return;
    if (currentItem.status !== rule.from) {
      flash("Error: Invalid transition: requires status '" + rule.from + "' (current: " + currentItem.status + ").");
      return;
    }
    if (rule.requiresVerified && currentItem.verification_status !== "verified") {
      flash("Error: Cannot " + action + ". Verification must be 'verified' (current: " + (currentItem.verification_status || "not_verified") + ").");
      return;
    }
    var fields = { status: rule.to };
    if (action === "send-review") { fields.review_status = "in_review"; fields.approval_status = "pending"; }
    else if (action === "approve") { fields.review_status = "reviewed"; fields.approval_status = "approved"; }
    else if (action === "return-draft") { fields.review_status = "changes_required"; fields.approval_status = "pending"; }
    var from = currentItem.status;
    persistUpdate(currentItem.id, fields).then(function (updated) {
      if (updated) { currentItem.status = fields.status;
        if (fields.review_status) currentItem.review_status = fields.review_status;
        if (fields.approval_status) currentItem.approval_status = fields.approval_status; }
      renderTable(); updateWorkflowButtons(); renderPreview(currentItem); fillForm(currentItem);
      flash("Status: " + from + " -> " + rule.to + " (persisted).");
    }).catch(function (err) { flash("Error: Transition failed: " + (err.message || err)); });
  }

  function onPublish() {
    if (!currentItem) return;
    var s = currentItem.status, vs = currentItem.verification_status, as = currentItem.approval_status;
    if (s !== "approved" || vs !== "verified" || as !== "approved") {
      flash("Error: Cannot publish. Requires status=approved, verification=verified, approval=approved.");
      return;
    }
    if (!currentItem.refined_guide || typeof currentItem.refined_guide !== "object") {
      flash("Error: Cannot publish. No refined guide data found.");
      return;
    }
    if (!currentItem.refined_guide.slug) {
      flash("Error: Cannot publish. Guide has no slug.");
      return;
    }
    if (s === "pending_publish") {
      flash("Already queued for publishing. Run: node build/scripts/deploy-published.js");
      return;
    }
    if (!confirm("Stage \"" + (currentItem.refined_guide.title || currentItem.title) + "\" for publishing?\n\nAfter staging, run:\nnode build/scripts/deploy-published.js")) return;
    flash("Staging for publish...");
    persistUpdate(currentItem.id, { status: "pending_publish" }).then(function (updated) {
      if (updated) currentItem.status = "pending_publish";
      renderTable(); updateWorkflowButtons(); fillForm(currentItem);
      flash("Staged! Next step: run 'node build/scripts/deploy-published.js' on the server to build and deploy.");
    }).catch(function (err) {
      flash("Error: Stage failed: " + (err.message || err));
    });
  }

  function openDraft(id) {
    for (var i = 0; i < allItems.length; i++) {
      if (allItems[i].id === id) {
        currentItem = allItems[i];
        fillForm(currentItem);
        document.getElementById("review-item-title").textContent = currentItem.title || "";
        flash(""); showPanels(true); updateWorkflowButtons(); renderPreview(currentItem);
        return;
      }
    }
  }

  function init() {
    buildForm(); show("review-editor", false);
    loadFromDB().then(function (items) { allItems = items; renderTable(); });
    var tbody = document.getElementById("review-tbody");
    if (tbody) tbody.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-open-review]");
      if (btn) openDraft(btn.getAttribute("data-open-review"));
    });
    var save = document.getElementById("btn-save");
    if (save) save.addEventListener("click", onSave);
    var send = document.getElementById("btn-send-review");
    if (send) send.addEventListener("click", function () { onTransition("send-review"); });
    var approve = document.getElementById("btn-approve");
    if (approve) approve.addEventListener("click", function () { onTransition("approve"); });
    var back = document.getElementById("btn-return-draft");
    if (back) back.addEventListener("click", function () { onTransition("return-draft"); });
    var publish = document.getElementById("btn-publish");
    if (publish) publish.addEventListener("click", onPublish);
    var close = document.getElementById("review-close");
    if (close) close.addEventListener("click", function () { showPanels(false); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();