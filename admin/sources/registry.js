// Samjho Admin — Source Registry.
// Multi-source content pipeline: PIB, RBI, SEBI, MyGov, MSME, etc.
//
// This file works in Node (require) and in the browser (window.SamjhoSources).

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SamjhoSources = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SOURCES = [
    {
      id: "pib",
      source_name: "Press Information Bureau (PIB)",
      source_url: "https://pib.gov.in/",
      feed_url: "https://pib.gov.in/allRel.aspx?reg=48&lang=1",
      category: "Government",
      type: "html",
      is_active: true,
    },
    {
      id: "rbi",
      source_name: "Reserve Bank of India (RBI)",
      source_url: "https://www.rbi.org.in/",
      feed_url: "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx",
      rss_url: "https://rbi.org.in/scripts/BS_PressReleaseDisplay.aspx",
      category: "Money",
      type: "html",
      is_active: true,
    },
    {
      id: "sebi",
      source_name: "Securities and Exchange Board of India (SEBI)",
      source_url: "https://www.sebi.gov.in/",
      rss_url: "https://www.sebi.gov.in/sebirss.xml",
      category: "Money",
      type: "rss",
      is_active: true,
    },
    {
      id: "mygov",
      source_name: "MyGov India",
      source_url: "https://mygov.in/",
      rss_url: "https://www.mygov.in/rss.xml",
      category: "Government",
      type: "rss",
      is_active: true,
    },
    {
      id: "msme",
      source_name: "Ministry of MSME",
      source_url: "https://msme.gov.in/",
      feed_url: "https://msme.gov.in/",
      category: "Business",
      type: "html",
      is_active: false, // msme.gov.in returns 302 + blocks bots
    },
    {
      id: "incometax",
      source_name: "Income Tax India",
      source_url: "https://incometaxindia.gov.in/",
      feed_url: "https://incometaxindia.gov.in/Pages/press-releases.aspx",
      category: "Documents",
      type: "html",
      is_active: false, // incometaxindia.gov.in returns 302/403
    },
    {
      id: "ugc",
      source_name: "University Grants Commission (UGC)",
      source_url: "https://www.ugc.gov.in/",
      feed_url: "https://www.ugc.gov.in/",
      category: "Education",
      type: "html",
      is_active: true,
    },
    {
      id: "aicte",
      source_name: "All India Council for Technical Education (AICTE)",
      source_url: "https://www.aicte-india.org/",
      feed_url: "https://www.aicte-india.org/",
      category: "Education",
      type: "html",
      is_active: true,
    },
    {
      id: "dgft",
      source_name: "Directorate General of Foreign Trade (DGFT)",
      source_url: "https://www.dgft.gov.in/",
      feed_url: "https://www.dgft.gov.in/CP/",
      category: "Business",
      type: "html",
      is_active: true,
    },
    {
      id: "startupindia",
      source_name: "Startup India (DPIIT)",
      source_url: "https://www.startupindia.gov.in/",
      feed_url: "https://www.startupindia.gov.in/",
      category: "Business",
      type: "html",
      is_active: true,
    },
    {
      id: "epfo",
      source_name: "Employees' Provident Fund Organisation (EPFO)",
      source_url: "https://www.epfindia.gov.in/",
      feed_url: "https://www.epfindia.gov.in/site_en/en_Whats_new.php",
      category: "Money",
      type: "html",
      is_active: true,
    },
  ];

  function listSources() {
    return SOURCES.filter(function (s) { return s.is_active; })
      .map(function (s) { return Object.assign({}, s); });
  }

  function getSource(id) {
    for (var i = 0; i < SOURCES.length; i++) {
      if (SOURCES[i].id === id) return Object.assign({}, SOURCES[i]);
    }
    return null;
  }

  function getActiveSources() {
    return SOURCES.filter(function (s) { return s.is_active; });
  }

  return {
    SOURCES: SOURCES,
    listSources: listSources,
    getSource: getSource,
    getActiveSources: getActiveSources,
  };
});
