// Admin Sources page — renders the Source Registry (MICRO 8).
// PIB is the ONLY pilot source. Feed URL empty = configurable/not invented.
// No database, no AI, no auto-publishing. Uses existing admin.css classes.

(function () {
  "use strict";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function sources() {
    if (window.SamjhoSources && typeof window.SamjhoSources.listSources === "function") {
      return window.SamjhoSources.listSources();
    }
    return [];
  }

  function feedCell(s) {
    if (s.feed_url) return '<a href="' + esc(s.feed_url) + '" target="_blank" rel="noopener">' + esc(s.feed_url) + "</a>";
    return '<span class="inbox-badge inbox-badge--draft">Not configured</span>';
  }

  function render() {
    var tbody = document.getElementById("sources-tbody");
    var count = document.getElementById("sources-count");
    if (!tbody) return;
    var list = sources();
    tbody.innerHTML = list.map(function (s) {
      return "<tr>" +
        "<td class=\"inbox-table__title\">" + esc(s.source_name) + "</td>" +
        "<td><a href=\"" + esc(s.source_url) + "\" target=\"_blank\" rel=\"noopener\">" + esc(s.source_url) + "</a></td>" +
        "<td>" + feedCell(s) + "</td>" +
        "<td>" + esc(s.source_type) + "</td>" +
        "<td>" + (s.is_active ? '<span class="inbox-badge inbox-badge--approved">Active</span>' : '<span class="inbox-badge inbox-badge--draft">Inactive</span>') + "</td>" +
        "<td>" + (s.checked_date ? esc(s.checked_date) : "—") + "</td>" +
        "</tr>";
    }).join("");
    if (count) count.textContent = list.length + " source(s) registered (pilot: PIB only).";
    var feedInput = document.getElementById("s-feed-url");
    if (feedInput && list.length) feedInput.value = list[0].feed_url || "";
  }

  function onCheck() {
    var msg = document.getElementById("sources-msg");
    var feedInput = document.getElementById("s-feed-url");
    var list = sources();
    if (!list.length) { if (msg) msg.textContent = "No sources registered."; return; }
    var source = Object.assign({}, list[0], { feed_url: feedInput ? feedInput.value.trim() : "" });
    if (!window.SamjhoSourceFetcher) { if (msg) msg.textContent = "Fetcher module not loaded."; return; }
    var det = window.SamjhoSourceFetcher.detectFeed(source);
    if (msg) {
      msg.textContent = det.ok
        ? "FEED_CONFIGURED: " + det.feedUrl + " (live fetching still requires robots.txt clearance; nothing fetched automatically.)"
        : det.code + ": " + det.message;
    }
  }

  function init() {
    render();
    var btn = document.getElementById("s-check");
    if (btn) btn.addEventListener("click", onCheck);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
