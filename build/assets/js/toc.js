// Guide sidebar: smooth-scroll TOC + scrollspy highlighting.
(function () {
  "use strict";

  var links = Array.prototype.slice.call(
    document.querySelectorAll('.guide-sidebar__toc a[href^="#sec-"]')
  );
  if (!links.length) return;

  // Smooth scroll on click (respect users who prefer reduced motion).
  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  links.forEach(function (link) {
    link.addEventListener("click", function (e) {
      var target = document.getElementById(link.getAttribute("href").slice(1));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      if (history.replaceState) history.replaceState(null, "", link.getAttribute("href"));
    });
  });

  // Scrollspy: highlight the link of the section currently in view.
  var sections = links
    .map(function (l) { return document.getElementById(l.getAttribute("href").slice(1)); })
    .filter(Boolean);

  function highlight() {
    var line = window.scrollY + 140;
    var current = sections[0];
    sections.forEach(function (s) {
      if (s.offsetTop <= line) current = s;
    });
    links.forEach(function (l) {
      l.classList.toggle("active", !!current && l.getAttribute("href") === "#" + current.id);
    });
  }

  var ticking = false;
  window.addEventListener(
    "scroll",
    function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(function () {
          highlight();
          ticking = false;
        });
      }
    },
    { passive: true }
  );
  highlight();
})();
