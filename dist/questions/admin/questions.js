// Samjho Questions Management — admin module inside the separate questions/
// structure. MOCK/IN-MEMORY ONLY: questions live in a plain array. No
// database, no AI, and NO publishing to the public website.
//
// Reuses the existing Question schema (questions/schemas/question.js), which
// the build exposes as window.SamjhoQuestionSchema. Status values and
// validation come from that schema — this module never hardcodes its own.

(function () {
  "use strict";

  var schema = window.SamjhoQuestionSchema;
  var VALID_STATUSES = schema && schema.VALID_STATUSES
    ? schema.VALID_STATUSES
    : ["draft", "review", "approved", "published"];

  // Question → Draft → Review → Approved (and review → draft).
  // Publishing is intentionally NOT part of this workflow yet.
  var TRANSITIONS = {
    "send-review": { from: "draft", to: "review" },
    "approve": { from: "review", to: "approved" },
    "return-draft": { from: "review", to: "draft" },
  };

  function canTransition(fromStatus, action) {
    var rule = TRANSITIONS[action];
    if (!rule) return false;
    if (VALID_STATUSES.indexOf(rule.to) === -1) return false;
    return rule.from === fromStatus;
  }

  // ------------------------------------------------------------- mock data
  var questions = [
    {
      id: "q-001",
      question: "PM Kisan ki kist status kaise check karein?",
      category: "government",
      answer: "Official PM-Kisan portal par Beneficiary Status section me Aadhaar ya account number se status check kar sakte hain.",
      source_ids: ["pmkisan.gov.in"],
      status: "draft",
      last_updated: "2026-09-17",
    },
    {
      id: "q-002",
      question: "PAN card correction me kaun se documents lagte hain?",
      category: "documents",
      answer: "Existing PAN ke saath identity proof aur address proof lagta hai; correction form online bhara jata hai.",
      source_ids: ["onlineservices.nsdl.com"],
      status: "review",
      last_updated: "2026-09-16",
    },
    {
      id: "q-003",
      question: "GST registration kab zaroori hai?",
      category: "business",
      answer: "Jab turnover current threshold cross kare ya interstate supply ho, tab GST registration required hota hai.",
      source_ids: ["cbic-gst.gov.in"],
      status: "approved",
      last_updated: "2026-09-15",
    },
  ];

  var nextId = 4;
  var currentId = null;

  // ------------------------------------------------------------- helpers
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

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function findById(id) {
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].id === id) return questions[i];
    }
    return null;
  }

  function flashAdd(message) {
    var el = document.getElementById("add-msg");
    if (el) el.textContent = message;
  }

  function flashEditor(message) {
    var el = document.getElementById("editor-msg");
    if (el) el.textContent = message;
  }

  function badgeClass(status) {
    return VALID_STATUSES.indexOf(status) !== -1
      ? "inbox-badge inbox-badge--" + status
      : "inbox-badge";
  }

  // ------------------------------------------------------------- table
  function renderTable() {
    var tbody = document.getElementById("q-tbody");
    var empty = document.getElementById("q-empty");
    var count = document.getElementById("q-count");
    if (!tbody) return;

    tbody.innerHTML = questions
      .map(function (q) {
        return "<tr>" +
          '<td class="inbox-table__title">' + esc(q.question) + "</td>" +
          "<td>" + esc(q.category) + "</td>" +
          '<td><span class="' + badgeClass(q.status) + '">' + esc(q.status) + "</span></td>" +
          "<td>" + esc(q.last_updated || "") + "</td>" +
          "<td>" + esc((q.source_ids || []).join(", ")) + "</td>" +
          '<td><button type="button" class="admin-btn admin-btn--small" data-open-question="' + esc(q.id) + '">Open / Edit</button></td>' +
          "</tr>";
      })
      .join("");

    if (empty) empty.hidden = questions.length > 0;
    if (count) count.textContent = questions.length + " question(s) (mock data only — not published anywhere).";
  }

  // ------------------------------------------------------------- add form
  function buildFromAddForm() {
    var status = val("f-status") || "draft";
    if (VALID_STATUSES.indexOf(status) === -1) status = "draft";
    return {
      id: "q-" + String(nextId),
      question: val("f-question"),
      category: val("f-category"),
      answer: val("f-answer"),
      source_ids: val("f-source-ids").split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      status: status,
      last_updated: val("f-last-updated") || today(),
    };
  }

  function onAddSubmit(event) {
    event.preventDefault();

    var candidate = buildFromAddForm();
    if (schema && typeof schema.validateQuestion === "function") {
      var result = schema.validateQuestion(candidate);
      if (!result.valid) {
        flashAdd("Cannot add question: " + result.errors.join("; "));
        return;
      }
      candidate = result.normalized;
    }

    questions.push(candidate);
    nextId += 1;
    renderTable();
    event.target.reset();
    flashAdd("Question added (status: " + candidate.status + ", mock, in-memory only).");
  }

  // ------------------------------------------------------------- editor
  function currentQuestion() {
    return findById(currentId);
  }

  function updateWorkflowButtons() {
    var q = currentQuestion();
    var status = q ? q.status : null;
    var send = document.getElementById("btn-send-review");
    var approve = document.getElementById("btn-approve");
    var back = document.getElementById("btn-return-draft");
    var badge = document.getElementById("editor-status-badge");
    if (badge) badge.innerHTML = '<span class="' + badgeClass(status) + '">' + esc(status || "") + "</span>";
    if (send) send.hidden = !canTransition(status, "send-review");
    if (approve) approve.hidden = !canTransition(status, "approve");
    if (back) back.hidden = !canTransition(status, "return-draft");
  }

  function openEditor(id) {
    var q = findById(id);
    if (!q) return;
    currentId = id;

    setVal("e-question", q.question);
    setVal("e-category", q.category);
    setVal("e-answer", q.answer);
    setVal("e-source-ids", (q.source_ids || []).join(", "));
    setVal("e-last-updated", q.last_updated || today());

    flashEditor("");
    var panel = document.getElementById("q-editor");
    if (panel) panel.hidden = false;
    updateWorkflowButtons();
  }

  function closeEditor() {
    var panel = document.getElementById("q-editor");
    if (panel) panel.hidden = true;
    currentId = null;
  }

  function collectEditor() {
    return {
      question: val("e-question"),
      category: val("e-category"),
      answer: val("e-answer"),
      source_ids: val("e-source-ids").split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      last_updated: val("e-last-updated") || today(),
    };
  }

  function applyEditorToQuestion(q, edits) {
    q.question = edits.question;
    q.category = edits.category;
    q.answer = edits.answer;
    q.source_ids = edits.source_ids;
    q.last_updated = edits.last_updated;
  }

  function onSaveDraft(event) {
    event.preventDefault();
    var q = currentQuestion();
    if (!q) return;

    var edits = collectEditor();
    var candidate = Object.assign({}, q, edits);

    if (schema && typeof schema.validateQuestion === "function") {
      var result = schema.validateQuestion(candidate);
      if (!result.valid) {
        flashEditor("Cannot save: " + result.errors.join("; "));
        return;
      }
    }

    applyEditorToQuestion(q, edits);
    renderTable();
    updateWorkflowButtons();

    if (q.status === "draft") {
      flashEditor("Draft saved (status: draft, mock, in-memory only).");
    } else {
      flashEditor("Changes saved. Status unchanged: " + q.status + " (use the workflow buttons to change status).");
    }
  }

  function onTransition(action) {
    var q = currentQuestion();
    if (!q) return;

    if (!canTransition(q.status, action)) {
      flashEditor("Invalid transition: '" + action + "' is not allowed from status '" + q.status + "'.");
      return;
    }

    var rule = TRANSITIONS[action];
    var from = q.status;
    q.status = rule.to;
    q.last_updated = today();

    renderTable();
    updateWorkflowButtons();
    flashEditor("Status changed: " + from + " → " + rule.to + " (mock, in-memory only).");
  }

  // ------------------------------------------------------------- init
  function init() {
    renderTable();

    var addForm = document.getElementById("q-add-form");
    if (addForm) addForm.addEventListener("submit", onAddSubmit);

    var tbody = document.getElementById("q-tbody");
    if (tbody) {
      tbody.addEventListener("click", function (event) {
        var btn = event.target.closest("[data-open-question]");
        if (btn) openEditor(btn.getAttribute("data-open-question"));
      });
    }

    var saveBtn = document.getElementById("btn-save-draft");
    if (saveBtn) {
      saveBtn.addEventListener("click", function (event) { onSaveDraft(event); });
    }

    var sendBtn = document.getElementById("btn-send-review");
    if (sendBtn) sendBtn.addEventListener("click", function () { onTransition("send-review"); });

    var approveBtn = document.getElementById("btn-approve");
    if (approveBtn) approveBtn.addEventListener("click", function () { onTransition("approve"); });

    var backBtn = document.getElementById("btn-return-draft");
    if (backBtn) backBtn.addEventListener("click", function () { onTransition("return-draft"); });

    var closeBtn = document.getElementById("editor-close");
    if (closeBtn) closeBtn.addEventListener("click", closeEditor);

    // Mock store exposed for debugging/testing only (no persistence).
    window.SamjhoQuestionsStore = {
      questions: questions,
      canTransition: canTransition,
      TRANSITIONS: TRANSITIONS,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

  // __QUESTIONS_PART2__
