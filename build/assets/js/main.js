(function () {
  "use strict";

  // ---------------------------------------------------------- Mobile nav
  var navToggle = document.getElementById("navToggle");
  var mobileNav = document.getElementById("mobileNav");
  if (navToggle && mobileNav) {
    navToggle.addEventListener("click", function () {
      var isOpen = mobileNav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  // ---------------------------------------------------------- Search
  var INDEX = window.SAMJHO_SEARCH_INDEX || [];

  function scoreMatch(item, query) {
    var q = query.toLowerCase().trim();
    if (!q) return 0;
    var haystacks = [item.title, item.category, (item.keywords || []).join(" ")];
    var score = 0;
    for (var i = 0; i < haystacks.length; i++) {
      var h = (haystacks[i] || "").toLowerCase();
      if (h === q) score += 100;
      else if (h.indexOf(q) === 0) score += 40;
      else if (h.indexOf(q) !== -1) score += 15;
    }
    return score;
  }

  function search(query) {
    if (!query || !query.trim()) return [];
    return INDEX.map(function (item) {
      return { item: item, score: scoreMatch(item, query) };
    })
      .filter(function (r) {
        return r.score > 0;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .slice(0, 8)
      .map(function (r) {
        return r.item;
      });
  }

  function typeLabel(type) {
    if (type === "guide") return "Guide";
    if (type === "calculator") return "Calculator";
    return "Category";
  }

  function renderResults(container, results, query) {
    if (!query.trim()) {
      container.innerHTML = "";
      container.classList.remove("is-open");
      return;
    }
    if (results.length === 0) {
      container.innerHTML =
        '<div class="result-empty">No matches for "' +
        escapeHtml(query) +
        '" yet. Try a shorter word, or <a href="/explore/">browse topics</a>.</div>';
      container.classList.add("is-open");
      return;
    }
    container.innerHTML = results
      .map(function (item) {
        return (
          '<a href="' +
          item.url +
          '" role="option">' +
          '<span class="result-kind">' +
          typeLabel(item.type) +
          "</span>" +
          '<span class="result-title">' +
          escapeHtml(item.title) +
          "</span><br/>" +
          '<span class="result-cat">' +
          escapeHtml(item.category || "") +
          "</span>" +
          "</a>"
        );
      })
      .join("");
    container.classList.add("is-open");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  var forms = document.querySelectorAll(".js-search-form");
  forms.forEach(function (form) {
    var input = form.querySelector(".js-search-input");
    var results = form.querySelector(".js-search-results");
    if (!input || !results) return;

    input.addEventListener("input", function () {
      renderResults(results, search(input.value), input.value);
    });

    input.addEventListener("focus", function () {
      if (input.value.trim()) renderResults(results, search(input.value), input.value);
    });

    document.addEventListener("click", function (e) {
      if (!form.contains(e.target)) {
        results.classList.remove("is-open");
      }
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        results.classList.remove("is-open");
        input.blur();
      }
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var modeSelect = form.querySelector(".search-mode-select");
      var searchMode = modeSelect ? modeSelect.value : "samjho";
      
      if (searchMode === "google") {
        // Google Search mode - redirect to Google
        var query = input.value.trim();
        if (query) {
          var googleUrl = "https://www.google.com/search?q=" + encodeURIComponent(query);
          var engineId = form.getAttribute("data-google-engine-id");
          if (engineId) {
            // Use Google Custom Search if engine ID is configured
            googleUrl = "https://cse.google.com/cse?cx=" + encodeURIComponent(engineId) + "&q=" + encodeURIComponent(query);
          }
          window.open(googleUrl, "_blank", "noopener,noreferrer");
        }
        return;
      }
      
      // Samjho Search mode - existing behavior
      var matches = search(input.value);
      if (matches.length > 0) {
        window.location.href = matches[0].url;
      } else {
        renderResults(results, [], input.value || " ");
      }
    });
  });
})();
