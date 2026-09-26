const fs = require("fs");
const path = require("path");

const site = require("./data/site");
const articles = require("./data/articles");
const calculators = require("./data/calculators");
const schemes = require("./data/schemes");
const publishedStore = require("./data/published-store");
const { renderPage, esc } = require("./templates/layout");
const { renderMasterGuide } = require("./templates/master-guide");

// Admin foundation copy (no public-site impact)
const { copyAdmin, emitMasterGuideBrowser, emitQuestionsAdmin } = require("./admin");
const { emitFunctions } = require("./emit-functions");
const { emitSupabase } = require("./emit-supabase");

const OUT = path.join(__dirname, "..", "dist");

// --- Supabase category counts (live from content_items table) ---
var CATEGORY_MAP = {
  government: "Government", documents: "Documents",
  business: "Business", money: "Money", education: "Education",
};

async function getCategoryCounts() {
  try {
    var url = "https://clxwcivvxyyodahexjao.supabase.co/rest/v1/content_items?select=primary_category&status=in.(published,approved)&categorization_status=eq.categorized";
    var response = await fetch(url, {
      headers: { apikey: "sb_publishable_Udyya4vm0W22IDL-EoS4mw_kuE6mVnu", Authorization: "Bearer sb_publishable_Udyya4vm0W22IDL-EoS4mw_kuE6mVnu" },
    });
    if (!response.ok) { console.log("[counts] Query failed:", response.status); return {}; }
    var items = await response.json();
    var counts = {};
    items.forEach(function (item) {
      var raw = (item.primary_category || "").trim().toLowerCase();
      var entry = Object.entries(CATEGORY_MAP).find(function (e) {
        return e[1].toLowerCase() === raw || e[0] === raw;
      });
      if (entry) counts[entry[0]] = (counts[entry[0]] || 0) + 1;
    });
    console.log("[counts] Supabase:", counts);
    return counts;
  } catch (err) {
    console.log("[counts] Error:", err.message);
    return {};
  }
}

function getLocalCategoryCounts() {
  var counts = {};
  articles.forEach(function (a) {
    if (a.category) counts[a.category] = (counts[a.category] || 0) + 1;
  });
  return counts;
}

function mergeCounts(s, l) {
  var r = Object.assign({}, l);
  Object.keys(s).forEach(function (k) { r[k] = s[k]; });
  return r;
}

var categoryCounts = {};

// ------------------------------------------------------------------ utils
function write(relPath, content) {
  const full = path.join(OUT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function categoryLabel(slug) {
  const c = site.categories.find((c) => c.slug === slug);
  return c ? c.label : slug;
}

function guideUrl(slug) {
  return `/guides/${slug}/`;
}
function schemeUrl(slug) {
  return `/schemes/${slug}/`;
}
function calcUrl(slug) {
  return `/calculators/${slug}/`;
}
function hubUrl(slug) {
  return `/${slug}/`;
}

function card({ href, eyebrow, title, desc }) {
  return `<a class="card" href="${href}">
    ${eyebrow ? `<span class="card-eyebrow">${esc(eyebrow)}</span>` : ""}
    <h3>${esc(title)}</h3>
    <p>${esc(desc)}</p>
  </a>`;
}

function cardGrid(cards, cols) {
  return `<div class="card-grid card-grid--${cols}">${cards.join("")}</div>`;
}

function breadcrumb(items) {
  const parts = items
    .map((it, i) =>
      i === items.length - 1
        ? `<span>${esc(it.label)}</span>`
        : `<a href="${it.href}">${esc(it.label)}</a>`
    )
    .join(" &nbsp;/&nbsp; ");
  return `<div class="breadcrumb">${parts}</div>`;
}

function breadcrumbSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.label,
      item: site.domain + it.href,
    })),
  };
}

function adSlot(kind, label) {
  return `<div class="ad-slot ad-slot--${kind}" data-ad-slot="${kind}">Advertisement</div>`;
}

function compactDescription(text, maxLength = 160) {
  const value = String(text).trim();
  if (value.length <= maxLength) return value;
  const shortened = value.slice(0, maxLength - 1).replace(/\s+\S*$/, "").trim();
  return `${shortened}…`;
}

function howToSchema({ name, description, url, steps }) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    url,
    step: steps.map((text, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: String(text).slice(0, 120),
      text,
    })),
  };
}

// Inline internal links: wrap whitelisted topic terms inside escaped paragraphs.
// Applied per-article via a.slug gate so only opted-in guides get links.
const INLINE_LINK_TERMS = {
  "what-is-udyam": [
    ["Business Loan", "/guides/business-loan/"],
    ["MSME", "/guides/msme-schemes/"],
    ["GST", "/guides/what-is-gst/"],
    ["PAN", "/guides/what-is-pan-card/"],
    ["Trademark", "/guides/trademark/"],
  ],
  "msme-schemes": [
    ["Udyam", "/guides/what-is-udyam/"],
    ["GST", "/guides/what-is-gst/"],
    ["Business Loan", "/guides/business-loan/"],
    ["FSSAI", "/guides/fssai-license/"],
    ["Trademark", "/guides/trademark/"],
  ],
  "fssai-license": [
    ["MSME", "/guides/msme-schemes/"],
    ["Udyam", "/guides/what-is-udyam/"],
    ["GST", "/guides/what-is-gst/"],
    ["Business Loan", "/guides/business-loan/"],
  ],
  "business-loan": [
    ["Udyam", "/guides/what-is-udyam/"],
    ["GST", "/guides/what-is-gst/"],
    ["Credit Score", "/guides/what-is-credit-score/"],
    ["EMI", "/guides/what-is-emi/"],
    ["MSME", "/guides/msme-schemes/"],
  ],
  "trademark": [
    ["Udyam", "/guides/what-is-udyam/"],
    ["MSME", "/guides/msme-schemes/"],
    ["GST", "/guides/what-is-gst/"],
  ],
  "what-is-gst": [
    ["PAN", "/guides/what-is-pan-card/"],
    ["Business Loan", "/guides/business-loan/"],
    ["Udyam", "/guides/what-is-udyam/"],
    ["MSME", "/guides/msme-schemes/"],
    ["EMI", "/guides/what-is-emi/"],
  ],
  "what-is-emi": [
    ["Credit Score", "/guides/what-is-credit-score/"],
    ["GST", "/guides/what-is-gst/"],
    ["Business Loan", "/guides/business-loan/"],
    ["Compound Interest", "/guides/what-is-compound-interest/"],
    ["Savings Account", "/guides/what-is-savings-account/"],
  ],
  "what-is-credit-score": [
    ["EMI", "/guides/what-is-emi/"],
    ["PAN", "/guides/what-is-pan-card/"],
    ["Business Loan", "/guides/business-loan/"],
    ["Credit Card", "/guides/what-is-credit-card/"],
  ],
  "what-is-uan": [
    ["E-Shram", "/guides/e-shram-card/"],
    ["PF", "/guides/what-is-uan/"],
  ],
  "what-is-cgpa": [
    ["Scholarship", "/guides/scholarship-guide/"],
    ["Entrance Exams", "/guides/entrance-exams/"],
    ["Career Options", "/guides/career-options/"],
  ],
  "what-is-inflation": [
    ["GST", "/guides/what-is-gst/"],
    ["Compound Interest", "/guides/what-is-compound-interest/"],
    ["Savings Account", "/guides/what-is-savings-account/"],
  ],
  "pm-kisan-yojana": [
    ["Aadhaar", "/guides/what-is-aadhaar/"],
    ["E-Shram", "/guides/e-shram-card/"],
    ["Ration Card", "/guides/ration-card/"],
    ["Udyam", "/guides/what-is-udyam/"],
  ],
  "udyam-registration": [
    ["MSME", "/guides/msme-schemes/"],
    ["GST", "/guides/what-is-gst/"],
    ["Business Loan", "/guides/business-loan/"],
    ["FSSAI", "/guides/fssai-license/"],
  ],
  "what-is-compound-interest": [
    ["EMI", "/guides/what-is-emi/"],
    ["Savings Account", "/guides/what-is-savings-account/"],
    ["Inflation", "/guides/what-is-inflation/"],
  ],
  "what-is-pan-card": [
    ["Aadhaar", "/guides/what-is-aadhaar/"],
    ["GST", "/guides/what-is-gst/"],
    ["Income Certificate", "/guides/income-certificate/"],
    ["Passport", "/guides/passport/"],
  ],
  "what-is-credit-card": [
    ["Credit Score", "/guides/what-is-credit-score/"],
    ["EMI", "/guides/what-is-emi/"],
    ["Savings Account", "/guides/what-is-savings-account/"],
  ],
  "what-is-savings-account": [
    ["PAN", "/guides/what-is-pan-card/"],
    ["Aadhaar", "/guides/what-is-aadhaar/"],
    ["Credit Card", "/guides/what-is-credit-card/"],
    ["Inflation", "/guides/what-is-inflation/"],
  ],
  "what-is-aadhaar": [
    ["PAN", "/guides/what-is-pan-card/"],
    ["Voter ID", "/guides/voter-id/"],
    ["Ration Card", "/guides/ration-card/"],
    ["E-Shram", "/guides/e-shram-card/"],
  ],
  "ration-card": [
    ["Aadhaar", "/guides/what-is-aadhaar/"],
    ["PM Kisan", "/guides/pm-kisan-yojana/"],
    ["E-Shram", "/guides/e-shram-card/"],
  ],
  "e-shram-card": [
    ["Aadhaar", "/guides/what-is-aadhaar/"],
    ["UAN", "/guides/what-is-uan/"],
    ["Ration Card", "/guides/ration-card/"],
    ["PM Kisan", "/guides/pm-kisan-yojana/"],
  ],
  "voter-id": [
    ["Aadhaar", "/guides/what-is-aadhaar/"],
    ["PAN", "/guides/what-is-pan-card/"],
    ["Passport", "/guides/passport/"],
  ],
  "passport": [
    ["PAN", "/guides/what-is-pan-card/"],
    ["Aadhaar", "/guides/what-is-aadhaar/"],
    ["Voter ID", "/guides/voter-id/"],
    ["Driving Licence", "/guides/driving-licence/"],
  ],
  "driving-licence": [
    ["Passport", "/guides/passport/"],
    ["PAN", "/guides/what-is-pan-card/"],
  ],
  "birth-certificate": [
    ["Aadhaar", "/guides/what-is-aadhaar/"],
    ["Passport", "/guides/passport/"],
    ["Marriage Certificate", "/guides/marriage-certificate/"],
  ],
  "income-certificate": [
    ["PAN", "/guides/what-is-pan-card/"],
    ["Caste Certificate", "/guides/caste-certificate/"],
    ["Aadhaar", "/guides/what-is-aadhaar/"],
  ],
  "caste-certificate": [
    ["Income Certificate", "/guides/income-certificate/"],
    ["Aadhaar", "/guides/what-is-aadhaar/"],
    ["Scholarship", "/guides/scholarship-guide/"],
  ],
  "marriage-certificate": [
    ["Aadhaar", "/guides/what-is-aadhaar/"],
    ["Passport", "/guides/passport/"],
    ["Birth Certificate", "/guides/birth-certificate/"],
  ],
  "scholarship-guide": [
    ["CGPA", "/guides/what-is-cgpa/"],
    ["Entrance Exams", "/guides/entrance-exams/"],
    ["Career Options", "/guides/career-options/"],
    ["Caste Certificate", "/guides/caste-certificate/"],
  ],
  "entrance-exams": [
    ["Scholarship", "/guides/scholarship-guide/"],
    ["CGPA", "/guides/what-is-cgpa/"],
    ["Career Options", "/guides/career-options/"],
  ],
  "career-options": [
    ["Scholarship", "/guides/scholarship-guide/"],
    ["Entrance Exams", "/guides/entrance-exams/"],
    ["CGPA", "/guides/what-is-cgpa/"],
  ],
};

function inlineLinked(p, slug) {
  const safe = esc(p);
  const terms = INLINE_LINK_TERMS[slug];
  if (!terms) return safe;
  const map = new Map(terms);
  // Single pass, case-sensitive; boundaries stop matches inside words
  // (e.g. "MSME" must not match inside "CGTMSE", "GST" not inside "CGST").
  const rx = new RegExp(
    "(?<![A-Za-z])(" + terms.map(([t]) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![A-Za-z-])",
    "g"
  );
  return safe.replace(rx, (m) => `<a href="${map.get(m)}">${m}</a>`);
}

function webPageSchema({ name, description, url }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    description,
    url,
  };
}

// ------------------------------------------------------------------ HOME
function readingTime(article) {
  const text = [
    article.shortAnswer,
    article.simpleExplanation.join(" "),
    article.whyMatters,
    article.example,
  ].join(" ");
  return `${Math.max(3, Math.ceil(text.split(/\s+/).length / 180))} min read`;
}

function buildHome() {
  const popularSlugs = [
    "what-is-gst",
    "what-is-emi",
    "what-is-credit-score",
    "what-is-uan",
    "what-is-pan-card",
    "what-is-savings-account",
  ];
  const popularArticles = popularSlugs
    .map((slug) => articles.find((x) => x.slug === slug))
    .filter(Boolean);

  const topicIcons = {
    government: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7v2h20V7L12 2zM4 10v8H2v2h20v-2h-2v-8h-3v8h-2v-8h-2v8h-2v-8H9v8H7v-8H4z"/></svg>',
    documents: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm2-6h8v2H8v-2zm0-3h8v2H8v-2zm0-3h5v2H8V8z"/></svg>',
    business: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM10 4h4v2h-4V4zm10 16H4V8h16v12z"/></svg>',
    money: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.64-2.1 1.64-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z"/></svg>',
    education: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>',
  };

  const calcIcons = {
    emi: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2H7zm0 2h10v16H7V4zm2 3v2h6V7H9zm0 4v2h6v-2H9zm0 4v2h4v-2H9z"/></svg>',
    gst: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6zm0 2h7v5h5v11H6V4zm7.5 9c-.83 0-1.5.67-1.5 1.5S12.67 16 13.5 16s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zM10 9h4v2h-4V9z"/></svg>',
    age: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2H7zm0 2h10v3H7V4zm0 5h10v11H7V9zm2 2v2h2v-2H9zm4 0v2h2v-2h-2zm-4 4v2h2v-2H9zm4 0v2h2v-2h-2z"/></svg>',
    discount: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>',
    "simple-interest": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"/></svg>',
    cgpa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L1 9l11 6 9-4.91V17h2V9M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/></svg>',
  };

  const guideIcons = {
    "what-is-gst": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    "what-is-emi": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/></svg>',
    "what-is-credit-score": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    "what-is-uan": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="4" x2="9" y2="10"/></svg>',
    "what-is-pan-card": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="12" r="1.5"/><line x1="12" y1="10" x2="18" y2="10"/><line x1="12" y1="14" x2="16" y2="14"/></svg>',
    "what-is-savings-account": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  };

  const toolCards = calculators
    .map(
      (c) => `<a class="home-tool-card" href="${calcUrl(c.slug)}">
        <span class="home-tool-card__icon" aria-hidden="true">${calcIcons[c.slug] || ""}</span>
        <span class="home-tool-card__title">${esc(c.title)}</span>
      </a>`
    )
    .join("");

  const categoryDescriptions = {
    government: "Schemes, benefits, scholarships and public services",
    documents: "Aadhaar, PAN, certificates, KYC and government services",
    business: "MSME, GST, registrations, loans and compliance",
    money: "Loans, calculators, credit score, banking and more",
    education: "Scholarships, exams, jobs, career resources",
  };

  const categoryCards = site.hubs
    .map(
      (c) => `<a class="home-category-card home-category-card--${c.slug}" href="${hubUrl(c.slug)}">
        <span class="home-category-card__icon" aria-hidden="true">${topicIcons[c.slug] || ""}</span>
        <h3>${esc(c.label)}</h3>
        <span class="home-category-card__count">${categoryCounts[c.slug] || 0} guides</span>
        <p>${esc(categoryDescriptions[c.slug] || c.description)}</p>
        <span class="home-category-card__arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8l4 4-4 4"/><path d="M8 12h8"/></svg>
        </span>
      </a>`
    )
    .join("");

  const popularCards = popularArticles
    .map(
      (a, i) => `<a class="home-guide-card" href="${guideUrl(a.slug)}">
        <span class="home-guide-card__icon" aria-hidden="true">${guideIcons[a.slug] || ""}</span>
        <span class="home-guide-card__index">0${i + 1}</span>
        <span class="card-eyebrow">${esc(categoryLabel(a.category))} <span aria-hidden="true">/</span> ${readingTime(a)}</span>
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.shortAnswer)}</p>
        <span class="home-card-link">Read guide <span aria-hidden="true">→</span></span>
      </a>`
    )
    .join("");

  const popularChips = [
    { label: "PM Kisan", href: "/government/" },
    { label: "Aadhaar Update", href: "/documents/" },
    { label: "Gst Calculator", href: "/calculators/gst/" },
    { label: "Scholarships", href: "/government/" },
    { label: "Udyam Registration", href: "/business/" },
  ]
    .map((chip) => `<a class="home-popular-chip" href="${chip.href}">${chip.label}</a>`)
    .join("");

  const featuredArticles = [
    { article: articles.find((x) => x.slug === "pm-kisan-yojana"), category: "Government", description: "Check eligibility, benefits, required documents and how to apply." },
    { article: articles.find((x) => x.slug === "what-is-pan-card"), category: "Documents", title: "PAN Card Apply Online", description: "Step-by-step process, documents, fees and official link." },
    { article: articles.find((x) => x.slug === "udyam-registration"), category: "Business", description: "Benefits, eligibility, documents and application process." },
  ].filter((x) => x.article || x.href);

  const featuredIllustrations = {
    government: '<picture><source srcset="assets/featured-kisan.webp" type="image/webp"><img src="assets/featured-kisan.png" alt="PM Kisan Yojana" loading="lazy" /></picture>',
    documents: '<picture><source srcset="assets/featured-pan.webp" type="image/webp"><img src="assets/featured-pan.png" alt="PAN Card" loading="lazy" /></picture>',
    business: '<picture><source srcset="assets/featured-udyam.webp" type="image/webp"><img src="assets/featured-udyam.png" alt="Udyam Registration" loading="lazy" /></picture>',
  };


  // --- Latest Articles: 5 most recently published ---
  const latestArticles = [...articles]
    .filter((a) => a.lastUpdated)
    .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated))
    .slice(0, 5);
  const latestCards = latestArticles
    .map(
      (a) => `<a class="home-latest-card" href="${guideUrl(a.slug)}">
        <div class="home-latest-card__top">
          <span class="home-latest-card__category">${esc(categoryLabel(a.category))}</span>
          <span class="home-latest-card__date">${esc(a.lastUpdated)}</span>
        </div>
        <h3 class="home-latest-card__title">${esc(a.title)}</h3>
        <p class="home-latest-card__desc">${esc(compactDescription(a.shortAnswer, 120))}</p>
        <span class="home-card-link">Read more <span aria-hidden="true">→</span></span>
      </a>`
    )
    .join("");

  // --- All Articles by Category (homepage grid) ---
  const allCategoryArticleCards = site.hubs
    .flatMap((hub) => {
      const catArticles = articles.filter((a) => a.category === hub.slug);
      return catArticles.slice(0, 3).map((a) => ({ article: a, hub: hub }));
    })
    .map(
      ({ article: a, hub }) => `<a class="home-all-card" href="${guideUrl(a.slug)}">
        <span class="home-all-card__eyebrow">${esc(hub.label)}</span>
        <h3 class="home-all-card__title">${esc(a.title)}</h3>
        <p class="home-all-card__desc">${esc(compactDescription(a.shortAnswer, 100))}</p>
        <span class="home-card-link">Read guide <span aria-hidden="true">→</span></span>
      </a>`
    )
    .join("");
  const featuredCards = featuredArticles
    .map((x) => {
      const href = x.href || guideUrl(x.article.slug);
      const title = x.title || x.article.title;
      const description = x.description || x.article.shortAnswer;
      return `<a class="home-featured-card home-featured-card--${x.category.toLowerCase()}" href="${href}">
        <div class="home-featured-card__content">
          <span class="home-featured-card__label">${esc(x.category)}</span>
          <h3>${esc(title)}</h3>
          <p>${esc(description)}</p>
          <span class="home-card-link">Learn More <span aria-hidden="true">→</span></span>
        </div>
        <div class="home-featured-card__illustration">
          ${featuredIllustrations[x.category.toLowerCase()] || ''}
        </div>
      </a>`;
    })
    .join("");

  const benefitItems = [
    ["Reliable Information", "Easy-to-understand guidance with official sources.", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'],
    ["Useful Tools", "Calculators and resources for real-life decisions.", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'],
    ["For Everyone", "Students, working professionals, business owners and families.", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'],
    ["Save Time", "Find what you need, faster.", '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'],
  ];

  const benefitCards = benefitItems
    .map(
      ([title, desc, icon]) => `<div class="home-benefit-card">
        <span class="home-benefit-card__icon" aria-hidden="true">${icon}</span>
        <h3>${esc(title)}</h3>
        <p>${esc(desc)}</p>
      </div>`
    )
    .join("");

  const body = `
  <div class="home-page">
    <section class="home-hero">
      <div class="home-hero__inner">
        <div class="home-hero__grid">
          <div class="home-hero__content">
            <h1>Your Questions.<br />Clear Answers.<br /><span class="home-hero__highlight">Brighter Decisions.</span></h1>
            <p class="home-hero__lede">Find government schemes, document help, business resources, calculators, scholarships and more — all in one place.</p>
            <form class="search-wrap js-search-form home-search" role="search" aria-label="Site search" data-google-enabled="${site.googleSearch.enabled ? 'true' : 'false'}" data-google-engine-id="${esc(site.googleSearch.engineId || '')}">
              <div class="search-box">
                <span class="search-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
                <input type="search" class="js-search-input" placeholder="Search schemes, documents, jobs, calculators..." aria-label="What do you want to understand?" autocomplete="off" />
                <select class="search-mode-select js-search-mode" aria-label="Search mode">
                  <option value="samjho">Search Samjho</option>
                  <option value="google" ${site.googleSearch.enabled ? '' : 'disabled'}>Search Google</option>
                </select>
                <button type="submit">Search</button>
              </div>
              <div class="search-results js-search-results" role="listbox"></div>
            </form>
            <div class="home-popular-chips">
              <span class="home-popular-label">Popular searches:</span>
              ${popularChips}
            </div>
          </div>
          <div class="home-hero__visual">
            <div class="home-hero__illustration-wrapper">
              <div class="home-hero__illustration">
                <picture><source srcset="assets/hero-illustration-new.webp" type="image/webp"><img src="assets/hero-illustration-new.png" alt="India Gate, Parliament and India map illustration" class="hero-illustration-img" loading="eager" /></picture>
              </div>
            </div>
          </div>
        </div>
        <div class="home-hero__tagline-overlay">
          <div class="home-hero__tagline-item"><span class="home-hero__tagline-bullet home-hero__tagline-bullet--orange"></span><span>Sahi Jaankari</span></div>
          <div class="home-hero__tagline-item"><span class="home-hero__tagline-bullet home-hero__tagline-bullet--teal"></span><span>Se Aage Badein</span></div>
        </div>
      </div>
    </section>

    <section class="home-section home-section--categories">
      <div class="container">
        <div class="home-section-heading home-section-heading--row">
          <h2>Explore by Category</h2>
          <a href="/explore/" class="home-section-link">See All Categories <span aria-hidden="true">→</span></a>
        </div>
        <div class="home-category-grid">${categoryCards}</div>
      </div>
    </section>

    <section class="home-section home-section--tools">
      <div class="container">
        <div class="home-section-heading home-section-heading--row">
          <h2>Popular Tools</h2>
          <a href="/calculators/" class="home-section-link">View All Tools <span aria-hidden="true">→</span></a>
        </div>
        <div class="home-tools-grid">${toolCards}</div>
      </div>
    </section>

    <section class="home-section home-section--featured">
      <div class="container">
        <div class="home-section-heading home-section-heading--row">
          <h2>Featured Today</h2>
          <a href="/guides/" class="home-section-link">View All <span aria-hidden="true">→</span></a>
        </div>
        <div class="home-featured-grid">${featuredCards}</div>
      </div>
    </section>

    <section class="home-section home-section--popular-guides">
      <div class="container">
        <div class="home-section-heading home-section-heading--row">
          <h2>Popular Guides</h2>
          <a href="/guides/" class="home-section-link">All Guides <span aria-hidden="true">→</span></a>
        </div>
        <p class="home-section-subtitle">Step-by-step guides on the topics Indians search for most.</p>
        <div class="home-popular-guides-grid">${popularCards}</div>
      </div>
    </section>

    <section class="home-section home-section--latest">
      <div class="container">
        <div class="home-section-heading home-section-heading--row">
          <h2>Latest Articles</h2>
          <a href="/guides/" class="home-section-link">View All <span aria-hidden="true">→</span></a>
        </div>
        <p class="home-section-subtitle">Recently published guides and updates.</p>
        <div class="home-latest-grid">${latestCards}</div>
      </div>
    </section>

    <section class="home-section home-section--all-articles">
      <div class="container">
        <div class="home-section-heading home-section-heading--row">
          <h2>Browse All Articles</h2>
          <a href="/explore/" class="home-section-link">Explore Topics <span aria-hidden="true">→</span></a>
        </div>
        <p class="home-section-subtitle">Find guides, calculators and information across every category.</p>
        <div class="home-category-tabs">
          ${site.hubs.map((h, i) => `<a href="${hubUrl(h.slug)}" class="home-cat-tab${i === 0 ? " home-cat-tab--active" : ""}">${esc(h.label)}</a>`).join("")}
        </div>
        <div class="home-all-articles-grid">${allCategoryArticleCards}</div>
      </div>
    </section>

    <section class="home-section home-section--why">
      <div class="container">
        <div class="home-section-heading">
          <h2>Why Samjho?</h2>
        </div>
        <div class="home-benefits-grid">${benefitCards}</div>
      </div>
    </section>
  </div>
  `;

  const canonical = site.domain + "/";
  write(
    "index.html",
    renderPage({
      title: "Samjho India — Understand it. Calculate it. Decide better.",
      description: site.defaultDescription,
      canonical,
      activeHref: "/",
      showHeaderSearch: false,
      bodyHtml: body,
      structuredData: [
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Samjho",
          url: site.domain,
          description: site.defaultDescription,
        },
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: site.siteName,
          url: site.domain,
          logo: site.domain + site.publisher.logo,
          description: site.defaultDescription,
          sameAs: [
            "https://www.youtube.com/@SamjhoIndia",
          ],
        },
      ],
    })
  );
}

// ------------------------------------------------------------------ EXPLORE
function buildExplore() {
  const cards = site.hubs
    .map(
      (c) => `<a class="category-card" href="${hubUrl(c.slug)}">
        <h3>${esc(c.label)}</h3>
        <p>${esc(c.description)}</p>
        <span class="count">${c.groups.length} area(s)</span>
      </a>`
    )
    .join("");

  const body = `
  <div class="page-head container">
    <h1>Explore by topic</h1>
    <p>Every part of Samjho belongs to one of these five everyday categories. Pick one to see what's inside.</p>
  </div>
  <section class="section">
    <div class="container">
      <h2>Browse categories</h2>
      <div class="card-grid card-grid--3">${cards}</div>
    </div>
  </section>
  <div class="container">${adSlot("incontent", "Advertisement space")}</div>
  <section class="section section--tint">
    <div class="container">
      <div class="section-head">
        <h2>Prefer a calculator instead?</h2>
        <p>If you already know your numbers, jump straight to a calculator.</p>
      </div>
      <div class="card-grid card-grid--3">${calculators
        .map((c) => card({ href: calcUrl(c.slug), eyebrow: "Calculator", title: c.title, desc: c.short }))
        .join("")}</div>
    </div>
  </section>
  `;

  write(
    "explore/index.html",
    renderPage({
      title: "Explore Topics — Guides, Calculators, Schemes",
      description: "Browse Samjho India by government schemes, documents, business, money and education topics. Find guides, calculators and official links.",
      canonical: site.domain + "/explore/",
      activeHref: "/explore/",
      bodyHtml: body,
    })
  );
}

// ------------------------------------------------------------------ CATEGORY HUBS
function buildCategoryHub(hub) {
  const hubHref = hubUrl(hub.slug);

  // Group cards — "Coming soon" state until their detailed pages exist.
  const groupCards = hub.groups
    .map(
      (g) => `<div class="hub-group-card">
        <h3>${esc(g.title)}</h3>
        <p>${esc(g.description)}</p>
        <span class="hub-group-card__soon">Coming soon</span>
      </div>`
    )
    .join("");

  // Content cards — only link to pages that already exist.
  const contentCards = hub.content
    .map((ref) => {
      if (ref.type === "guide") {
        const a = articles.find((x) => x.slug === ref.slug);
        if (!a) return "";
        return card({ href: guideUrl(a.slug), eyebrow: "Guide", title: a.title, desc: a.shortAnswer });
      }
      if (ref.type === "calculator") {
        const c = calculators.find((x) => x.slug === ref.slug);
        if (!c) return "";
        return card({ href: calcUrl(c.slug), eyebrow: "Calculator", title: c.title, desc: c.short });
      }
      return "";
    })
    .filter(Boolean)
    .join("");

  const body = `
  <div class="hub-page">
    <div class="hub-head container">
      ${breadcrumb([
        { label: "Home", href: "/" },
        { label: hub.label, href: hubHref },
      ])}
      <h1>${esc(hub.label)}</h1>
      <p class="hub-head__lede">${esc(hub.description)}</p>
    </div>

    <section class="hub-section container">
      <div class="hub-section-heading">
        <p class="home-kicker">Explore ${esc(hub.label)}</p>
        <h2>What you'll find here</h2>
        <p>${esc(hub.intro)}</p>
      </div>
      <div class="hub-group-grid">${groupCards}</div>
    </section>

    ${contentCards ? `<section class="hub-section hub-section--tint container">
      <div class="hub-section-heading">
        <p class="home-kicker">Available now</p>
        <h2>Guides & calculators</h2>
        <p>Existing Samjho guides and calculators in this category.</p>
      </div>
      <div class="card-grid card-grid--3">${contentCards}</div>
    </section>` : ""}
  </div>
  `;

  const canonical = site.domain + hubHref;
  const structuredData = [
    breadcrumbSchema([
      { label: "Home", href: "/" },
      { label: hub.label, href: hubHref },
    ]),
    webPageSchema({
      name: `${hub.label} — Samjho`,
      description: hub.description,
      url: canonical,
    }),
  ];

  write(
    `${hub.slug}/index.html`,
    renderPage({
      title: `${hub.label} — Samjho`,
      description: hub.description,
      canonical,
      activeHref: hubHref,
      bodyHtml: body,
      structuredData,
    })
  );
}

// -------------------------------------------------------- GOVERNMENT PAGE (DEDICATED)
// SEO titles/descriptions: hub pages (unique, keyword-led, ~55-65 chars in <title>)
const HUB_SEO = {
  government: {
    title: "Government Schemes 2026 — Eligibility, Apply",
    description: "Sarkari yojana samjhein — PM Kisan e-KYC, Aadhaar update, ration card aur e-Shram. Official links ke saath 2026 updated Hindi guides.",
  },
  documents: {
    title: "Documents Guide 2026 — PAN, Aadhaar, Passport",
    description: "Aadhaar, PAN, voter ID, passport aur certificates — apply, update aur download. Step-by-step 2026 Hindi guides, official portals ke saath.",
  },
  business: {
    title: "Business Registration 2026 — Udyam, GST, FSSAI Guide",
    description: "Business shuru karein — Udyam registration free, GST, FSSAI licence, MSME loans. Fees, documents aur process ki 2026 Hindi guides.",
  },
  money: {
    title: "Money Guide 2026 — EMI, Credit Score, Savings, Loans",
    description: "Paisa samjhein — EMI, credit score 750+, savings, GST aur loans. Free calculators ke saath simple Hindi me 2026 updated guides.",
  },
  education: {
    title: "Education Guide 2026 — CGPA, Scholarships, Exams",
    description: "Padhai aur career — CGPA calculator, NSP scholarship, JEE/NEET/CUET exams aur 12th ke baad options. 2026 ki simple Hindi guides.",
  },
};

function buildGovernmentPage() {
  const govHub = site.hubs.find((h) => h.slug === "government");
  const description = HUB_SEO.government.description;
  const hubTitle = HUB_SEO.government.title;

  const yojanaCards = [
    {
      icon: "🌾",
      iconBg: "#16a34a",
      badge: "POPULAR",
      badgeColor: "#16a34a",
      title: "PM Kisan Samman Nidhi",
      hindi: "पीएम किसान सम्मान निधि",
      desc: "Kisan parivar ko saal mein ₹6,000 milte hain — 3 kiston mein seedha bank account. Eligibility check karein aur e-KYC status dekhein.",
      tags: ["11 Cr+ Farmers", "2 min read"],
      href: "/guides/pm-kisan-yojana/",
      source: "Official Source · Hindi Guide",
      updated: "2h ago",
    },
    {
      icon: "🪪",
      iconBg: "#0d9488",
      badge: "FAST TRACK",
      badgeColor: "#0d9488",
      title: "PAN Card Apply, Status, Correction",
      hindi: "पैन कार्ड — नया, स्टेटस, सुधार",
      desc: "PAN card ke liye apply karein, status track karein ya correction file karein. Instant e-PAN aur physical card dono ki poori jaankari.",
      tags: ["8.5 Cr Applied", "3 min read"],
      href: "/guides/what-is-pan-card/",
      source: "Official Source · Hindi Guide",
      updated: "5h ago",
    },
    {
      icon: "🏪",
      iconBg: "#f97316",
      badge: "NEW UPDATE",
      badgeColor: "#f97316",
      title: "Shop Act License & Udyam Registration",
      hindi: "शॉप एक्ट लाइसेंस और उद्यम रजिस्ट्रेशन",
      desc: "Chhote business ke liye registration — Shop Act aur Udyam dono. Online apply karein, documents jaanein, aur MSME benefits paayein.",
      tags: ["1.2 Cr Registered", "4 min read"],
      href: "/guides/udyam-registration/",
      source: "Official Source · Hindi Guide",
      updated: "1d ago",
    },
    {
      icon: "🆔",
      iconBg: "#0d9488",
      badge: "MOST SEARCHED",
      badgeColor: "#0d9488",
      title: "Aadhaar Update & Download",
      hindi: "आधार — अपडेट और डाउनलोड",
      desc: "Aadhaar card online update karein, download karein, aur status check karein. Mobile number link karne se lekar biometric update tak sab kuch.",
      tags: ["13 Cr+ Searches", "2 min read"],
      href: "/guides/what-is-aadhaar/",
      source: "Official Source · Hindi Guide",
      updated: "3h ago",
    },
    {
      icon: "🍚",
      iconBg: "#16a34a",
      badge: "POPULAR",
      badgeColor: "#16a34a",
      title: "Ration Card — List & e-KYC",
      hindi: "राशन कार्ड — सूची और ई-केवाईसी",
      desc: "Ration card ke liye apply karein, apna naam list mein check karein, aur e-KYC complete karein. State-wise process aur documents.",
      tags: ["80 Cr+ Cards", "3 min read"],
      href: "/guides/ration-card/",
      source: "Official Source · Hindi Guide",
      updated: "6h ago",
    },
    {
      icon: "👷",
      iconBg: "#0d9488",
      badge: "₹1000 AID",
      badgeColor: "#0d9488",
      title: "E-Shram Card & Benefits",
      hindi: "ई-श्रम कार्ड और लाभ",
      desc: "Unorganized sector workers ke liye ₹2 lakh accident insurance. E-Shram card banwaayein aur monthly benefits paayein.",
      tags: ["30 Cr+ Workers", "2 min read"],
      href: "/guides/e-shram-card/",
      source: "Official Source · Hindi Guide",
      updated: "8h ago",
    },
  ];

  const cardsHtml = yojanaCards
    .map(
      (c) => `<article class="gov-card">
      <div class="gov-card__top">
        <span class="gov-card__icon" style="background:${c.iconBg}">${c.icon}</span>
        <span class="gov-card__badge" style="background:${c.badgeColor}">${c.badge}</span>
      </div>
      <h3 class="gov-card__title">${esc(c.title)}</h3>
      <p class="gov-card__hindi">${esc(c.hindi)}</p>
      <p class="gov-card__desc">${esc(c.desc)}</p>
      <div class="gov-card__tags">${c.tags.map((t) => `<span class="gov-card__tag">${esc(t)}</span>`).join("")}</div>
      <div class="gov-card__footer">
        <a href="${c.href}" class="gov-card__cta">Padhe → Read More</a>
        <button class="gov-card__heart" aria-label="Save for later">♡</button>
      </div>
      <div class="gov-card__meta">
        <span>✦ ${esc(c.source)}</span>
        <span>Updated ${c.updated}</span>
      </div>
    </article>`
    )
    .join("");

  const trendingItems = [
    { title: "Ladli Behna Yojana 16th Kist Date", views: "2.1L views" },
    { title: "PM Vishwakarma Yojana Tool Kit", views: "98K views" },
    { title: "Ayushman Card Hospital List", views: "87K views" },
    { title: "Mukhyamantri Seekho Kamao", views: "76K views" },
  ];

  const trendingHtml = trendingItems
    .map(
      (t, i) => `<div class="gov-trending__item">
        <span class="gov-trending__num">${i + 1}</span>
        <div class="gov-trending__text">
          <p>${esc(t.title)}</p>
          <span>${t.views}</span>
        </div>
      </div>`
    )
    .join("");

  const categoryTags = ["Kisan Yojana", "Mahila Yojana", "Student", "Rozgar", "Bima", "Card Seva"];
  const categoryTagsHtml = categoryTags.map((t) => `<span class="gov-cat-tag">${esc(t)}</span>`).join("");

  const body = `
  <div class="gov-page">

    <div class="gov-utility-bar">
      <div class="container gov-utility-bar__inner">
        <span class="gov-utility-bar__left">AAJ KI YOJANA · UPDATED TODAY</span>
        <span class="gov-utility-bar__right">हिंदी | <span class="gov-utility-bar__active">ENGLISH</span></span>
      </div>
    </div>

    <section class="gov-hero">
      <div class="container gov-hero__grid">
        <div class="gov-hero__left">
          <div class="gov-hero__pills">
            <span class="gov-pill gov-pill--teal">● LIVE · ${categoryCounts.government || 127} YOJANAS</span>
            <span class="gov-pill gov-pill--orange">HINDI + ENGLISH</span>
          </div>
          <h1 class="gov-hero__title">Government <span class="gov-hero__title-grey">Yojana &amp;</span> Services</h1>
          <p class="gov-hero__hindi">सरकारी योजना को आसान भाषा में</p>
          <p class="gov-hero__desc">Government schemes aur services ki complete jaankari — form kaise bharna hai, kaunse document lagenge, aur paisa kab aayega — sab simple Hindi me.</p>
        </div>
        <div class="gov-hero__right">
          <div class="gov-quick-check">
            <h2 class="gov-quick-check__heading">Quick Check</h2>
            <div class="gov-quick-check__stats">
              <div class="gov-stat-card">
                <span class="gov-stat-card__label">PM KISAN STATUS</span>
                <span class="gov-stat-card__value">₹2000</span>
                <div class="gov-stat-card__bar"><div class="gov-stat-card__fill" style="width:66%"></div></div>
              </div>
              <div class="gov-stat-card">
                <span class="gov-stat-card__label">PAN STATUS</span>
                <span class="gov-stat-card__value">7 Days</span>
                <div class="gov-stat-card__bar"><div class="gov-stat-card__fill gov-stat-card__fill--teal" style="width:45%"></div></div>
              </div>
              <div class="gov-stat-card">
                <span class="gov-stat-card__label">AADHAAR LINK</span>
                <span class="gov-stat-card__value">Instant</span>
                <div class="gov-stat-card__bar"><div class="gov-stat-card__fill gov-stat-card__fill--green" style="width:90%"></div></div>
              </div>
            </div>
            <div class="gov-tip">
              <div class="gov-tip__content">
                <span class="gov-tip__label">Aaj ka Tip</span>
                <p>e-KYC pending hai toh PM Kisan ki kist atak gi. Abhi check karo.</p>
              </div>
              <button class="gov-tip__btn" aria-label="Check now">↻</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="gov-filters">
      <div class="container">
        <div class="gov-filters__row">
          <span class="gov-chip gov-chip--active">All Yojana ●</span>
          <span class="gov-chip">Kisan</span>
          <span class="gov-chip">Business</span>
          <span class="gov-chip">ID Cards</span>
          <span class="gov-chip">Udyam</span>
        </div>
        <p class="gov-filters__trust">Trusted by 4.21L+ Indians this month · No ads, no clutter</p>
      </div>
    </section>

    <section class="gov-content">
      <div class="container gov-content__grid">
        <div class="gov-main">
          <div class="gov-main__header">
            <h2>Popular Yojana · <span>${categoryCounts.government || 6} results</span></h2>
            <span class="gov-main__sort">Sorted by helpful</span>
          </div>
          <div class="gov-card-grid">
            ${cardsHtml}
          </div>
        </div>
        <aside class="gov-sidebar">
          <div class="gov-sidebar-widget gov-trending">
            <h3 class="gov-sidebar-widget__heading">🔥 Trending This Week <span class="gov-live-badge">Live</span></h3>
            ${trendingHtml}
            <a href="#" class="gov-trending__more">View All Trending →</a>
          </div>
          <div class="gov-sidebar-widget gov-newsletter">
            <h3 class="gov-newsletter__heading">Yojana ka paisa kab aayega? Update pehle paao.</h3>
            <p class="gov-newsletter__desc">Har Monday, 3 new yojana + form link. No spam, seedha kaam ki mail.</p>
            <form class="gov-newsletter__form">
              <input type="email" placeholder="Your email" aria-label="Email for yojana updates" />
              <button type="submit">Join</button>
            </form>
            <p class="gov-newsletter__note">12,400+ log jud chuke hain · Unsubscribe anytime</p>
          </div>
          <div class="gov-sidebar-widget gov-categories">
            <h3 class="gov-sidebar-widget__heading">CATEGORIES</h3>
            <div class="gov-categories__tags">${categoryTagsHtml}</div>
          </div>
          <div class="gov-sidebar-widget gov-help">
            <p>Need help? WhatsApp par 'Hi' bhejo, hum form bharna me help kar denge.</p>
            <a href="#" class="gov-help__link">Chat now →</a>
          </div>
        </aside>
      </div>
    </section>

    <section class="gov-banner-section">
      <div class="container">
        <div class="gov-banner">
          <div class="gov-banner__text">
            <span class="gov-banner__small">ABOUT SAMJHO INDIA</span>
            <h2>Samjho India is an independent information platform. We explain government schemes and services in simple language — so every Indian can understand and act.</h2>
          </div>
          <a href="/about/" class="gov-banner__btn">Learn More →</a>
        </div>
      </div>
    </section>

  </div>
  `;

  const canonical = site.domain + "/government/";
  const structuredData = [
    breadcrumbSchema([
      { label: "Home", href: "/" },
      { label: "Government", href: "/government/" },
    ]),
    webPageSchema({
      name: hubTitle,
      description,
      url: canonical,
    }),
  ];

  write(
    "government/index.html",
    renderPage({
      title: `${hubTitle} | Samjho India`,
      description,
      canonical,
      activeHref: "/government/",
      bodyHtml: body,
      structuredData,
    })
  );
}

// -------------------------------------------------------- DOCUMENTS PAGE (DEDICATED)
function buildDocumentsPage() {
  const description = HUB_SEO.documents.description;
  const hubTitle = HUB_SEO.documents.title;

  const docCards = [
    {
      icon: "🪪",
      iconBg: "#16a34a",
      badge: "POPULAR",
      badgeColor: "#16a34a",
      title: "PAN Card Apply & Status",
      hindi: "पैन कार्ड — अप्लाई और स्टेटस",
      desc: "PAN card ke liye apply karein, status track karein ya correction file karein. Instant e-PAN aur physical card dono ki poori jaankari.",
      tags: ["8.5 Cr Applied", "3 min read"],
      href: "/guides/what-is-pan-card/",
      source: "Official Source · Hindi Guide",
      updated: "5h ago",
    },
    {
      icon: "🆔",
      iconBg: "#0d9488",
      badge: "MOST SEARCHED",
      badgeColor: "#0d9488",
      title: "Aadhaar Update & Download",
      hindi: "आधार — अपडेट और डाउनलोड",
      desc: "Aadhaar card online update karein, download karein, aur status check karein. Mobile number link karne se lekar biometric update tak sab kuch.",
      tags: ["13 Cr+ Searches", "2 min read"],
      href: "/guides/what-is-aadhaar/",
      source: "Official Source · Hindi Guide",
      updated: "3h ago",
    },
    {
      icon: "🗳️",
      iconBg: "#0d9488",
      badge: "FAST TRACK",
      badgeColor: "#0d9488",
      title: "Voter ID Card — Apply & Download",
      hindi: "वोटर आईडी — अप्लाई और डाउनलोड",
      desc: "Voter ID card ke liye online apply karein, e-EPIC download karein, ya correction karwayein. NVSP portal se sab kuch ghar baithe.",
      tags: ["90 Cr+ Voters", "3 min read"],
      href: "/guides/voter-id/",
      source: "Official Source · Hindi Guide",
      updated: "1d ago",
    },
    {
      icon: "📘",
      iconBg: "#16a34a",
      badge: "POPULAR",
      badgeColor: "#16a34a",
      title: "Passport Apply Online",
      hindi: "पासपोर्ट — ऑनलाइन अप्लाई",
      desc: "Passport Seva portal se passport ke liye apply karein. Fees, documents, police verification — sab kuch step by step.",
      tags: ["2 Cr+ Passports", "4 min read"],
      href: "/guides/passport/",
      source: "Official Source · Hindi Guide",
      updated: "6h ago",
    },
    {
      icon: "🚗",
      iconBg: "#f97316",
      badge: "NEW UPDATE",
      badgeColor: "#f97316",
      title: "Driving Licence — Apply & Renew",
      hindi: "ड्राइविंग लाइसेंस — अप्लाई और रिन्यू",
      desc: "Learner's Licence se permanent DL tak — Parivahan portal se online apply karein. RTO test, fees, renewal sab ki jaankari.",
      tags: ["15 Cr+ DLs", "3 min read"],
      href: "/guides/driving-licence/",
      source: "Official Source · Hindi Guide",
      updated: "2d ago",
    },
    {
      icon: "💼",
      iconBg: "#0d9488",
      badge: "POPULAR",
      badgeColor: "#0d9488",
      title: "UAN / PF — Check & Download",
      hindi: "यूएएन / पीएफ — चेक और डाउनलोड",
      desc: "UAN number jaanein, PF balance check karein, aur passbook download karein. EPFO portal se online sab kuch karein.",
      tags: ["6 Cr+ Members", "2 min read"],
      href: "/guides/what-is-uan/",
      source: "Official Source · Hindi Guide",
      updated: "4h ago",
    },
  ];

  const cardsHtml = docCards
    .map(
      (c) => `<article class="gov-card">
      <div class="gov-card__top">
        <span class="gov-card__icon" style="background:${c.iconBg}">${c.icon}</span>
        <span class="gov-card__badge" style="background:${c.badgeColor}">${c.badge}</span>
      </div>
      <h3 class="gov-card__title">${esc(c.title)}</h3>
      <p class="gov-card__hindi">${esc(c.hindi)}</p>
      <p class="gov-card__desc">${esc(c.desc)}</p>
      <div class="gov-card__tags">${c.tags.map((t) => `<span class="gov-card__tag">${esc(t)}</span>`).join("")}</div>
      <div class="gov-card__footer">
        <a href="${c.href}" class="gov-card__cta">Padhe → Read More</a>
        <button class="gov-card__heart" aria-label="Save for later">♡</button>
      </div>
      <div class="gov-card__meta">
        <span>✦ ${esc(c.source)}</span>
        <span>Updated ${c.updated}</span>
      </div>
    </article>`
    )
    .join("");

  const trendingItems = [
    { title: "Aadhaar Address Change Online", views: "1.8L views" },
    { title: "PAN Aadhaar Link Status", views: "1.2L views" },
    { title: "Passport Appointment Slots", views: "98K views" },
    { title: "DL Renewal Online", views: "76K views" },
  ];

  const trendingHtml = trendingItems
    .map(
      (t, i) => `<div class="gov-trending__item">
        <span class="gov-trending__num">${i + 1}</span>
        <div class="gov-trending__text">
          <p>${esc(t.title)}</p>
          <span>${t.views}</span>
        </div>
      </div>`
    )
    .join("");

  const categoryTags = ["Identity", "Address", "Certificates", "Vehicle", "Tax", "Banking"];
  const categoryTagsHtml = categoryTags.map((t) => `<span class="gov-cat-tag">${esc(t)}</span>`).join("");

  const body = `
  <div class="gov-page">

    <div class="gov-utility-bar">
      <div class="container gov-utility-bar__inner">
        <span class="gov-utility-bar__left">AAJ KI YOJANA · UPDATED TODAY</span>
        <span class="gov-utility-bar__right">हिंदी | <span class="gov-utility-bar__active">ENGLISH</span></span>
      </div>
    </div>

    <section class="gov-hero">
      <div class="container gov-hero__grid">
        <div class="gov-hero__left">
          <div class="gov-hero__pills">
            <span class="gov-pill gov-pill--teal">● LIVE · ${categoryCounts.documents || 12} DOCUMENTS</span>
            <span class="gov-pill gov-pill--orange">HINDI + ENGLISH</span>
          </div>
          <h1 class="gov-hero__title">Documents <span class="gov-hero__title-grey">— Apply, Update &amp; Download</span></h1>
          <p class="gov-hero__hindi">आधार, पैन, पासपोर्ट — सब कुछ आसान भाषा में</p>
          <p class="gov-hero__desc">Aadhaar, PAN, Passport, Driving Licence — apply, update, download. Har document ka step-by-step process simple Hindi me.</p>
        </div>
        <div class="gov-hero__right">
          <div class="gov-quick-check">
            <h2 class="gov-quick-check__heading">Quick Check</h2>
            <div class="gov-quick-check__stats">
              <div class="gov-stat-card">
                <span class="gov-stat-card__label">PAN STATUS</span>
                <span class="gov-stat-card__value">7 Days</span>
                <div class="gov-stat-card__bar"><div class="gov-stat-card__fill" style="width:45%"></div></div>
              </div>
              <div class="gov-stat-card">
                <span class="gov-stat-card__label">AADHAAR UPDATE</span>
                <span class="gov-stat-card__value">Online</span>
                <div class="gov-stat-card__bar"><div class="gov-stat-card__fill gov-stat-card__fill--teal" style="width:90%"></div></div>
              </div>
              <div class="gov-stat-card">
                <span class="gov-stat-card__label">VOTER ID STATUS</span>
                <span class="gov-stat-card__value">5 Days</span>
                <div class="gov-stat-card__bar"><div class="gov-stat-card__fill gov-stat-card__fill--green" style="width:60%"></div></div>
              </div>
            </div>
            <div class="gov-tip">
              <div class="gov-tip__content">
                <span class="gov-tip__label">Aaj ka Tip</span>
                <p>Aadhaar me mobile number update karna hai? Online free hai, offline ₹50.</p>
              </div>
              <button class="gov-tip__btn" aria-label="Check now">↻</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="gov-filters">
      <div class="container">
        <div class="gov-filters__row">
          <span class="gov-chip gov-chip--active">All Documents ●</span>
          <span class="gov-chip">Identity</span>
          <span class="gov-chip">Address</span>
          <span class="gov-chip">Certificates</span>
          <span class="gov-chip">Vehicle</span>
          <span class="gov-chip">Tax</span>
        </div>
        <p class="gov-filters__trust">Trusted by 4.21L+ Indians this month · No ads, no clutter</p>
      </div>
    </section>

    <section class="gov-content">
      <div class="container gov-content__grid">
        <div class="gov-main">
          <div class="gov-main__header">
            <h2>Popular Documents · <span>${categoryCounts.documents || 6} results</span></h2>
            <span class="gov-main__sort">Sorted by helpful</span>
          </div>
          <div class="gov-card-grid">
            ${cardsHtml}
          </div>
        </div>
        <aside class="gov-sidebar">
          <div class="gov-sidebar-widget gov-trending">
            <h3 class="gov-sidebar-widget__heading">🔥 Trending This Week <span class="gov-live-badge">Live</span></h3>
            ${trendingHtml}
            <a href="#" class="gov-trending__more">View All Trending →</a>
          </div>
          <div class="gov-sidebar-widget gov-newsletter">
            <h3 class="gov-newsletter__heading">Document updates seedha apne inbox mein.</h3>
            <p class="gov-newsletter__desc">Har Monday, new documents + apply links. No spam, sirf kaam ki baat.</p>
            <form class="gov-newsletter__form">
              <input type="email" placeholder="Your email" aria-label="Email for document updates" />
              <button type="submit">Join</button>
            </form>
            <p class="gov-newsletter__note">12,400+ log jud chuke hain · Unsubscribe anytime</p>
          </div>
          <div class="gov-sidebar-widget gov-categories">
            <h3 class="gov-sidebar-widget__heading">CATEGORIES</h3>
            <div class="gov-categories__tags">${categoryTagsHtml}</div>
          </div>
          <div class="gov-sidebar-widget gov-help">
            <p>Need help? WhatsApp par 'Hi' bhejo, hum form bharna me help kar denge.</p>
            <a href="#" class="gov-help__link">Chat now →</a>
          </div>
        </aside>
      </div>
    </section>

    <section class="gov-banner-section">
      <div class="container">
        <div class="gov-banner">
          <div class="gov-banner__text">
            <span class="gov-banner__small">ABOUT SAMJHO INDIA</span>
            <h2>Samjho India is an independent information platform. We explain government schemes and services in simple language — so every Indian can understand and act.</h2>
          </div>
          <a href="/about/" class="gov-banner__btn">Learn More →</a>
        </div>
      </div>
    </section>

  </div>
  `;

  const canonical = site.domain + "/documents/";
  const structuredData = [
    breadcrumbSchema([
      { label: "Home", href: "/" },
      { label: "Documents", href: "/documents/" },
    ]),
    webPageSchema({
      name: hubTitle,
      description,
      url: canonical,
    }),
  ];

  write(
    "documents/index.html",
    renderPage({
      title: `${hubTitle} | Samjho India`,
      description,
      canonical,
      activeHref: "/documents/",
      bodyHtml: body,
      structuredData,
    })
  );
}

// ---------------------------------------------------------- BUSINESS PAGE (DEDICATED)
function buildBusinessPage() {
  const businessHub = site.hubs.find((h) => h.slug === "business");
  const description = businessHub ? businessHub.description : "Business registrations, licences, tax and compliance explained in simple Hindi and English.";

  const businessCards = [
    { icon: "🏪", iconBg: "#16a34a", badge: "POPULAR", badgeColor: "#16a34a", title: "Shop Act License & Udyam Registration", hindi: "शॉप एक्ट लाइसेंस और उद्यम रजिस्ट्रेशन", desc: "Chhote business ke liye Shop Act aur Udyam registration ka step-by-step process, documents aur MSME benefits.", tags: ["7 Guides", "4 min read"], href: "/guides/what-is-udyam/", source: "Official Source · Hindi Guide", updated: "2h ago" },
    { icon: "🧾", iconBg: "#2563eb", badge: "FAST TRACK", badgeColor: "#2563eb", title: "GST Registration & Filing", hindi: "जीएसटी रजिस्ट्रेशन और फाइलिंग", desc: "GST registration, returns aur filing ka process samjhein — small business ke liye simple Hindi me.", tags: ["7 Days", "4 min read"], href: "/guides/what-is-gst/", source: "Official Source · Hindi Guide", updated: "5h ago" },
    { icon: "🍴", iconBg: "#f97316", badge: "MOST SEARCHED", badgeColor: "#f97316", title: "FSSAI Food License", hindi: "एफएसएसएआई फूड लाइसेंस", desc: "Food business ke liye FSSAI licence kaise lein, documents kya lagenge aur renewal ka process.", tags: ["Food Business", "3 min read"], href: "/guides/fssai-license/", source: "Official Source · Hindi Guide", updated: "1d ago" },
    { icon: "📈", iconBg: "#0d9488", badge: "POPULAR", badgeColor: "#0d9488", title: "MSME Schemes & Subsidies", hindi: "एमएसएमई योजनाएं और सब्सिडी", desc: "MSME business ke liye schemes, subsidies aur government benefits ki useful jaankari.", tags: ["MSME Benefits", "5 min read"], href: "/guides/msme-schemes/", source: "Official Source · Hindi Guide", updated: "1d ago" },
    { icon: "💼", iconBg: "#2563eb", badge: "FAST TRACK", badgeColor: "#2563eb", title: "Business Loan — Apply & Eligibility", hindi: "बिजनेस लोन — अप्लाई और पात्रता", desc: "Business loan ke liye eligibility, documents, interest aur apply karne ka process samjhein.", tags: ["Loan Guide", "5 min read"], href: "/guides/business-loan/", source: "Official Source · Hindi Guide", updated: "2d ago" },
    { icon: "™️", iconBg: "#f97316", badge: "NEW UPDATE", badgeColor: "#f97316", title: "Trademark Registration", hindi: "ट्रेडमार्क रजिस्ट्रेशन", desc: "Brand name aur logo ko protect karne ke liye trademark registration ka simple step-by-step guide.", tags: ["Brand Protection", "4 min read"], href: "/guides/trademark/", source: "Official Source · Hindi Guide", updated: "3d ago" },
  ];

  const cardsHtml = businessCards.map((c) => `<article class="gov-card">
      <div class="gov-card__top"><span class="gov-card__icon" style="background:${c.iconBg}">${c.icon}</span><span class="gov-card__badge" style="background:${c.badgeColor}">${c.badge}</span></div>
      <h3 class="gov-card__title">${esc(c.title)}</h3><p class="gov-card__hindi">${esc(c.hindi)}</p><p class="gov-card__desc">${esc(c.desc)}</p>
      <div class="gov-card__tags">${c.tags.map((t) => `<span class="gov-card__tag">${esc(t)}</span>`).join("")}</div>
      <div class="gov-card__footer"><a href="${c.href}" class="gov-card__cta">Padhe → Read More</a><button class="gov-card__heart" aria-label="Save for later">♡</button></div>
      <div class="gov-card__meta"><span>✦ ${esc(c.source)}</span><span>Updated ${c.updated}</span></div>
    </article>`).join("");

  const trendingItems = [
    { title: "Udyam Registration Last Date", views: "1.5L views" },
    { title: "GST Rate Change 2026", views: "89K views" },
    { title: "FSSAI License Renewal", views: "76K views" },
    { title: "MSME Loan Yojana", views: "65K views" },
  ];
  const trendingHtml = trendingItems.map((t, i) => `<div class="gov-trending__item"><span class="gov-trending__num">${i + 1}</span><div class="gov-trending__text"><p>${esc(t.title)}</p><span>${t.views}</span></div></div>`).join("");
  const categoryTagsHtml = ["Registration", "Licence", "Tax", "Compliance", "MSME", "Loans"].map((t) => `<span class="gov-cat-tag">${esc(t)}</span>`).join("");

  const body = `
  <div class="gov-page">
    <div class="gov-utility-bar"><div class="container gov-utility-bar__inner"><span class="gov-utility-bar__left">AAJ KI YOJANA · UPDATED TODAY</span><span class="gov-utility-bar__right">हिंदी | <span class="gov-utility-bar__active">ENGLISH</span></span></div></div>
    <section class="gov-hero"><div class="container gov-hero__grid"><div class="gov-hero__left">
      <div class="gov-hero__pills"><span class="gov-pill gov-pill--teal">● LIVE · ${categoryCounts.business || 7} BUSINESS GUIDES</span><span class="gov-pill gov-pill--orange">HINDI + ENGLISH</span></div>
      <h1 class="gov-hero__title">Business <span class="gov-hero__title-grey">— Register, Comply, Grow</span></h1>
      <p class="gov-hero__hindi">व्यापार के लिए सरकारी registration, licence और compliance — सब आसान भाषा में</p>
      <p class="gov-hero__desc">Udyam, GST, Shop Act, licences — small business ke liye zaroori registrations. Step-by-step process simple Hindi me.</p>
    </div><div class="gov-hero__right"><div class="gov-quick-check"><h2 class="gov-quick-check__heading">Quick Check</h2><div class="gov-quick-check__stats">
      <div class="gov-stat-card"><span class="gov-stat-card__label">UDYAM REGISTRATION</span><span class="gov-stat-card__value">Free</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill" style="width:90%"></div></div></div>
      <div class="gov-stat-card"><span class="gov-stat-card__label">GST REGISTRATION</span><span class="gov-stat-card__value">7 Days</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill gov-stat-card__fill--teal" style="width:60%"></div></div></div>
      <div class="gov-stat-card"><span class="gov-stat-card__label">SHOP ACT</span><span class="gov-stat-card__value">State-wise</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill gov-stat-card__fill--green" style="width:75%"></div></div></div>
    </div><div class="gov-tip"><div class="gov-tip__content"><span class="gov-tip__label">Aaj ka Tip</span><p>Udyam registration free hai. MSME benefits ke liye zaroor karein.</p></div><button class="gov-tip__btn" aria-label="Check now">↻</button></div></div></div></div></section>
    <section class="gov-filters"><div class="container"><div class="gov-filters__row"><span class="gov-chip gov-chip--active">All Business ●</span><span class="gov-chip">Registration</span><span class="gov-chip">Licence</span><span class="gov-chip">Tax</span><span class="gov-chip">Compliance</span><span class="gov-chip">MSME</span></div><p class="gov-filters__trust">Trusted by 4.21L+ Indians this month · No ads, no clutter</p></div></section>
    <section class="gov-content"><div class="container gov-content__grid"><div class="gov-main"><div class="gov-main__header"><h2>Popular Business Guides · <span>${categoryCounts.business || 6} results</span></h2><span class="gov-main__sort">Sorted by helpful</span></div><div class="gov-card-grid">${cardsHtml}</div></div><aside class="gov-sidebar"><div class="gov-sidebar-widget gov-trending"><h3 class="gov-sidebar-widget__heading">🔥 Trending This Week <span class="gov-live-badge">Live</span></h3>${trendingHtml}<a href="#" class="gov-trending__more">View All Trending →</a></div><div class="gov-sidebar-widget gov-newsletter"><h3 class="gov-newsletter__heading">Business updates seedha apne inbox mein.</h3><p class="gov-newsletter__desc">Har Monday, new business guides + useful links. No spam, sirf kaam ki baat.</p><form class="gov-newsletter__form"><input type="email" placeholder="Your email" aria-label="Email for business updates" /><button type="submit">Join</button></form><p class="gov-newsletter__note">12,400+ log jud chuke hain · Unsubscribe anytime</p></div><div class="gov-sidebar-widget gov-categories"><h3 class="gov-sidebar-widget__heading">CATEGORIES</h3><div class="gov-categories__tags">${categoryTagsHtml}</div></div><div class="gov-sidebar-widget gov-help"><p>Need help? WhatsApp par 'Hi' bhejo, hum form bharna me help denge.</p><a href="#" class="gov-help__link">Chat now →</a></div></aside></div></section>
    <section class="gov-banner-section"><div class="container"><div class="gov-banner"><div class="gov-banner__text"><span class="gov-banner__small">ABOUT SAMJHO INDIA</span><h2>Samjho India is an independent information platform. We explain government schemes and services in simple language — so every Indian can understand and act.</h2></div><a href="/about/" class="gov-banner__btn">Learn More →</a></div></div></section>
  </div>`;

  const canonical = site.domain + "/business/";
  const structuredData = [
    breadcrumbSchema([
      { label: "Home", href: "/" },
      { label: "Business", href: "/business/" },
    ]),
    webPageSchema({
      name: "Business — Samjho",
      description,
      url: canonical,
    }),
  ];

  write(
    "business/index.html",
    renderPage({
      title: "Business Registration 2026 — Udyam, GST, FSSAI Guide",
      description,
      canonical,
      activeHref: "/business/",
      bodyHtml: body,
      structuredData,
    })
  );
}

// ---------------------------------------------------------- MONEY PAGE (DEDICATED)
function buildMoneyPage() {
  const moneyHub = site.hubs.find((h) => h.slug === "money");
  const description = moneyHub ? moneyHub.description : "Loans, credit scores, savings, compounding and everyday banking explained in simple Hindi and English.";

  const moneyCards = [
    { icon: "📊", iconBg: "#2563eb", badge: "POPULAR", badgeColor: "#2563eb", title: "What is EMI?", hindi: "ईएमआई (EMI) क्या है और कैलकुलेशन कैसे होती है", desc: "EMI (Equated Monthly Instalment) is the scheduled amount you pay toward a loan each month, made up of principal and interest.", tags: ["Loan Guide", "3 min read"], href: "/guides/what-is-emi/", source: "Official Source · Hindi Guide", updated: "1h ago" },
    { icon: "📈", iconBg: "#16a34a", badge: "POPULAR", badgeColor: "#16a34a", title: "What is a Credit Score?", hindi: "क्रेडिट स्कोर — CIBIL स्कोर की पूरी जानकारी", desc: "A credit score is a number calculated from your credit history, outstanding debt, and repayment behaviour.", tags: ["CIBIL Score", "4 min read"], href: "/guides/what-is-credit-score/", source: "Official Source · Hindi Guide", updated: "2h ago" },
    { icon: "🏦", iconBg: "#0d9488", badge: "BASIC", badgeColor: "#0d9488", title: "What is a Savings Account?", hindi: "सेविंग्स अकाउंट (बचत खाता) के फायदे और नियम", desc: "A savings account is a basic bank account designed for individuals to safely deposit money and earn interest.", tags: ["Banking", "3 min read"], href: "/guides/what-is-savings-account/", source: "Official Source · Hindi Guide", updated: "4h ago" },
    { icon: "💸", iconBg: "#f97316", badge: "FINANCIAL LIT", badgeColor: "#f97316", title: "What is Inflation?", hindi: "महंगाई (Inflation) क्या है और यह आपको कैसे प्रभावित करती है", desc: "Inflation is the general rise in prices of goods and services over time, which means each rupee buys a little less.", tags: ["Economics", "3 min read"], href: "/guides/what-is-inflation/", source: "Official Source · Hindi Guide", updated: "1d ago" },
    { icon: "🔄", iconBg: "#7c3aed", badge: "GROWTH", badgeColor: "#7c3aed", title: "What is Compound Interest?", hindi: "कंपाउंड इंटरेस्ट (चक्रवृद्धि ब्याज) का जादू", desc: "Compound interest is interest calculated not just on your original amount, but also on the interest already added.", tags: ["Interest Guide", "4 min read"], href: "/guides/what-is-compound-interest/", source: "Official Source · Hindi Guide", updated: "1d ago" },
    { icon: "💳", iconBg: "#e11d48", badge: "MOST SEARCHED", badgeColor: "#e11d48", title: "What is a Credit Card?", hindi: "क्रेडिट कार्ड — इस्तेमाल और चुकाने के नियम", desc: "A credit card lets you borrow money from a bank up to a set limit to make purchases now, which you then repay.", tags: ["Credit Card", "4 min read"], href: "/guides/what-is-credit-card/", source: "Official Source · Hindi Guide", updated: "2d ago" },
  ];

  const cardsHtml = moneyCards.map((c) => `<article class="gov-card">
      <div class="gov-card__top"><span class="gov-card__icon" style="background:${c.iconBg}">${c.icon}</span><span class="gov-card__badge" style="background:${c.badgeColor}">${c.badge}</span></div>
      <h3 class="gov-card__title">${esc(c.title)}</h3><p class="gov-card__hindi">${esc(c.hindi)}</p><p class="gov-card__desc">${esc(c.desc)}</p>
      <div class="gov-card__tags">${c.tags.map((t) => `<span class="gov-card__tag">${esc(t)}</span>`).join("")}</div>
      <div class="gov-card__footer"><a href="${c.href}" class="gov-card__cta">Padhe → Read More</a><button class="gov-card__heart" aria-label="Save for later">♡</button></div>
      <div class="gov-card__meta"><span>✦ ${esc(c.source)}</span><span>Updated ${c.updated}</span></div>
    </article>`).join("");

  const trendingItems = [
    { title: "CIBIL Score Improvement", views: "1.2L views" },
    { title: "Home Loan EMI Calculator", views: "95K views" },
    { title: "Mutual Fund Compounding", views: "80K views" },
    { title: "Tax Saving Section 80C", views: "72K views" },
  ];
  const trendingHtml = trendingItems.map((t, i) => `<div class="gov-trending__item"><span class="gov-trending__num">${i + 1}</span><div class="gov-trending__text"><p>${esc(t.title)}</p><span>${t.views}</span></div></div>`).join("");
  const categoryTagsHtml = ["Loans", "Savings", "Credit", "Tax", "Investment"].map((t) => `<span class="gov-cat-tag">${esc(t)}</span>`).join("");

  const body = `
  <div class="gov-page">
    <div class="gov-utility-bar"><div class="container gov-utility-bar__inner"><span class="gov-utility-bar__left">AAJ KI YOJANA · UPDATED TODAY</span><span class="gov-utility-bar__right">हिंदी | <span class="gov-utility-bar__active">ENGLISH</span></span></div></div>
    <section class="gov-hero"><div class="container gov-hero__grid"><div class="gov-hero__left">
      <div class="gov-hero__pills"><span class="gov-pill gov-pill--teal">● LIVE · ${categoryCounts.money || 10} MONEY GUIDES</span><span class="gov-pill gov-pill--orange">HINDI + ENGLISH</span></div>
      <h1 class="gov-hero__title">Money <span class="gov-hero__title-grey">— Understand, Calculate, Decide</span></h1>
      <p class="gov-hero__hindi">पैसा, बचत और loan — सब कुछ आसान भाषा में</p>
      <p class="gov-hero__desc">Loans, credit scores, savings accounts, inflation, compound interest — and key calculators to help you manage your money wisely. Simple Hindi me.</p>
    </div><div class="gov-hero__right"><div class="gov-quick-check"><h2 class="gov-quick-check__heading">Quick Check</h2><div class="gov-quick-check__stats">
      <div class="gov-stat-card"><span class="gov-stat-card__label">EMI CALCULATOR</span><span class="gov-stat-card__value">Interactive</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill" style="width:75%"></div></div></div>
      <div class="gov-stat-card"><span class="gov-stat-card__label">CREDIT SCORE</span><span class="gov-stat-card__value">750+ Goal</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill gov-stat-card__fill--teal" style="width:90%"></div></div></div>
      <div class="gov-stat-card"><span class="gov-stat-card__label">GST CALCULATOR</span><span class="gov-stat-card__value">18% Standard</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill gov-stat-card__fill--green" style="width:60%"></div></div></div>
    </div><div class="gov-tip"><div class="gov-tip__content"><span class="gov-tip__label">Aaj ka Tip</span><p>Credit score 750+ rakhein taaki loan interest rate sasta mile aur credit cards asani se approve ho sakein.</p></div><button class="gov-tip__btn" aria-label="Check now">↻</button></div></div></div></div></section>
    <section class="gov-filters"><div class="container"><div class="gov-filters__row"><span class="gov-chip gov-chip--active">All Money ●</span><span class="gov-chip">Loans</span><span class="gov-chip">Savings</span><span class="gov-chip">Credit</span><span class="gov-chip">Tax</span><span class="gov-chip">Investment</span></div><p class="gov-filters__trust">Trusted by 4.21L+ Indians this month · No ads, no clutter</p></div></section>
    <section class="gov-content"><div class="container gov-content__grid"><div class="gov-main"><div class="gov-main__header"><h2>Popular Money Guides · <span>${categoryCounts.money || 6} results</span></h2><span class="gov-main__sort">Sorted by helpful</span></div><div class="gov-card-grid">${cardsHtml}</div></div><aside class="gov-sidebar"><div class="gov-sidebar-widget gov-trending"><h3 class="gov-sidebar-widget__heading">🔥 Trending This Week <span class="gov-live-badge">Live</span></h3>${trendingHtml}<a href="#" class="gov-trending__more">View All Trending →</a></div><div class="gov-sidebar-widget gov-newsletter"><h3 class="gov-newsletter__heading">Money updates seedha apne inbox mein.</h3><p class="gov-newsletter__desc">Har Monday, new money guides + useful links. No spam, sirf kaam ki baat.</p><form class="gov-newsletter__form"><input type="email" placeholder="Your email" aria-label="Email for money updates" /><button type="submit">Join</button></form><p class="gov-newsletter__note">12,400+ log jud chuke hain · Unsubscribe anytime</p></div><div class="gov-sidebar-widget gov-categories"><h3 class="gov-sidebar-widget__heading">CATEGORIES</h3><div class="gov-categories__tags">${categoryTagsHtml}</div></div><div class="gov-sidebar-widget gov-help"><p>Need help? WhatsApp par 'Hi' bhejo, hum form bharna me help denge.</p><a href="#" class="gov-help__link">Chat now →</a></div></aside></div></section>
    <section class="gov-banner-section"><div class="container"><div class="gov-banner"><div class="gov-banner__text"><span class="gov-banner__small">ABOUT SAMJHO INDIA</span><h2>Samjho India is an independent information platform. We explain government schemes and services in simple language — so every Indian can understand and act.</h2></div><a href="/about/" class="gov-banner__btn">Learn More →</a></div></div></section>
  </div>`;

  const canonical = site.domain + "/money/";
  const structuredData = [
    breadcrumbSchema([
      { label: "Home", href: "/" },
      { label: "Money", href: "/money/" },
    ]),
    webPageSchema({
      name: "Money — Samjho",
      description,
      url: canonical,
    }),
  ];

  write(
    "money/index.html",
    renderPage({
      title: "Money Guide 2026 — EMI, Credit Score, Savings, Loans",
      description,
      canonical,
      activeHref: "/money/",
      bodyHtml: body,
      structuredData,
    })
  );
}

// ---------------------------------------------------------- EDUCATION PAGE (DEDICATED)
function buildEducationPage() {
  const eduHub = site.hubs.find((h) => h.slug === "education");
  const description = eduHub ? eduHub.description : "Understand academic scoring, education pathways, entrance exams and funding — with tools to help you decide.";

  const eduCards = [
    { icon: "📚", iconBg: "#2563eb", badge: "MOST SEARCHED", badgeColor: "#2563eb", title: "What is CGPA?", hindi: "सीजीपीए (CGPA) क्या है और प्रतिशत में कैसे बदलें", desc: "CGPA (Cumulative Grade Point Average) summarises a student's overall academic performance as a single average grade point, instead of percentage marks.", tags: ["Grading Guide", "4 min read"], href: "/guides/what-is-cgpa/", source: "Official Source · Hindi Guide", updated: "1h ago" },
    { icon: "🎓", iconBg: "#0d9488", badge: "POPULAR", badgeColor: "#0d9488", title: "CGPA Calculator", hindi: "सीजीपीए कैलकुलेटर — ग्रेड प्वाइंट से सीजीपीए", desc: "Convert your grades to CGPA or calculate CGPA from multiple semester grades — everything runs in your browser, private and free.", tags: ["Instant Result", "1 min read"], href: "/calculators/cgpa/", source: "Browser-Based Tool", updated: "3h ago" },
    { icon: "⏳", iconBg: "#16a34a", badge: "POPULAR", badgeColor: "#16a34a", title: "Age Calculator", hindi: "आयु कैलकुलेटर — जन्म तिथि से सही उम्र", desc: "Enter a date of birth and get the exact age in years, months and days — useful for exam forms and eligibility checks.", tags: ["Instant Result", "2 min read"], href: "/calculators/age/", source: "Browser-Based Tool", updated: "2h ago" },
    { icon: "🏆", iconBg: "#e11d48", badge: "NEW", badgeColor: "#e11d48", title: "Government Scholarships", hindi: "सरकारी स्कॉलरशिप — NSP पोर्टल से अप्लाई करें", desc: "Central and state scholarships, eligibility, how to apply on the National Scholarships Portal, documents and deadlines.", tags: ["Scholarships", "4 min read"], href: "/guides/scholarship-guide/", source: "Official Source · Hindi Guide", updated: "2h ago" },
    { icon: "📝", iconBg: "#f97316", badge: "NEW", badgeColor: "#f97316", title: "Entrance Exams After 12th", hindi: "जेईई, नीट, क्यूएट और सीएलएटी — एंट्रेंस एग्जाम", desc: "Major exams after Class 12 — JEE, NEET, CUET, CLAT — eligibility, dates, preparation and the application process.", tags: ["JEE · NEET · CUET", "5 min read"], href: "/guides/entrance-exams/", source: "Official Source · Hindi Guide", updated: "3h ago" },
    { icon: "🧭", iconBg: "#7c3aed", badge: "NEW", badgeColor: "#7c3aed", title: "Career Options After 12th", hindi: "12वीं के बाद करियर के विकल्प — हर स्ट्रीम", desc: "Science, commerce, arts, vocational and skill-based career paths after Class 12, with a simple way to compare options.", tags: ["Careers", "5 min read"], href: "/guides/career-options/", source: "Hindi Guide", updated: "4h ago" },
  ];

  const cardsHtml = eduCards.map((c) => `<article class="gov-card">
      <div class="gov-card__top"><span class="gov-card__icon" style="background:${c.iconBg}">${c.icon}</span><span class="gov-card__badge" style="background:${c.badgeColor}">${c.badge}</span></div>
      <h3 class="gov-card__title">${esc(c.title)}</h3><p class="gov-card__hindi">${esc(c.hindi)}</p><p class="gov-card__desc">${esc(c.desc)}</p>
      <div class="gov-card__tags">${c.tags.map((t) => `<span class="gov-card__tag">${esc(t)}</span>`).join("")}</div>
      <div class="gov-card__footer"><a href="${c.href}" class="gov-card__cta">Padhe → Read More</a><button class="gov-card__heart" aria-label="Save for later">♡</button></div>
      <div class="gov-card__meta"><span>✦ ${esc(c.source)}</span><span>Updated ${c.updated}</span></div>
    </article>`).join("");

  const trendingItems = [
    { title: "CGPA to Percentage", views: "1.2L views" },
    { title: "Scholarship Deadlines", views: "95K views" },
    { title: "Entrance Exam Dates", views: "80K views" },
    { title: "Career Options", views: "72K views" },
  ];
  const trendingHtml = trendingItems.map((t, i) => `<div class="gov-trending__item"><span class="gov-trending__num">${i + 1}</span><div class="gov-trending__text"><p>${esc(t.title)}</p><span>${t.views}</span></div></div>`).join("");
  const categoryTagsHtml = ["Scores", "Exams", "Scholarships", "Career", "Courses"].map((t) => `<span class="gov-cat-tag">${esc(t)}</span>`).join("");

  const body = `
  <div class="gov-page">
    <div class="gov-utility-bar"><div class="container gov-utility-bar__inner"><span class="gov-utility-bar__left">AAJ KI YOJANA · UPDATED TODAY</span><span class="gov-utility-bar__right">हिंदी | <span class="gov-utility-bar__active">ENGLISH</span></span></div></div>
    <section class="gov-hero"><div class="container gov-hero__grid"><div class="gov-hero__left">
      <div class="gov-hero__pills"><span class="gov-pill gov-pill--teal">● LIVE · ${categoryCounts.education || 6} EDUCATION GUIDES</span><span class="gov-pill gov-pill--orange">HINDI + ENGLISH</span></div>
      <h1 class="gov-hero__title">Education <span class="gov-hero__title-grey">— Learn, Score, Succeed</span></h1>
      <p class="gov-hero__hindi">पढ़ाई, exam और career — सब कुछ आसान भाषा में</p>
      <p class="gov-hero__desc">CGPA, exams, scholarships, career paths — students ke liye zaroori information. Har topic simple Hindi me.</p>
    </div><div class="gov-hero__right"><div class="gov-quick-check"><h2 class="gov-quick-check__heading">Quick Check</h2><div class="gov-quick-check__stats">
      <div class="gov-stat-card"><span class="gov-stat-card__label">CGPA CALCULATOR</span><span class="gov-stat-card__value">Instant</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill" style="width:75%"></div></div></div>
      <div class="gov-stat-card"><span class="gov-stat-card__label">AGE CALCULATOR</span><span class="gov-stat-card__value">Instant</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill gov-stat-card__fill--teal" style="width:85%"></div></div></div>
      <div class="gov-stat-card"><span class="gov-stat-card__label">PERCENTAGE</span><span class="gov-stat-card__value">Instant</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill gov-stat-card__fill--green" style="width:70%"></div></div></div>
    </div><div class="gov-tip"><div class="gov-tip__content"><span class="gov-tip__label">Aaj ka Tip</span><p>CGPA ko percentage me convert karne ke liye (CGPA - 0.75) × 10 formula use karein.</p></div><button class="gov-tip__btn" aria-label="Check now">↻</button></div></div></div></div></section>
    <section class="gov-filters"><div class="container"><div class="gov-filters__row"><span class="gov-chip gov-chip--active">All Education ●</span><span class="gov-chip">Exams</span><span class="gov-chip">Scholarships</span><span class="gov-chip">Career</span><span class="gov-chip">Scores</span><span class="gov-chip">Courses</span></div><p class="gov-filters__trust">Trusted by 4.21L+ Indians this month · No ads, no clutter</p></div></section>
    <section class="gov-content"><div class="container gov-content__grid"><div class="gov-main"><div class="gov-main__header"><h2>Popular Education Guides · <span>${categoryCounts.education || 6} results</span></h2><span class="gov-main__sort">Sorted by helpful</span></div><div class="gov-card-grid">${cardsHtml}</div></div><aside class="gov-sidebar"><div class="gov-sidebar-widget gov-trending"><h3 class="gov-sidebar-widget__heading">🔥 Trending This Week <span class="gov-live-badge">Live</span></h3>${trendingHtml}<a href="#" class="gov-trending__more">View All Trending →</a></div><div class="gov-sidebar-widget gov-newsletter"><h3 class="gov-newsletter__heading">Education updates seedha apne inbox mein.</h3><p class="gov-newsletter__desc">Har Monday, new education guides + useful links. No spam, sirf kaam ki baat.</p><form class="gov-newsletter__form"><input type="email" placeholder="Your email" aria-label="Email for education updates" /><button type="submit">Join</button></form><p class="gov-newsletter__note">12,400+ log jud chuke hain · Unsubscribe anytime</p></div><div class="gov-sidebar-widget gov-categories"><h3 class="gov-sidebar-widget__heading">CATEGORIES</h3><div class="gov-categories__tags">${categoryTagsHtml}</div></div><div class="gov-sidebar-widget gov-help"><p>Need help? WhatsApp par 'Hi' bhejo, hum form bharna me help denge.</p><a href="#" class="gov-help__link">Chat now →</a></div></aside></div></section>
    <section class="gov-banner-section"><div class="container"><div class="gov-banner"><div class="gov-banner__text"><span class="gov-banner__small">ABOUT SAMJHO INDIA</span><h2>Samjho India is an independent information platform. We explain government schemes and services in simple language — so every Indian can understand and act.</h2></div><a href="/about/" class="gov-banner__btn">Learn More →</a></div></div></section>
  </div>`;

  const canonical = site.domain + "/education/";
  const structuredData = [
    breadcrumbSchema([
      { label: "Home", href: "/" },
      { label: "Education", href: "/education/" },
    ]),
    webPageSchema({
      name: "Education — Samjho",
      description,
      url: canonical,
    }),
  ];

  write(
    "education/index.html",
    renderPage({
      title: "Education Guide 2026 — CGPA, Scholarships, Exams",
      description,
      canonical,
      activeHref: "/education/",
      bodyHtml: body,
      structuredData,
    })
  );
}

// -------------------------------------------------- GUIDES SUB-CATEGORY PAGES
// /guides/<category>/ pages using the canonical gov-* layout, matching the
// top-level category pages. Config-driven so all five pages share one template.
const GUIDE_SUBPAGES = [
  {
    slug: "money",
    label: "Money",
    h1: "Money Guides — Understand & Decide",
    hindi: "पैसा, बचत और loan — सब कुछ आसान भाषा में",
    description: "Plain-English money guides — GST, EMI, credit scores, inflation, compound interest, credit cards and savings accounts.",
    filters: ["All Money", "Loans", "Savings", "Credit", "Tax"],
    statCards: [
      { label: "EMI CALCULATOR", value: "Interactive", fill: 75, fillClass: "" },
      { label: "CREDIT SCORE", value: "750+ Goal", fill: 90, fillClass: " gov-stat-card__fill--teal" },
    ],
    tip: "Credit score 750+ rakhein taaki loan interest rate sasta mile aur credit cards asani se approve ho sakein.",
    newsletterHeading: "Money updates seedha apne inbox mein.",
    slugs: [
      "what-is-gst", "what-is-emi", "what-is-credit-score", "what-is-inflation",
      "what-is-compound-interest", "what-is-credit-card", "what-is-savings-account",
    ],
  },
  {
    slug: "documents",
    label: "Documents",
    h1: "Documents Guides — Apply & Update",
    hindi: "आधार, पैन, पासपोर्ट — सब कुछ आसान भाषा में",
    description: "Plain-English guides for the documents Indian life runs on — Aadhaar, PAN, voter ID, passport, driving licence and state certificates.",
    filters: ["All Documents", "Identity", "Certificates", "Employment", "Transport"],
    statCards: [
      { label: "PAN CARD", value: "Free e-PAN", fill: 70, fillClass: "" },
      { label: "AADHAAR UPDATE", value: "Free Online", fill: 85, fillClass: " gov-stat-card__fill--teal" },
    ],
    tip: "Aadhaar address update ghar baithe myAadhaar portal se karein — online request me documents upload karne ki zaroorat nahi padti.",
    newsletterHeading: "Document updates seedha apne inbox mein.",
    slugs: [
      "what-is-pan-card", "what-is-uan", "what-is-aadhaar", "ration-card", "e-shram-card",
      "voter-id", "passport", "driving-licence", "birth-certificate", "income-certificate",
      "caste-certificate", "marriage-certificate",
    ],
  },
  {
    slug: "education",
    label: "Education",
    h1: "Education Guides — Learn & Grow",
    hindi: "पढ़ाई, exam और career — सब कुछ आसान भाषा में",
    description: "Plain-English education guides — CGPA, scholarships, entrance exams and career options after 12th.",
    filters: ["All Education", "Exams", "Scholarships", "Career", "Scores"],
    statCards: [
      { label: "CGPA CALCULATOR", value: "Instant", fill: 75, fillClass: "" },
      { label: "PERCENTAGE", value: "Instant", fill: 90, fillClass: " gov-stat-card__fill--teal" },
    ],
    tip: "CGPA ko percentage me convert karne ke liye apne board/university ka official formula check karein — 9.5 multiplier har jagah valid nahi hai.",
    newsletterHeading: "Education updates seedha apne inbox mein.",
    slugs: ["what-is-cgpa", "scholarship-guide", "entrance-exams", "career-options"],
  },
  {
    slug: "government",
    label: "Government",
    h1: "Government Guides — Schemes & Benefits",
    hindi: "सरकारी योजना को आसान भाषा में",
    description: "Plain-English guides for government schemes and services — PM Kisan, Aadhaar, ration card and e-Shram, with official sources.",
    filters: ["All Government", "Schemes", "Services", "Benefits"],
    statCards: [
      { label: "PM KISAN", value: "₹6,000 / year", fill: 60, fillClass: "" },
      { label: "E-SHRAM CARD", value: "Free", fill: 80, fillClass: " gov-stat-card__fill--teal" },
    ],
    tip: "Kisi bhi sarkari yojana ke liye sirf official .gov.in / .nic.in portal par apply karein — agent ko paisa dene ki zaroorat nahi.",
    newsletterHeading: "Scheme updates seedha apne inbox mein.",
    slugs: ["pm-kisan-yojana", "what-is-aadhaar", "ration-card", "e-shram-card"],
  },
  {
    slug: "business",
    label: "Business",
    h1: "Business Guides — Register & Grow",
    hindi: "व्यापार के लिए registration और compliance",
    description: "Plain-English business guides — Udyam registration, FSSAI licence, MSME schemes, business loans, trademarks and GST.",
    filters: ["All Business", "Registration", "Tax & GST", "Loans", "Trademarks"],
    statCards: [
      { label: "UDYAM REGISTRATION", value: "Free Online", fill: 70, fillClass: "" },
      { label: "GST CALCULATOR", value: "18% Standard", fill: 90, fillClass: " gov-stat-card__fill--teal" },
    ],
    tip: "Udyam registration bilkul free hai — udyamregistration.gov.in par khud karein, agent fees dene ki zaroorat nahi.",
    newsletterHeading: "Business updates seedha apne inbox mein.",
    slugs: [
      "what-is-udyam", "udyam-registration", "fssai-license", "msme-schemes",
      "business-loan", "trademark",
    ],
  },
];

const GUIDE_CARD_ICONS = {
  "what-is-gst": { icon: "🧾", color: "#0d9488" },
  "what-is-emi": { icon: "📊", color: "#2563eb" },
  "what-is-credit-score": { icon: "📈", color: "#16a34a" },
  "what-is-inflation": { icon: "💸", color: "#f97316" },
  "what-is-compound-interest": { icon: "🔄", color: "#7c3aed" },
  "what-is-credit-card": { icon: "💳", color: "#e11d48" },
  "what-is-savings-account": { icon: "🏦", color: "#0d9488" },
  "what-is-pan-card": { icon: "🪪", color: "#2563eb" },
  "what-is-uan": { icon: "💼", color: "#0d9488" },
  "what-is-aadhaar": { icon: "🆔", color: "#f97316" },
  "ration-card": { icon: "🌾", color: "#16a34a" },
  "e-shram-card": { icon: "🛠️", color: "#7c3aed" },
  "voter-id": { icon: "🗳️", color: "#2563eb" },
  passport: { icon: "🛂", color: "#0d9488" },
  "driving-licence": { icon: "🚗", color: "#f97316" },
  "birth-certificate": { icon: "👶", color: "#16a34a" },
  "income-certificate": { icon: "🧾", color: "#7c3aed" },
  "caste-certificate": { icon: "📜", color: "#e11d48" },
  "marriage-certificate": { icon: "💍", color: "#f97316" },
  "what-is-cgpa": { icon: "🎓", color: "#2563eb" },
  "scholarship-guide": { icon: "🏆", color: "#16a34a" },
  "entrance-exams": { icon: "📝", color: "#f97316" },
  "career-options": { icon: "🚀", color: "#7c3aed" },
  "pm-kisan-yojana": { icon: "🌱", color: "#16a34a" },
  "what-is-udyam": { icon: "🏢", color: "#0d9488" },
  "udyam-registration": { icon: "🏢", color: "#0d9488" },
  "fssai-license": { icon: "🍽️", color: "#16a34a" },
  "msme-schemes": { icon: "🏭", color: "#2563eb" },
  "business-loan": { icon: "🏦", color: "#7c3aed" },
  trademark: { icon: "™️", color: "#e11d48" },
};
function buildGuidesSubPage(cfg) {
  const pageHref = `/guides/${cfg.slug}/`;
  const items = cfg.slugs.map((slug) => articles.find((a) => a.slug === slug)).filter(Boolean);
  const count = items.length;

  const cardsHtml = items
    .map((a) => {
      const icon = GUIDE_CARD_ICONS[a.slug] || { icon: "📘", color: "#2563eb" };
      return `<article class="gov-card">
      <div class="gov-card__top"><span class="gov-card__icon" style="background:${icon.color}">${icon.icon}</span><span class="gov-card__badge" style="background:#0d9488">GUIDE</span></div>
      <h3 class="gov-card__title">${esc(a.title)}</h3>
      <p class="gov-card__desc">${esc(a.shortAnswer)}</p>
      <div class="gov-card__tags"><span class="gov-card__tag">${esc(readingTime(a))}</span><span class="gov-card__tag">Simple Hindi + English</span></div>
      <div class="gov-card__footer"><a href="${guideUrl(a.slug)}" class="gov-card__cta">Padhe → Read More</a><button class="gov-card__heart" aria-label="Save for later">♡</button></div>
      <div class="gov-card__meta"><span>✦ Samjho Original Guide</span><span>Free to read</span></div>
    </article>`;
    })
    .join("");

  const statCardsHtml = [
    `<div class="gov-stat-card"><span class="gov-stat-card__label">TOTAL GUIDES</span><span class="gov-stat-card__value">${count}</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill" style="width:100%"></div></div></div>`,
    ...cfg.statCards.map(
      (s) => `<div class="gov-stat-card"><span class="gov-stat-card__label">${esc(s.label)}</span><span class="gov-stat-card__value">${esc(s.value)}</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill${s.fillClass}" style="width:${s.fill}%"></div></div></div>`
    ),
  ].join("");

  const trendingHtml = items
    .slice(0, 4)
    .map(
      (a, i) => `<div class="gov-trending__item"><span class="gov-trending__num">${i + 1}</span><div class="gov-trending__text"><p><a href="${guideUrl(a.slug)}">${esc(a.title)}</a></p><span>${esc(readingTime(a))}</span></div></div>`
    )
    .join("");
  const filterTagsHtml = cfg.filters.map((t) => `<span class="gov-cat-tag">${esc(t)}</span>`).join("");
  const quickLinksHtml = GUIDE_SUBPAGES.map(
    (p) => `<li><a href="/guides/${p.slug}/"${p.slug === cfg.slug ? ' aria-current="page"' : ""}>${esc(p.label)} Guides</a></li>`
  ).join("");
  const filterChipsHtml = cfg.filters
    .map((t, i) => `<span class="gov-chip${i === 0 ? " gov-chip--active" : ""}">${esc(t)}${i === 0 ? " ●" : ""}</span>`)
    .join("");

  const body = `
  <div class="gov-page">
    <div class="gov-utility-bar"><div class="container gov-utility-bar__inner"><span class="gov-utility-bar__left">AAJ KI YOJANA · UPDATED TODAY</span><span class="gov-utility-bar__right">हिंदी | <span class="gov-utility-bar__active">ENGLISH</span></span></div></div>
    <section class="gov-hero"><div class="container gov-hero__grid"><div class="gov-hero__left">
      <div class="gov-hero__pills"><span class="gov-pill gov-pill--teal">● LIVE · ${count} ${esc(cfg.label.toUpperCase())} GUIDES</span><span class="gov-pill gov-pill--orange">HINDI + ENGLISH</span></div>
      <h1 class="gov-hero__title">${esc(cfg.h1)}</h1>
      <p class="gov-hero__hindi">${esc(cfg.hindi)}</p>
      <p class="gov-hero__desc">${esc(cfg.description)}</p>
    </div><div class="gov-hero__right"><div class="gov-quick-check"><h2 class="gov-quick-check__heading">Quick Check</h2><div class="gov-quick-check__stats">${statCardsHtml}</div><div class="gov-tip"><div class="gov-tip__content"><span class="gov-tip__label">Aaj ka Tip</span><p>${esc(cfg.tip)}</p></div><button class="gov-tip__btn" aria-label="Check now">↻</button></div></div></div></div></section>
    <section class="gov-filters"><div class="container"><div class="gov-filters__row">${filterChipsHtml}</div><p class="gov-filters__trust">Trusted by 4.21L+ Indians this month · No ads, no clutter</p></div></section>
    <section class="gov-content"><div class="container gov-content__grid"><div class="gov-main"><div class="gov-main__header"><h2>All ${esc(cfg.label)} Guides · <span>${count} results</span></h2><span class="gov-main__sort">Sorted by helpful</span></div><div class="gov-card-grid">${cardsHtml}</div></div><aside class="gov-sidebar"><div class="gov-sidebar-widget"><h3 class="gov-sidebar-widget__heading">QUICK LINKS</h3><ul class="static-toc">${quickLinksHtml}</ul></div><div class="gov-sidebar-widget gov-trending"><h3 class="gov-sidebar-widget__heading">🔥 Popular In This Category <span class="gov-live-badge">Live</span></h3>${trendingHtml}<a href="/guides/" class="gov-trending__more">View All Guides →</a></div><div class="gov-sidebar-widget gov-newsletter"><h3 class="gov-newsletter__heading">${esc(cfg.newsletterHeading)}</h3><p class="gov-newsletter__desc">Har Monday, new guides + useful links. No spam, sirf kaam ki baat.</p><form class="gov-newsletter__form"><input type="email" placeholder="Your email" aria-label="Email for updates" /><button type="submit">Join</button></form><p class="gov-newsletter__note">12,400+ log jud chuke hain · Unsubscribe anytime</p></div><div class="gov-sidebar-widget gov-categories"><h3 class="gov-sidebar-widget__heading">CATEGORIES</h3><div class="gov-categories__tags">${filterTagsHtml}</div></div><div class="gov-sidebar-widget gov-help"><p>Need help? WhatsApp par 'Hi' bhejo, hum form bharna me help denge.</p><a href="#" class="gov-help__link">Chat now →</a></div></aside></div></section>
    <section class="gov-banner-section"><div class="container"><div class="gov-banner"><div class="gov-banner__text"><span class="gov-banner__small">ABOUT SAMJHO INDIA</span><h2>Samjho India is an independent information platform. We explain government schemes and services in simple language — so every Indian can understand and act.</h2></div><a href="/about/" class="gov-banner__btn">Learn More →</a></div></div></section>
  </div>`;

  const canonical = site.domain + pageHref;
  const titleKeywords = {
    money: "GST, EMI, Credit Score",
    documents: "PAN, Aadhaar, Passport",
    education: "CGPA, Scholarships, Exams",
    government: "Schemes, Apply Online",
    business: "Registration, MSME, GST",
  };
  const kw = titleKeywords[cfg.slug] || cfg.label;

  const structuredData = [
    breadcrumbSchema([
      { label: "Home", href: "/" },
      { label: "Guides", href: "/guides/" },
      { label: `${cfg.label} Guides`, href: pageHref },
    ]),
    webPageSchema({
      name: `${cfg.label} Guides 2026 — ${kw}`,
      description: cfg.description,
      url: canonical,
    }),
  ];

  write(
    `guides/${cfg.slug}/index.html`,
    renderPage({
      title: `${cfg.label} Guides 2026 — ${kw}`,
      description: cfg.description,
      canonical,
      activeHref: "/guides/",
      bodyHtml: body,
      structuredData,
    })
  );
}

// ------------------------------------------------------------------ GUIDES INDEX
function buildGuidesIndex() {
  const totalGuides = articles.length;
  const chips = GUIDE_SUBPAGES.map(
    (s) => `<a class="gov-chip" href="/guides/${s.slug}/">${esc(s.label)}</a>`
  ).join("");

  // Grouped category sections with "View all" links.
  const sections = GUIDE_SUBPAGES.map((c) => {
    const items = c.slugs.map((slug) => articles.find((a) => a.slug === slug)).filter(Boolean);
    if (items.length === 0) return "";
    const cards = items
      .map((a) => card({ href: guideUrl(a.slug), title: a.title, desc: a.shortAnswer }))
      .join("");
    return `<div class="guides-index-section" id="${c.slug}">
      <div class="guides-index-section__head">
        <h2>${esc(c.label)} Guides</h2>
        <a href="/guides/${c.slug}/" class="guides-index-section__more">View all ${esc(c.label)} guides →</a>
      </div>
      <p class="guides-index-section__desc">${esc(c.description)}</p>
      <div class="card-grid card-grid--3">${cards}</div>
    </div>`;
  }).join("");

  const popularItems = [
    { slug: "pm-kisan-yojana", views: "1.2L views", live: true },
    { slug: "what-is-aadhaar", views: "88k views", live: true },
    { slug: "what-is-credit-score", views: "7.6k views", live: false },
    { slug: "what-is-credit-score", views: "5.4k views", live: true },
    { slug: "what-is-gst", views: "3.2k views", live: false },
  ].map((item) => {
    const a = articles.find((x) => x.slug === item.slug);
    return a ? { ...item, title: a.title, slug: a.slug } : null;
  }).filter(Boolean);
  const popularHtml = `<ol class="popular-guides-sidebar">${popularItems
    .map((item) => `<li><div><a href="${guideUrl(item.slug)}">${esc(item.title)}</a><div class="popular-guides-sidebar__meta"><span>${esc(item.views)}</span>${item.live ? '<span class="popular-guides-sidebar__live">LIVE</span>' : ''}</div></div></li>`)
    .join("")}</ol>`;
  
  const categoryTagsHtml = GUIDE_SUBPAGES.map(
    (s) => `<span class="gov-cat-tag">${esc(s.label)}</span>`
  ).join("");

  const sidebarCatsHtml = `<div class="sidebar-categories-list">${GUIDE_SUBPAGES.map(
    (s) => `<a href="/guides/${s.slug}/">${esc(s.label)} <span class="cat-count">${(categoryCounts[s.slug.toLowerCase()] || s.slugs.length)}</span></a>`
  ).join("")}</div>`;

  const body = `
  <div class="gov-page">
    <div class="gov-utility-bar"><div class="container gov-utility-bar__inner"><span class="gov-utility-bar__left">AAJ KI YOJANA · UPDATED TODAY</span><span class="gov-utility-bar__right">हिंदी | <span class="gov-utility-bar__active">ENGLISH</span></span></div></div>
    <section class="gov-hero"><div class="container gov-hero__grid"><div class="gov-hero__left">
      <div class="gov-hero__pills"><span class="gov-pill gov-pill--teal">● LIVE · ${totalGuides}+ GUIDES</span><span class="gov-pill gov-pill--orange">HINDI + ENGLISH</span></div>
      <h1 class="gov-hero__title">All Guides <span class="gov-hero__title-grey">— Everything Explained</span></h1>
      <p class="gov-hero__hindi">हर विषय, आसान भाषा में</p>
      <p class="gov-hero__desc">Plain-English explanations for Indian students, employees and families.</p>
    </div><div class="gov-hero__right"><div class="gov-quick-check"><h2 class="gov-quick-check__heading">Quick Check</h2><div class="gov-quick-check__stats">
      <div class="gov-stat-card"><span class="gov-stat-card__label">${totalGuides}+ GUIDES</span><span class="gov-stat-card__value">Hindi + English</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill" style="width:100%"></div></div></div>
      <div class="gov-stat-card"><span class="gov-stat-card__label">5 CATEGORIES</span><span class="gov-stat-card__value">Gov · Docs · Business · Money · Edu</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill gov-stat-card__fill--teal" style="width:90%"></div></div></div>
      <div class="gov-stat-card"><span class="gov-stat-card__label">OFFICIAL SOURCES</span><span class="gov-stat-card__value">Every guide cited</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill gov-stat-card__fill--green" style="width:80%"></div></div></div>
    </div><div class="gov-tip"><div class="gov-tip__content"><span class="gov-tip__label">Aaj ka Tip</span><p>Har guide mein step-by-step process, required documents, fees, FAQ aur official portal links hain.</p></div><button class="gov-tip__btn" aria-label="Check now">↻</button></div></div></div></div></section>
    <section class="gov-filters"><div class="container"><div class="gov-filters__row"><span class="gov-chip gov-chip--active">All Guides ●</span>${chips}</div><p class="gov-filters__trust">Trusted by 4.21L+ Indians this month · No ads, no clutter</p></div></section>
    <section class="gov-content"><div class="container gov-content__grid"><div class="gov-main">${sections}</div><aside class="gov-sidebar">
      <div class="sidebar-quick-check"><div class="sidebar-quick-check__title"><span>Quick Check</span><span class="sidebar-quick-check__badge">LIVE DATA</span></div><div class="sidebar-quick-check__grid"><div class="sidebar-stat"><span class="sidebar-stat__icon">&#x1F310;</span><span class="sidebar-stat__label">Hindi + English</span><span class="sidebar-stat__value">100%</span><div class="sidebar-stat__bar"><div class="sidebar-stat__fill" style="width:100%"></div></div></div><div class="sidebar-stat"><span class="sidebar-stat__icon">&#x1F4CB;</span><span class="sidebar-stat__label">Gov Docs</span><span class="sidebar-stat__value">6 Cats</span><div class="sidebar-stat__bar"><div class="sidebar-stat__fill sidebar-stat__fill--orange" style="width:60%"></div></div></div><div class="sidebar-stat"><span class="sidebar-stat__icon">&#x2705;</span><span class="sidebar-stat__label">Cited Sources</span><span class="sidebar-stat__value">100%</span><div class="sidebar-stat__bar"><div class="sidebar-stat__fill sidebar-stat__fill--green" style="width:100%"></div></div></div></div></div>
      <div class="sidebar-pro-tip"><div class="sidebar-pro-tip__label">Pro tip for today</div><p class="sidebar-pro-tip__text">Most guides take &lt; 4 min to read. Start with Popular Guides on the right &mdash; they are updated every morning at 6 AM IST.</p></div>
      <div class="gov-sidebar-widget gov-trending"><h3 class="gov-sidebar-widget__heading">Popular Guides <span class="gov-live-badge">Live</span></h3>${popularHtml}</div>
      <div class="sidebar-join"><h3 class="sidebar-join__title">JOIN 42K+ READERS</h3><p class="sidebar-join__desc">Get one yojana update every morning at 6 AM. No spam, unsubscribe anytime.</p><form class="sidebar-join__form"><input type="email" class="sidebar-join__input" placeholder="you@email.com" aria-label="Email for updates" /><button type="submit" class="sidebar-join__btn">Join</button></form><p class="sidebar-join__note">Trusted by UPSC aspirants &amp; small business owners</p></div>
      <div class="gov-sidebar-widget gov-categories"><h3 class="gov-sidebar-widget__heading">CATEGORIES</h3>${sidebarCatsHtml}</div>
      <div class="sidebar-help"><div class="sidebar-help__icon">&#x1F4AC;</div><h3 class="sidebar-help__title">NEED HELP?</h3><p class="sidebar-help__desc">Confused about any yojana or document? Message us on WhatsApp &mdash; reply in 2 hours.</p><a href="https://wa.me/919999999999?text=Hi%20Samjho%20India" class="sidebar-help__btn" target="_blank" rel="noopener">&#x1F4AC; Chat on WhatsApp</a><p class="sidebar-help__note">No bots &middot; Real humans &middot; Hindi + English</p></div>
    </aside></div></section>
    <section class="gov-banner-section"><div class="container"><div class="gov-banner"><div class="gov-banner__text"><span class="gov-banner__small">ABOUT SAMJHO INDIA</span><h2>Samjho India is an independent information platform. We explain government schemes and services in simple language — so every Indian can understand and act.</h2></div><a href="/about/" class="gov-banner__btn">Learn More →</a></div></div></section>
  </div>`;

  write(
    "guides/index.html",
    renderPage({
      title: "All Guides 2026 — Government, Money, Documents",
      description: "Read plain-English Samjho guides about GST, credit scores, CGPA, documents, loans and everyday decisions. Updated for 2026.",
      canonical: site.domain + "/guides/",
      activeHref: "/guides/",
      darkHeader: true,
      bodyHtml: body,
      structuredData: [
        webPageSchema({
          name: "All Guides 2026 — Government, Money, Documents",
          description: "Read plain-English Samjho guides about GST, credit scores, CGPA, documents, loans and everyday decisions.",
          url: site.domain + "/guides/",
        }),
      ],
    })
  );
}

// ------------------------------------------------------------------ GUIDE ARTICLE
function buildGuideArticle(a) {
  const faqHtml = a.faq
    .map(
      (f, i) => `<details class="faq-item"${i === 0 ? " open" : ""}>
      <summary>${esc(f.q)}</summary>
      <p>${esc(f.a)}</p>
    </details>`
    )
    .join("");

  const toolsHtml =
    a.relatedTools.length > 0
      ? `<div>${a.relatedTools
          .map((t) => `<div class="related-tools-box"><div class="related-tools-box__icon">&#x1F4CA;</div><div><p class="related-tools-box__label">RELATED TOOLS</p><p class="related-tools-box__title"><a href="${t.href}">${esc(t.title)}</a></p><p class="related-tools-box__desc">${esc(t.desc || 'Check if you qualify with our calculator.')}</p></div></div>`)
          .join("")}</div>`
      : `<p class="empty-note">There isn't a dedicated calculator for this topic yet — <a href="/calculators/">browse all calculators</a> in the meantime.</p>`;

  const guidesHtml = `<div class="related-guides-grid">${a.relatedGuides
    .map((g) => `<a class="related-guide-card" href="${g.href}">
      <span class="related-guide-card__tag">Guide</span>
      <h3 class="related-guide-card__title">${esc(g.title)}</h3>
      <span class="related-guide-card__link">Read the simple explanation.</span>
    </a>`)
    .join("")}</div>`;

  const referencesHtml = a.officialReferences
    ? `<section>
      <h2>${a.slug === "what-is-uan" ? "Official EPFO References" : "Official references"}</h2>
      <ul class="official-refs">${a.officialReferences
        .map((r) => `<li><a href="${r.href}" target="_blank" rel="noopener">${esc(r.label)}</a> <span class="ref-desc">${esc(r.description)}</span></li>`)
        .join("")}</ul>
    </section>`
    : "";
  const rateNoticeHtml = a.rateNotice
    ? `<p class="article-notice" role="note"><strong>Rules and rates can change:</strong> ${esc(a.rateNotice)}</p>`
    : "";

  // --- Reading time estimate ---
  const wordsPerMin = 200;
  const wordCount = (a.simpleExplanation || []).join(' ').split(/\s+/).length + (a.shortAnswer || '').split(/\s+/).length + (a.whyMatters || '').split(/\s+/).length + (a.example || '').split(/\s+/).length;
  const readMin = Math.max(3, Math.round(wordCount / wordsPerMin));

  // --- "In simple words" box ---
  const simpleWordsHtml = a.shortAnswer
    ? `<div class="simple-words-box">
        <span class="simple-words-box__label">In simple words:</span>
        <p class="simple-words-box__text">${esc(a.shortAnswer)}</p>
      </div>`
    : "";

  // --- Share buttons ---
  const shareUrl = site.domain + guideUrl(a.slug);
  const shareText = encodeURIComponent(a.title || '');
  const shareButtonsHtml = `
    <div class="share-buttons">
      <span class="share-buttons__label">Share:</span>
      <a class="share-btn" href="https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${shareText}" target="_blank" rel="noopener" aria-label="Share on Twitter" title="Share on Twitter">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      </a>
      <a class="share-btn" href="https://api.whatsapp.com/send?text=${shareText}%20${encodeURIComponent(shareUrl)}" target="_blank" rel="noopener" aria-label="Share on WhatsApp" title="Share on WhatsApp">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      </a>
      <button class="share-btn" onclick="navigator.clipboard.writeText('${shareUrl}').then(()=>{this.innerHTML='<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2&quot;><polyline points=&quot;20 6 9 17 4 12&quot;/></svg>';setTimeout(()=>this.innerHTML='&#x1f517;',1500)})" aria-label="Copy link" title="Copy link">
        &#x1f517;
      </button>
    </div>`;

  const body = `
  <div class="article-head container">
    ${breadcrumb([
      { label: "Home", href: "/" },
      { label: "Guides", href: "/guides/" },
      { label: a.title, href: guideUrl(a.slug) },
    ])}
    <span class="article-category-badge">
      <span class="article-category-badge__dot"></span>
      ${esc((a.category || 'Guide').toUpperCase())} &middot; ${esc(categoryLabel(a.category))} GUIDE
    </span>
    <h1>${esc(a.title)}</h1>
    <div class="article-meta-bar">
      <span class="article-meta-bar__date">&bull; Last updated: ${a.lastUpdated}</span>
      <span class="article-meta-bar__sep">&middot;</span>
      <span class="article-meta-bar__read">${readMin} min read</span>
      ${shareButtonsHtml}
    </div>
    ${simpleWordsHtml}
    <div class="author-card">
      <div class="author-card__avatar">S</div>
      <div>
        <div class="author-card__name">${esc(site.author.name)} <span class="author-card__verified">&#x2713;</span></div>
        <p class="author-card__bio">Trusted and policy experts simplifying MSME, tax, and compliance for India. Verified by Chartered Accountants.</p>
      </div>
    </div>
  </div>

  <div class="article-body container">
    <section>
      <h2>Simple explanation</h2>
      ${a.simpleExplanation.map((p) => `<p>${inlineLinked(p, a.slug)}</p>`).join("")}
    </section>

    <section>
      <h2>Why does it matter?</h2>
      <p>${inlineLinked(a.whyMatters, a.slug)}</p>
    </section>

    <section>
      <h2>Example</h2>
      <div class="example-box">
        <span class="card-eyebrow">In numbers</span>
        <p>${inlineLinked(a.example, a.slug)}</p>
      </div>
      ${rateNoticeHtml}
    </section>

    ${a.scoreBands ? `<section>
      <h2>What do credit score ranges mean?</h2>
      <p>These bands are a simple guide, not universal approval rules. Lender cut-offs and scoring models can differ, and some CICs may display a different range or result.</p>
      <div class="table-wrap"><table class="score-table">
        <thead><tr><th scope="col">Score or result</th><th scope="col">Plain-English meaning</th></tr></thead>
        <tbody>${a.scoreBands.map((row) => `<tr><th scope="row">${esc(row.band)}</th><td>${esc(row.meaning)}</td></tr>`).join("")}</tbody>
      </table></div>
    </section>` : ""}

    ${a.directSections ? a.directSections.map((section) => `<section>
      <h2>${esc(section.heading)}</h2>
      ${section.table ? `<div class="table-wrap"><table class="score-table">
        <thead><tr>${section.table.head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${section.table.rows.map((row) => `<tr>${row.map((cell, ci) => (ci === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`)).join("")}</tr>`).join("")}</tbody>
      </table></div>` : ""}
      ${section.paragraphs.map((p) => `<p>${inlineLinked(p, a.slug)}</p>`).join("")}
    </section>`).join("") : ""}

    ${a.extraSections ? a.extraSections.map((section) => `<section>
      <h2>${esc(section.heading)}</h2>
      ${section.table ? `<div class="table-wrap"><table class="score-table">
        <thead><tr>${section.table.head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${section.table.rows.map((row) => `<tr>${row.map((cell, ci) => (ci === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`)).join("")}</tr>`).join("")}</tbody>
      </table></div>` : ""}
      ${section.paragraphs.map((p) => `<p>${inlineLinked(p, a.slug)}</p>`).join("")}
    </section>`).join("") : ""}

    ${a.howTo ? `<section>
      <h2>${esc(a.howTo.name)}</h2>
      <p>${esc(a.howTo.description)}</p>
      <ol class="steps">${a.howTo.steps.map((p) => `<li><div><p>${esc(p)}</p></div></li>`).join("")}</ol>
    </section>` : ""}

    ${adSlot("incontent", "Advertisement space")}

    <section>
      <h2>Important things to know</h2>
      <ul class="point-list point-list--check">${a.importantPoints.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    </section>

    <section>
      <h2>Common mistakes</h2>
      <ul class="mistake-list--x">${a.commonMistakes.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    </section>

    ${a.correctionSteps ? `<section>
      <h2>How do I correct an error in my credit report?</h2>
      <ol class="steps">${a.correctionSteps.map((p) => `<li><div><p>${esc(p)}</p></div></li>`).join("")}</ol>
    </section>` : ""}

    <section>
      <h2>Frequently asked questions</h2>
      ${faqHtml}
    </section>

    <section>
      <h2>Related tools</h2>
      ${toolsHtml}
    </section>

    <section>
      <h2>Related guides</h2>
      ${guidesHtml}
    </section>
    ${referencesHtml}
  </div>
  `;

  const canonical = site.domain + guideUrl(a.slug);

  // ---- Guide two-column layout: transform the single-column body into
  // article + sticky right sidebar (Quick Summary, TOC, tools, sources, ad).
  const bodyOpen = '<div class="article-body container">';
  const start = body.indexOf(bodyOpen);
  const end = body.lastIndexOf("</div>");
  const inner = body.slice(start + bodyOpen.length, end);
  const head = body.slice(0, start);
  const headings = [];
  let secIdx = 0;
  const innerWithIds = inner.replace(/<h2>([\s\S]*?)<\/h2>/g, (m, txt) => {
    const id = "sec-" + ++secIdx;
    headings.push({ id, text: txt.replace(/<[^>]+>/g, "").trim() });
    return `<h2 id="${id}">${txt}</h2>`;
  });

  const quickSummaryHtml = a.quickSummary && a.quickSummary.length
    ? `<div class="guide-sidebar__widget"><h3>QUICK SUMMARY</h3><ul class="guide-sidebar__facts">${a.quickSummary
        .map((f) => `<li>${esc(f)}</li>`)
        .join("")}</ul></div>`
    : "";
  const tocHtml = headings.length
    ? `<nav class="guide-sidebar__widget" aria-label="On this page"><h3>On this page</h3><div class="guide-sidebar__toc">${headings
        .map((h) => `<a href="#${h.id}">${esc(h.text)}</a>`)
        .join("")}</div></nav>`
    : "";
  const sideToolsHtml = a.relatedTools.length
    ? `<div class="guide-sidebar__widget"><h3>Related Tools</h3><ul class="guide-sidebar__links">${a.relatedTools
        .map((t) => `<li><a href="${t.href}">${esc(t.title)}</a></li>`)
        .join("")}</ul></div>`
    : "";
  const sideRefsHtml = a.officialReferences && a.officialReferences.length
    ? `<div class="guide-sidebar__widget"><h3>Official Sources</h3><ul class="guide-sidebar__links guide-sidebar__links--gov">${a.officialReferences
        .map((r) => `<li><a href="${r.href}" target="_blank" rel="noopener">${esc(r.label)}</a></li>`)
        .join("")}</ul></div>`
    : "";
  // Related articles: other guides in the same category
  const relatedArticles = articles
    .filter((ra) => ra.category === a.category && ra.slug !== a.slug)
    .slice(0, 5);
  const sideRelatedHtml = relatedArticles.length
    ? `<div class="guide-sidebar__widget"><h3>RELATED ARTICLES</h3><ul class="guide-sidebar__links">${relatedArticles
        .map((ra) => `<li><a href="${guideUrl(ra.slug)}">${esc(ra.title)}</a></li>`)
        .join("")}</ul></div>`
    : "";
  // CTA box for sidebar
  const sideCtaHtml = `<div class="sidebar-cta">
    <h3>Get your ${esc(categoryLabel(a.category))} help in 5 minutes</h3>
    <p>Use our step-by-step checklist and official link. No agent needed.</p>
    <a href="${guideUrl(a.slug)}" class="sidebar-cta__btn">Open checklist &rarr;</a>
    <p class="sidebar-cta__note">Official &middot; Free &middot; Verified</p>
  </div>`;
  const sidebarHtml = `<aside class="guide-sidebar">${sideRelatedHtml}${quickSummaryHtml}${sideCtaHtml}${tocHtml}${sideToolsHtml}${sideRefsHtml}<div class="guide-sidebar__widget guide-sidebar__ad">${adSlot("sidebar", "Advertisement")}</div></aside>`;

  const layoutBody = `${head}<div class="container"><div class="guide-layout"><div class="article-body">${innerWithIds}</div>${sidebarHtml}</div></div>
  <div class="article-disclaimer">SAMJHO INDIA &middot; EXPLAINED SIMPLY</div>
  `;

  const structuredData = [
    breadcrumbSchema([
      { label: "Home", href: "/" },
      { label: "Guides", href: "/guides/" },
      { label: a.title, href: guideUrl(a.slug) },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: a.title,
      description: compactDescription(a.shortAnswer),
      url: canonical,
      image: a.hero_image || site.socialImage || undefined,
      articleSection: categoryLabel(a.category),
      author: {
        "@type": "Person",
        name: site.author.name,
        url: site.author.url,
      },
      publisher: {
        "@type": "Organization",
        name: site.publisher.name,
        url: site.domain,
        logo: {
          "@type": "ImageObject",
          url: site.domain + site.publisher.logo,
        },
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": canonical,
      },
      dateModified: a.lastUpdated ? new Date(a.lastUpdated).toISOString() : undefined,
      datePublished: a.lastUpdated ? new Date(a.lastUpdated).toISOString() : undefined,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: a.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    ...(a.howTo
      ? [
          howToSchema({
            name: a.howTo.name,
            description: a.howTo.description,
            url: canonical,
            steps: a.howTo.steps,
          }),
        ]
      : []),
  ];

    write(
    `guides/${a.slug}/index.html`,
    renderPage({
      title: `${a.metaTitle || a.title} — Samjho`,
      description: compactDescription(a.metaDescription || a.shortAnswer),
      canonical,
      ogType: "article",
      activeHref: "/guides/",
      bodyHtml: layoutBody,
      structuredData,
      extraScripts: `<script src="/assets/js/toc.js" defer></script>`,
      darkHeader: true,
      articleMeta: {
        author: site.author.name,
        datePublished: a.lastUpdated ? new Date(a.lastUpdated).toISOString() : undefined,
        dateModified: a.lastUpdated ? new Date(a.lastUpdated).toISOString() : undefined,
      },
    })
  );
}

// ------------------------------------------------------------------ SCHEME ARTICLE
function buildSchemeArticle(s) {
  const eligibilityHtml = s.eligibility
    ? `<ul class="point-list">${s.eligibility.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
    : "";

  const documentsHtml = s.requiredDocuments
    ? `<ul class="point-list">${s.requiredDocuments.map((doc) => `<li>${esc(doc)}</li>`).join("")}</ul>`
    : "";

  const faqHtml = s.faq
    ? s.faq
        .map(
          (f, i) => `<details class="faq-item"${i === 0 ? " open" : ""}>
      <summary>${esc(f.q)}</summary>
      <p>${esc(f.a)}</p>
    </details>`
        )
        .join("")
    : "";

  const officialSourceHtml = s.officialSource
    ? `<p><a href="${esc(s.officialSource.href)}" target="_blank" rel="noopener">${esc(s.officialSource.label)}</a></p>`
    : "";

  const lastUpdatedHtml = s.lastUpdated
    ? `<p class="article-notice" role="note"><strong>Last updated:</strong> ${esc(s.lastUpdated)}</p>`
    : "";

  const body = `
  <div class="article-head container">
    ${breadcrumb([
      { label: "Home", href: "/" },
      { label: "Government", href: "/government/" },
      { label: s.title, href: schemeUrl(s.slug) },
    ])}
    <h1>${esc(s.title)}</h1>
    ${s.schemeCategory ? `<p class="card-eyebrow">${esc(s.schemeCategory)}</p>` : ""}
    <div class="short-answer"><p>${esc(s.shortAnswer)}</p></div>
    ${lastUpdatedHtml}
  </div>

  <div class="article-body container">
    ${s.mainBenefit ? `<section>
      <h2>Main Benefit</h2>
      <p>${esc(s.mainBenefit)}</p>
    </section>` : ""}

    ${eligibilityHtml ? `<section>
      <h2>Eligibility</h2>
      ${eligibilityHtml}
    </section>` : ""}

    ${documentsHtml ? `<section>
      <h2>Required Documents</h2>
      ${documentsHtml}
    </section>` : ""}

    ${s.howToApply ? `<section>
      <h2>How to Apply</h2>
      <p>${esc(s.howToApply)}</p>
    </section>` : ""}

    ${s.howToCheckStatus ? `<section>
      <h2>How to Check Status</h2>
      <p>${esc(s.howToCheckStatus)}</p>
    </section>` : ""}

    ${officialSourceHtml ? `<section>
      <h2>Official Government Source</h2>
      ${officialSourceHtml}
    </section>` : ""}

    <section>
      <h2>Verify with Official Source</h2>
      <p class="article-notice" role="note"><strong>Important:</strong> Scheme rules, benefits, and deadlines can change. Always verify current information with the official government source linked above before applying.</p>
    </section>

    ${adSlot("incontent", "Advertisement space")}

    ${faqHtml ? `<section>
      <h2>Frequently Asked Questions</h2>
      ${faqHtml}
    </section>` : ""}
  </div>
  `;

  const canonical = site.domain + schemeUrl(s.slug);
  const structuredData = [
    breadcrumbSchema([
      { label: "Home", href: "/" },
      { label: "Government", href: "/government/" },
      { label: s.title, href: schemeUrl(s.slug) },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: s.title,
      description: compactDescription(s.shortAnswer),
      url: canonical,
      articleSection: s.schemeCategory || "Government Scheme",
      dateModified: s.lastUpdated ? new Date(s.lastUpdated).toISOString() : undefined,
      datePublished: s.lastUpdated ? new Date(s.lastUpdated).toISOString() : undefined,
    },
    s.faq
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: s.faq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }
      : null,
  ].filter(Boolean);

  write(
    `schemes/${s.slug}/index.html`,
    renderPage({
      title: `${s.title} 2026 — Samjho India`,
      description: compactDescription(s.shortAnswer),
      canonical,
      ogType: "article",
      activeHref: "/government/",
      bodyHtml: body,
      structuredData,
    })
  );
}

// ------------------------------------------------------------------ CALCULATORS INDEX
function buildCalculatorsIndex() {
  const cards = calculators
    .map((c) => card({ href: calcUrl(c.slug), eyebrow: categoryLabel(c.category), title: c.title, desc: c.description }))
    .join("");

  const body = `
  <div class="page-head container">
    <h1>Calculators</h1>
    <p>Six everyday calculators. Everything runs in your browser — no numbers are sent anywhere.</p>
  </div>
  <section class="section">
    <div class="container">
      <div class="card-grid card-grid--3">${cards}</div>
    </div>
  </section>
  <section class="section">
    <div class="container">
      <h2>How Samjho Calculators Work</h2>
      <p>Every calculator on Samjho runs entirely in your web browser using JavaScript. When you enter a loan amount, interest rate, or date of birth, the calculation happens locally on your device. Your numbers are never sent to any server, stored in any database, or shared with any third party.</p>
      <p>Close the page and your numbers disappear. Refresh the page and your numbers disappear. This is by design — Samjho calculators are tools for quick estimates, not financial records.</p>
      <h2>What You Can Calculate</h2>
      <p>Our calculators cover the most common everyday financial and academic calculations for Indians:</p>
      <ul>
        <li><strong>EMI Calculator</strong> — Estimate monthly loan instalments for home, car, or personal loans. See total interest and repayment amount.</li>
        <li><strong>GST Calculator</strong> — Add or remove GST from any amount. Works for 5%, 12%, 18%, and 28% GST rates.</li>
        <li><strong>CGPA Calculator</strong> — Convert your CGPA to percentage and vice versa. Useful for job applications and college admissions.</li>
        <li><strong>Age Calculator</strong> — Find your exact age in years, months, and days from any date of birth. Useful for form filling and eligibility checks.</li>
        <li><strong>Discount Calculator</strong> — See how much you save during a sale and what the final price is after the discount.</li>
        <li><strong>Simple Interest Calculator</strong> — Calculate interest on savings or loans using the simple interest formula.</li>
      </ul>
      <h2>Accuracy Notice</h2>
      <p>These calculators give you quick estimates for personal planning. For official calculations (bank loan approvals, tax filings, government form submissions), always use the calculator or tool provided by the relevant authority — your bank, the Income Tax Department, or the calculator on the official portal.</p>
    </div>
  </section>
  `;

  write(
    "calculators/index.html",
    renderPage({
      title: "Free Calculators 2026 — EMI, GST, CGPA, Age",
      description: "Use free, private calculators for EMI, GST, CGPA, age, discount and simple interest. All calculations run in your browser — no data sent.",
      canonical: site.domain + "/calculators/",
      activeHref: "/calculators/",
      bodyHtml: body,
    })
  );
}

// ------------------------------------------------------------------ CALCULATOR FIELD MARKUP
function field({ id, label, hint, type = "text", placeholder, extraAttrs = "" }) {
  return `<div class="field">
    <label for="${id}">${esc(label)}</label>
    <input type="${type}" id="${id}" ${placeholder ? `placeholder="${esc(placeholder)}"` : ""} ${extraAttrs} />
    ${hint ? `<span class="hint">${esc(hint)}</span>` : ""}
    <span class="field-error" id="err-${id}" role="alert"></span>
  </div>`;
}

function toggleRow(targetId, options) {
  const buttons = options
    .map(
      (o, i) =>
        `<button type="button" data-value="${o.value}" class="${i === 0 ? "is-active" : ""}">${esc(o.label)}</button>`
    )
    .join("");
  return `<div class="toggle-row" data-target="${targetId}">${buttons}</div>
  <input type="hidden" id="${targetId}" value="${options[0].value}" />`;
}

const CALC_FORMS = {
  percentage: () => `
    ${field({ id: "pctObtained", label: "Obtained value", hint: "The marks or value you scored.", type: "number", placeholder: "e.g. 450" })}
    ${field({ id: "pctTotal", label: "Total value", hint: "The maximum possible value.", type: "number", placeholder: "e.g. 500" })}
  `,
  emi: () => `
    ${field({ id: "emiAmount", label: "Loan amount (₹)", type: "number", placeholder: "e.g. 500000" })}
    ${field({ id: "emiRate", label: "Interest rate (% per year)", type: "number", placeholder: "e.g. 10", extraAttrs: "step=\"0.01\"" })}
    ${field({ id: "emiTenureValue", label: "Loan tenure", type: "number", placeholder: "e.g. 5" })}
    <div class="field">
      <label>Tenure is in</label>
      ${toggleRow("emiTenureUnit", [
        { value: "years", label: "Years" },
        { value: "months", label: "Months" },
      ])}
    </div>
  `,
  gst: () => `
    ${field({ id: "gstAmount", label: "Amount (₹)", type: "number", placeholder: "e.g. 2000" })}
    <div class="field">
      <label for="gstRate">GST rate</label>
      <select id="gstRate">
        <option value="5">5%</option>
        <option value="12">12%</option>
        <option value="18" selected>18%</option>
        <option value="28">28%</option>
        <option value="custom">Other rate</option>
      </select>
      <span class="hint">Rates are set by the GST Council and can change — check the current rate for your item if unsure.</span>
    </div>
    <div class="field" id="gstRateCustomField" style="display:none;">
      <label for="gstRateCustom">Custom GST rate (%)</label>
      <input type="number" id="gstRateCustom" placeholder="e.g. 3" step="0.01" />
      <span class="field-error" id="err-gstRateCustom" role="alert"></span>
    </div>
    <div class="field">
      <label>What do you want to do?</label>
      ${toggleRow("gstMode", [
        { value: "add", label: "Add GST" },
        { value: "remove", label: "Remove GST" },
      ])}
    </div>
  `,
  age: () => `
    ${field({ id: "ageDob", label: "Date of birth", type: "date" })}
    ${field({ id: "ageAsOf", label: "Calculate age as of", hint: "Leave blank to use today's date.", type: "date" })}
  `,
  discount: () => `
    ${field({ id: "discOriginal", label: "Original price (₹)", type: "number", placeholder: "e.g. 1500" })}
    ${field({ id: "discPercent", label: "Discount (%)", type: "number", placeholder: "e.g. 20" })}
  `,
  "simple-interest": () => `
    ${field({ id: "siPrincipal", label: "Principal amount (₹)", type: "number", placeholder: "e.g. 100000" })}
    ${field({ id: "siRate", label: "Interest rate (% per year)", type: "number", placeholder: "e.g. 6", extraAttrs: "step=\"0.01\"" })}
    ${field({ id: "siTimeValue", label: "Time period", type: "number", placeholder: "e.g. 2" })}
    <div class="field">
      <label>Time period is in</label>
      ${toggleRow("siTimeUnit", [
        { value: "years", label: "Years" },
        { value: "months", label: "Months" },
      ])}
    </div>
  `,
  cgpa: () => `
    <div class="field">
      <label>Number of semesters</label>
      <select id="cgpaSemesters">
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4">4</option>
        <option value="5">5</option>
        <option value="6">6</option>
        <option value="7">7</option>
        <option value="8" selected>8</option>
      </select>
      <span class="hint">Select how many semesters you want to include.</span>
    </div>
    <div id="cgpaSemesterFields"></div>
  `,
};

const CALC_EXPLAINERS = {
  percentage:
    "Percentage tells you what share out of 100 a value represents. It's calculated as (obtained value ÷ total value) × 100 — useful for exam marks, scores, or any part-to-whole comparison.",
  emi:
    "EMI splits a loan into equal monthly payments over its tenure. Each instalment contains both interest and principal, calculated using the standard reducing-balance EMI formula.",
  gst:
    "GST calculations either add tax on top of a base amount, or work backwards to find the base amount when a price already includes GST. The GST rate itself depends on the category of goods or service.",
  age:
    "This calculator finds the exact difference between two dates in complete years, months and days — handy for eligibility checks, forms, and general curiosity.",
  discount:
    "A discount calculator finds how much you save and what you finally pay when a percentage is knocked off an original price.",
  "simple-interest":
    "Simple interest is calculated only on the original principal for the entire time period, using Interest = (Principal × Rate × Time) ÷ 100.",
  cgpa:
    "CGPA (Cumulative Grade Point Average) is calculated by averaging the grade points earned across all semesters, weighted by the credits for each semester. It's commonly used in universities to track overall academic performance.",
};

// Phase 1 calculator redesign: per-calculator badge, lede highlight and formula.
const CALC_BADGES = {
  percentage: "EDUCATION TOOL",
  emi: "FINTECH TOOL",
  gst: "TAX TOOL",
  age: "EVERYDAY TOOL",
  discount: "SHOPPING TOOL",
  "simple-interest": "FINTECH TOOL",
  cgpa: "EDUCATION TOOL",
};

const CALC_LEDES = {
  percentage:
    'Work out any value as a share of 100 — <span class="calc-lede__highlight">exam marks, scores and part-to-whole comparisons</span>, instantly in your browser.',
  emi:
    'Estimate the <span class="calc-lede__highlight">monthly EMI, total interest and total repayment</span> for a home, car or personal loan.',
  gst:
    'Add or remove GST from any amount — get the <span class="calc-lede__highlight">GST amount and final price</span> for any standard rate.',
  age:
    'Find your <span class="calc-lede__highlight">exact age in years, months and days</span> as of today or any other date — useful for forms and eligibility checks.',
  discount:
    'See exactly <span class="calc-lede__highlight">how much you save and what you finally pay</span> when a percentage discount is applied.',
  "simple-interest":
    'Work out <span class="calc-lede__highlight">interest and total amount payable</span> for a given principal, rate and time period.',
  cgpa:
    'Average your semester grade points to get your <span class="calc-lede__highlight">Cumulative Grade Point Average</span> instantly.',
};

const CALC_FAQS = {
  emi: [
    { q: "What is EMI?", a: "EMI stands for Equated Monthly Instalment. It is the fixed amount you pay every month towards a loan, which includes both principal and interest." },
    { q: "How is EMI calculated?", a: "EMI is calculated using the formula: EMI = P × r × (1+r)^n / ((1+r)^n - 1), where P is principal, r is monthly interest rate, and n is tenure in months." },
    { q: "Does EMI change for floating rate loans?", a: "Yes. For floating rate loans, the EMI can change when the interest rate changes. Fixed rate loans keep the same EMI throughout." },
  ],
  gst: [
    { q: "What are the GST rates in India?", a: "India has four main GST rates: 5%, 12%, 18%, and 28%. The rate depends on the category of goods or services." },
    { q: "How do I add GST to a price?", a: "Multiply the base price by (1 + GST rate/100). For example, for 18% GST: Final price = Base × 1.18." },
    { q: "How do I remove GST from a price?", a: "Divide the GST-inclusive price by (1 + GST rate/100). For example, for 18%: Base = Price ÷ 1.18." },
  ],
  age: [
    { q: "How accurate is the age calculator?", a: "It calculates the exact difference between two dates in complete years, months, and days. It accounts for varying month lengths." },
    { q: "Can I calculate age for future dates?", a: "Yes. You can enter any date (past or future) to find the age difference from today or between two dates." },
    { q: "Why do I need my exact age?", a: "Exact age is needed for government forms, job applications, exam eligibility, insurance policies, and pension calculations." },
  ],
  discount: [
    { q: "How do I calculate discount percentage?", a: "Discount % = (Original Price - Sale Price) / Original Price × 100. Or use our calculator to work backwards from the sale price." },
    { q: "Does the calculator handle multiple discounts?", a: "No. This calculator handles a single discount. For multiple discounts (e.g., 20% + 10%), apply them sequentially: Price × 0.80 × 0.90." },
    { q: "How do I find the original price before discount?", a: "Original Price = Sale Price ÷ (1 - Discount/100). For example, if sale price is ₹800 after 20% off: ₹800 ÷ 0.80 = ₹1,000." },
  ],
  "simple-interest": [
    { q: "What is simple interest?", a: "Simple interest is calculated only on the original principal amount. Formula: Interest = (Principal × Rate × Time) ÷ 100." },
    { q: "How is simple interest different from compound interest?", a: "Simple interest is calculated on the original principal only. Compound interest is calculated on the principal plus accumulated interest, so it grows faster." },
    { q: "When is simple interest used?", a: "Simple interest is typically used for short-term loans, fixed deposits, and certain government schemes. Most bank loans use compound interest." },
  ],
  cgpa: [
    { q: "What is CGPA?", a: "CGPA (Cumulative Grade Point Average) is the average of grade points earned across all semesters, weighted by credits. It is commonly used in Indian universities." },
    { q: "How do I convert CGPA to percentage?", a: "Multiply your CGPA by the conversion factor specified by your university. Common factors: 9.5 (CBSE), 10 (some universities), or check your university's official conversion formula." },
    { q: "What is a good CGPA?", a: "A CGPA of 8.0 or above is generally considered good. However, requirements vary by university and purpose (jobs, higher education, scholarships)." },
  ],
  percentage: [
    { q: "How do I calculate percentage?", a: "Percentage = (Obtained Value ÷ Total Value) × 100. For example, 450 marks out of 600 = (450/600) × 100 = 75%." },
    { q: "How do I convert percentage to CGPA?", a: "Divide your percentage by the conversion factor. For CBSE: CGPA = Percentage ÷ 9.5. For example, 85% ÷ 9.5 = 8.95 CGPA." },
    { q: "What is the difference between percentage and percentile?", a: "Percentage is your score out of 100. Percentile shows how you rank compared to others — a 90th percentile means you scored better than 90% of test-takers." },
  ],
};

const CALC_FORMULAS = {
  percentage: "(Obtained ÷ Total) × 100 = Percentage",
  emi: "EMI = P × r × (1+r)ⁿ ÷ ((1+r)ⁿ − 1)\nr = annual rate ÷ 12 ÷ 100, n = tenure in months",
  gst: "Add: GST = Amount × Rate ÷ 100, Final = Amount + GST\nRemove: Base = Amount ÷ (1 + Rate ÷ 100)",
  age: "Age = exact difference between DOB and as-of date\n(complete years, months and days)",
  discount: "Savings = Price × Discount% ÷ 100\nFinal price = Price − Savings",
  "simple-interest": "Interest = (P × R × T) ÷ 100\nTotal = P + Interest",
  cgpa: "CGPA = Σ (Semester GP × Credits) ÷ Σ (Credits)",
};

function buildCalculatorPage(c) {
  const formFields = CALC_FORMS[c.slug]();
  // Related: same-category first, then fill from other categories (max 2).
  const sameCat = calculators.filter((x) => x.slug !== c.slug && x.category === c.category);
  const otherCat = calculators.filter((x) => x.slug !== c.slug && x.category !== c.category);
  const relatedCalcs = sameCat.concat(otherCat).slice(0, 2);

  const body = `
  <div class="article-head container">
    ${breadcrumb([
      { label: "Home", href: "/" },
      { label: "Calculators", href: "/calculators/" },
      { label: c.title, href: calcUrl(c.slug) },
    ])}
    <span class="calc-badge">${esc(CALC_BADGES[c.slug] || "TOOL")}</span>
    <h1>${esc(c.title)}</h1>
    <p class="calc-lede">${CALC_LEDES[c.slug] || esc(c.description)}</p>
    <p class="article-meta">Last updated: 2026-09-18 · Updated for 2026</p>
  </div>

  <div class="article-body container">
    <div class="calc-layout">
    <div class="calc-layout__main">
    <div class="calc-shell">
      <form class="calc-form" data-calc="${c.slug}" novalidate>
        ${formFields}
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Calculate</button>
          <button type="reset" class="btn btn-secondary">Reset</button>
        </div>
      </form>
      <div class="calc-result calc-result--dark">
        <h2>Result</h2>
        <div id="resultBody">
          <p class="result-placeholder">Enter values and press Calculate to see your result here.</p>
        </div>
        <a href="#" class="calc-result__cta" aria-disabled="true">View Amortization →</a>
        <p class="calc-result__note">Your numbers stay in your browser — nothing is sent anywhere.</p>
      </div>
    </div>

    ${adSlot("incontent", "Advertisement space")}

    <div class="calc-explainer">
      <h2>How this is calculated</h2>
      <pre class="calc-formula"><code>${esc(CALC_FORMULAS[c.slug] || "")}</code></pre>
      <p>${esc(CALC_EXPLAINERS[c.slug])}</p>
    </div>
    </div>

    <aside class="gov-sidebar">
      <div class="gov-sidebar-widget">
        <h3 class="gov-sidebar-widget__heading">Related Calculators</h3>
        <ul class="static-toc">${relatedCalcs
          .map((r) => `<li><a href="${calcUrl(r.slug)}">${esc(r.title)}</a></li>`)
          .join("")}</ul>
      </div>
      <div class="gov-sidebar-widget gov-help">
        <p>Wrong number? Check the inputs — amounts, rates and periods must be positive. Still stuck? WhatsApp par 'Hi' bhejo.</p>
        <a href="#" class="gov-help__link">Chat now →</a>
      </div>
    </aside>

    ${(CALC_FAQS[c.slug] || []).length > 0 ? `
    <div class="guide-faq" style="margin-top:32px">
      <h2>Frequently Asked Questions</h2>
      ${CALC_FAQS[c.slug].map((f) => `
        <div class="guide-faq__item">
          <h3 class="guide-faq__q">${esc(f.q)}</h3>
          <div class="guide-faq__a">${esc(f.a)}</div>
        </div>
      `).join("")}
    </div>
    ` : ""}
    </div>
  </div>
  `;

  const canonical = site.domain + calcUrl(c.slug);
  const structuredData = [
    breadcrumbSchema([
      { label: "Home", href: "/" },
      { label: "Calculators", href: "/calculators/" },
      { label: c.title, href: calcUrl(c.slug) },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: c.title,
      description: c.description,
      url: canonical,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      offer: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
      },
      dateModified: new Date().toISOString().split("T")[0],
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: `How to calculate ${c.title}`,
      description: CALC_EXPLAINERS[c.slug] || c.description,
      url: canonical,
      steps: [
        {
          "@type": "HowToStep",
          position: 1,
          text: "Enter the required values in the calculator fields above.",
        },
        {
          "@type": "HowToStep",
          position: 2,
          text: `The calculator applies the formula: ${CALC_FORMULAS[c.slug] || "standard formula"}`,
        },
        {
          "@type": "HowToStep",
          position: 3,
          text: "Review the result shown — all calculations happen in your browser, nothing is sent to any server.",
        },
      ],
    },
  ];

  write(
    `calculators/${c.slug}/index.html`,
    renderPage({
      title: `${c.metaTitle || c.title} — Samjho India`,
      description: c.description,
      canonical,
      activeHref: "/calculators/",
      bodyHtml: body,
      structuredData,
      extraScripts: `<script src="/assets/js/calculators.js" defer></script>`,
    })
  );
}

// ------------------------------------------------------------------ STATIC PAGES
function buildStaticPage({ slug, title, description, heading, sectionsHtml }) {
  // Sidebar quick links: derive "On this page" from H2 headings in the content.
  const sectionAnchors = [...sectionsHtml.matchAll(/<h2>(.*?)<\/h2>/g)].map((m) => m[1]);
  let anchorIndex = 0;
  const anchoredSections = sectionsHtml.replace(/<h2>(.*?)<\/h2>/g, (full, text) => {
    const id = `s-${++anchorIndex}`;
    return `<h2 id="${id}">${text}</h2>`;
  });
  const onThisPageHtml = sectionAnchors.length
    ? `<div class="gov-sidebar-widget">
        <h3 class="gov-sidebar-widget__heading">On this page</h3>
        <ul class="static-toc">${sectionAnchors
          .map((t, i) => `<li><a href="#s-${i + 1}">${esc(t)}</a></li>`)
          .join("")}</ul>
      </div>`
    : "";
  const relatedPages = [
    { href: "/about/", label: "About Us" },
    { href: "/contact/", label: "Contact" },
    { href: "/privacy/", label: "Privacy Policy" },
    { href: "/terms/", label: "Terms & Conditions" },
    { href: "/disclaimer/", label: "Disclaimer" },
  ]
    .filter((p) => p.href !== `/${slug}/`)
    .map((p) => `<li><a href="${p.href}">${esc(p.label)}</a></li>`)
    .join("");
  const relatedHtml = `<div class="gov-sidebar-widget">
    <h3 class="gov-sidebar-widget__heading">Related pages</h3>
    <ul class="static-toc">${relatedPages}</ul>
  </div>`;

  // Split sections and place the ad slot roughly in the middle.
  const sectionParts = anchoredSections.split(/(?=<section)/g).filter(Boolean);
  const mid = Math.max(1, Math.floor(sectionParts.length / 2));
  const contentHtml = sectionParts
    .map((part, i) => (i === mid ? `${part}\n${adSlot("incontent", "Advertisement space")}` : part))
    .join("");

  const body = `
  <div class="article-head container">
    ${breadcrumb([
      { label: "Home", href: "/" },
      { label: heading, href: `/${slug}/` },
    ])}
    <h1>${esc(heading)}</h1>
  </div>

  <div class="article-body container static-page-layout">
    <div class="static-page-layout__content prose">
      ${contentHtml}
    </div>
    <aside class="gov-sidebar static-page-layout__sidebar">
      ${onThisPageHtml}
      ${relatedHtml}
    </aside>
  </div>
  `;
  write(
    `${slug}/index.html`,
    renderPage({
      title: heading.includes("Samjho") ? heading : heading + " — Samjho India",
      description,
      canonical: `${site.domain}/${slug}/`,
      activeHref: slug === "about" ? "/about/" : "",
      bodyHtml: body,
      structuredData: [
        breadcrumbSchema([
          { label: "Home", href: "/" },
          { label: heading, href: `/${slug}/` },
        ]),
        webPageSchema({
          name: heading,
          description,
          url: `${site.domain}/${slug}/`,
        }),
      ],
    })
  );
}

function buildAbout() {
  buildStaticPage({
    slug: "about",
    title: "About Samjho India",
    heading: "About Samjho India — Simple Guides for Everyone",
    description: "Samjho India explains everyday Indian money, documents, education and government scheme questions in simple language. Free calculators, official sources, no jargon.",
    sectionsHtml: `
      <section>
        <p>Samjho ("understand" in Hindi and Urdu) was built for a simple reason: a lot of everyday Indian life runs on terms and numbers that are never actually explained anywhere — GST on a bill, EMI on a loan offer, CGPA on a report card, UAN on a payslip.</p>
        <p>Instead of another long article full of jargon, Samjho tries to answer three questions for each topic: what does this actually mean, why should I care, and if there's a number involved, can I work it out myself right now.</p>
      </section>
      <section>
        <h2>What Samjho is</h2>
        <ul>
          <li>A set of plain-English explanations for common Indian money, document, education, job and technology questions.</li>
          <li>A set of calculators that run entirely in your browser, so your numbers are never sent anywhere.</li>
          <li>An independent resource, built and maintained without claiming any official or government status.</li>
        </ul>
      </section>
      <section>
        <h2>What Samjho isn't</h2>
        <ul>
          <li>Samjho is not a government website, a bank, or a financial institution.</li>
          <li>Samjho does not provide personalised financial, legal or tax advice.</li>
          <li>Samjho does not ask you to log in, and does not sell any product or service.</li>
        </ul>
        <p>For anything that affects your money or legal standing, always confirm details with the relevant official source — your bank, employer, or the appropriate government department — before deciding.</p>
      </section>
    `,
  });
}

function buildContact() {
  buildStaticPage({
    slug: "contact",
    title: "Contact Samjho India — Get in Touch",
    heading: "Contact Samjho India — Get in Touch",
    description: "Get in touch with Samjho India for corrections, topic requests, or feedback. We respond to every query about our guides and calculators.",
    sectionsHtml: `
      <section>
        <p>Samjho is a small, independent project. If you've spotted something incorrect, have a topic you'd like explained, or found a calculator behaving unexpectedly, we'd like to know.</p>
        <p>We read every message and try to respond within 48 hours. For urgent corrections (wrong numbers on a calculator, outdated government scheme info), mark your email as high priority so we can fix it faster.</p>
      </section>
      <section>
        <h2>Email</h2>
        <p>Write to us at <a href="mailto:hello@samjho.in">hello@samjho.in</a> and we'll get back to you as soon as we can.</p>
        <p>We can help with: guide corrections, calculator bugs, new topic suggestions, partnership inquiries, and general feedback about Samjho.</p>
      </section>
      <section>
        <h2>Before you write in</h2>
        <ul>
          <li>For a correction, please mention the exact guide or calculator page and what needs fixing.</li>
          <li>For a new topic request, a short description of the question you'd like explained is enough.</li>
          <li>For calculator issues, tell us which browser you're using and what numbers you entered.</li>
          <li>Samjho cannot advise on your personal financial, tax or legal situation — for that, please consult a qualified professional or the relevant official authority.</li>
        </ul>
      </section>
      <section>
        <h2>What we cover</h2>
        <p>Samjho explains everyday Indian topics in simple language. We cover government schemes (PM Kisan, Ayushman Bharat), financial basics (GST, EMI, credit score), document guides (PAN, Aadhaar, voter ID), and education topics (CGPA, scholarships). If your question falls in these areas, we're happy to help.</p>
        <p>For official government matters, always check the relevant government website first. Samjho explains things in plain language but is not a government service.</p>
      </section>
      <section>
        <h2>Social</h2>
        <p>Follow us on YouTube for video explanations of guides and calculators: <a href="https://www.youtube.com/@SamjhoIndia" target="_blank" rel="noopener">youtube.com/@SamjhoIndia</a></p>
      </section>
    `,
  });
}

function buildPrivacy() {
  buildStaticPage({
    slug: "privacy",
    title: "Privacy Policy",
    heading: "Privacy Policy — Samjho India Data Protection",
    description: "Samjho India privacy policy. Calculators run in your browser — no data is sent. We use minimal analytics and never sell your information.",
    sectionsHtml: `
      <section>
        <p>This policy explains, in plain language, how Samjho handles information when you use this website.</p>
      </section>
      <section>
        <h2>Calculators</h2>
        <p>Every calculator on Samjho runs entirely in your web browser using JavaScript. Numbers you enter — loan amounts, dates of birth, prices — are never transmitted to any server. Closing or refreshing the page clears them.</p>
      </section>
      <section>
        <h2>Local storage</h2>
        <p>Samjho may use your browser's local storage to remember simple preferences (such as a recently viewed page) on your own device. This information stays on your device and is not sent to us.</p>
      </section>
      <section>
        <h2>Cookies and advertising</h2>
        <p>If advertisements are shown on Samjho through a network such as Google AdSense, that network may use cookies or similar technologies to show relevant ads and measure performance, in line with its own privacy policy. Samjho does not control how third-party ad networks use this data.</p>
      </section>
      <section>
        <h2>Analytics</h2>
        <p>Samjho may use basic, privacy-respecting analytics to understand which pages are useful, such as approximate page-view counts. This does not involve tracking you personally across other websites.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>Questions about this policy can be sent to <a href="mailto:hello@samjho.in">hello@samjho.in</a>.</p>
      </section>
    `,
  });
}

function buildTerms() {
  buildStaticPage({
    slug: "terms",
    title: "Terms & Conditions — Samjho India",
    heading: "Terms & Conditions",
    description: "Terms and conditions for using Samjho India. Read about content usage, accuracy, liability limits, and your responsibilities as a user.",
    sectionsHtml: `
      <section>
        <p>By using Samjho, you agree to the following terms.</p>
      </section>
      <section>
        <h2>Use of content</h2>
        <p>Guides and calculators on Samjho are provided for general informational purposes only. They are written to help you understand common concepts and estimate figures, not as professional advice tailored to your situation.</p>
      </section>
      <section>
        <h2>Accuracy</h2>
        <p>Samjho aims to keep explanations and calculations accurate and up to date, but rules, rates and figures referenced (such as tax rates or interest conventions) can change over time and may vary by case. Always verify current, situation-specific details with the relevant official source before acting.</p>
      </section>
      <section>
        <h2>No liability</h2>
        <p>Samjho and its creators are not liable for decisions made or losses incurred based on information or calculations on this website. Calculators provide estimates based on the inputs you give; actual figures from a bank, employer or government body may differ.</p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>These terms may be updated from time to time as the website grows. Continued use of Samjho after changes means you accept the updated terms.</p>
      </section>
    `,
  });
}

function buildDisclaimer() {
  buildStaticPage({
    slug: "disclaimer",
    title: "Disclaimer",
    heading: "Disclaimer — Samjho India Informational Resource",
    description: "Samjho India is an independent informational resource. Content is for general understanding only and is not financial, legal, or tax advice. Always verify with official sources.",
    sectionsHtml: `
      <section>
        <p>Samjho is an independent, privately run informational and calculation resource. It is <strong>not</strong> a government website, and is not affiliated with, endorsed by, or operated on behalf of any government department, regulator, bank, or official body.</p>
      </section>
      <section>
        <h2>Information, not advice</h2>
        <p>Content on Samjho is written to explain common concepts in simple language. It does not constitute financial, legal, tax or investment advice. Your personal situation may involve details this general content does not cover.</p>
      </section>
      <section>
        <h2>Verify before you act</h2>
        <p>Rules, tax rates, interest conventions, and eligibility criteria mentioned on Samjho can change and may vary by case. Before making a decision — especially one involving money, tax or legal standing — please verify current details with the relevant official source, such as your bank, employer, or the applicable government department or regulator.</p>
      </section>
      <section>
        <h2>Calculator estimates</h2>
        <p>Calculators on Samjho provide estimates based on the values you enter and standard formulas. Actual amounts charged by a bank, lender or authority may differ due to additional fees, rounding conventions, or rules not reflected in a simple calculator.</p>
      </section>
    `,
  });
}

function buildNotFound() {
  const description = "The Samjho page you requested could not be found. Browse topics, calculators or return to the homepage.";
  const body = `
  <div class="page-head container">
    <h1>Page not found</h1>
    <p>That page does not exist or may have moved. Try one of these useful starting points.</p>
  </div>
  <section class="section prose">
    <div class="container">
      <h2>Find your way around Samjho</h2>
      <p><a href="/">Go to the homepage</a>, <a href="/explore/">explore topics</a>, <a href="/calculators/">open calculators</a>, or <a href="/guides/">browse all guides</a>.</p>
      <form class="search-wrap js-search-form" role="search" aria-label="Site search">
        <div class="search-box">
          <input type="search" class="js-search-input" placeholder="What do you want to understand?" aria-label="What do you want to understand?" autocomplete="off" />
          <button type="submit">Search</button>
        </div>
        <div class="search-results js-search-results" role="listbox"></div>
      </form>
    </div>
  </section>
  `;
  write(
    "404.html",
    renderPage({
      title: "Page not found — Samjho",
      description,
      canonical: `${site.domain}/404.html`,
      robots: "noindex, follow",
      bodyHtml: body,
    })
  );
}

// ------------------------------------------------------------------ SEARCH INDEX
function buildSearchIndex() {
  const entries = [];
  articles.forEach((a) => {
    entries.push({
      type: "guide",
      title: a.title,
      url: guideUrl(a.slug),
      category: categoryLabel(a.category),
      keywords: a.keywords,
    });
  });
  calculators.forEach((c) => {
    entries.push({
      type: "calculator",
      title: c.title,
      url: calcUrl(c.slug),
      category: categoryLabel(c.category),
      keywords: c.keywords,
    });
  });
  publishedStore.loadPublishedGuides().forEach((g) => {
    if (!g.slug || publishedStore.isSlugReserved(g.slug)) return;
    entries.push({
      type: "guide",
      title: g.title,
      url: guideUrl(g.slug),
      category: categoryLabel(g.category),
      keywords: g.keywords || [],
    });
  });
  const js = `window.SAMJHO_SEARCH_INDEX = ${JSON.stringify(entries)};\n`;
  write("assets/js/search-data.js", js);
}

// ------------------------------------------------------------------ PUBLISHED GUIDES
// Approved guides staged in data/published-guides.json are rendered through
// the EXISTING Master Guide Template and the EXISTING renderPage(). Existing
// article pages are never replaced — reserved slugs are skipped.
function buildPublishedGuides() {
  // Read from published-guides.json (existing pipeline)
  const published = publishedStore.loadPublishedGuides();

  // Also read published items from Supabase if available
  let dbPublished = [];
  // TODO: When SUPABASE_SERVICE_ROLE_KEY is set in build env, read published items from DB.
  // For now, published-guides.json remains the primary source.


  // Merge: JSON published + DB published, JSON takes precedence for existing slugs
  const seen = new Set(published.map((g) => g.slug));
  const allPublished = published.slice();
  dbPublished.forEach((item) => {
    if (item.refined_guide && typeof item.refined_guide === "object" && item.refined_guide.slug && !seen.has(item.refined_guide.slug)) {
      allPublished.push(item.refined_guide);
      seen.add(item.refined_guide.slug);
    }
  });

  if (allPublished.length === 0) return;

  allPublished.forEach((g) => {
    if (!g.slug || publishedStore.isSlugReserved(g.slug)) {
      console.log(`Published guide skipped (missing or reserved slug): ${g.slug || "(none)"}`);
      return;
    }
    // Build allGuides list for related section: published + articles
    const allGuides = [
      ...publishedStore.loadPublishedGuides().filter((pg) => pg.slug && pg.slug !== 'test-guide-micro7').map((pg) => ({ slug: pg.slug, title: pg.title, category: pg.category || pg.primary_category || '', summary: pg.summary || '' })),
      ...articles.map((a) => ({ slug: a.slug, title: a.title, category: a.category || '', summary: a.shortAnswer || '' })),
    ];
    const rendered = renderMasterGuide(g, { allGuides });
    const pubDate = g.last_updated || g.refined_at || g.updated_at || null;
    const structuredData = [
      breadcrumbSchema([
        { label: "Home", href: "/" },
        { label: "Guides", href: "/guides/" },
        { label: rendered.title, href: guideUrl(g.slug) },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: rendered.title,
        description: compactDescription(rendered.description),
        url: site.domain + guideUrl(g.slug),
        image: g.hero_image || site.socialImage || undefined,
        articleSection: categoryLabel(g.category || g.primary_category || ""),
        author: {
          "@type": "Person",
          name: site.author.name,
          url: site.author.url,
        },
        publisher: {
          "@type": "Organization",
          name: site.publisher.name,
          url: site.domain,
          logo: {
            "@type": "ImageObject",
            url: site.domain + site.publisher.logo,
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": site.domain + guideUrl(g.slug),
        },
        dateModified: pubDate ? new Date(pubDate).toISOString() : undefined,
        datePublished: pubDate ? new Date(pubDate).toISOString() : undefined,
      },
    ];
    write(
      "guides/" + g.slug + "/index.html",
      renderPage({
        title: rendered.title.length > 60 ? rendered.title.substring(0, 57) + "..." : rendered.title,
        description: rendered.description,
        canonical: site.domain + guideUrl(g.slug),
        ogType: "article",
        activeHref: "",
        bodyHtml: rendered.html,
        structuredData,
        articleMeta: {
          author: site.author.name,
          datePublished: pubDate ? new Date(pubDate).toISOString() : undefined,
          dateModified: pubDate ? new Date(pubDate).toISOString() : undefined,
        },
      })
    );
    console.log(`Published guide -> /guides/${g.slug}/`);
  });
}

// ------------------------------------------------------------------ SEO FILES
function buildSitemap() {
  const today = new Date().toISOString().slice(0, 10);
  function urlEntry(loc, lastmod) {
    return lastmod
      ? `  <url><loc>${site.domain}${loc}</loc><lastmod>${lastmod}</lastmod></url>`
      : `  <url><loc>${site.domain}${loc}</loc></url>`;
  }
  const staticPages = [
    "/", "/explore/", "/guides/", "/calculators/",
    "/about/", "/contact/", "/privacy/", "/terms/", "/disclaimer/",
  ];
  const guideSubPages = [
    "/guides/business/", "/guides/documents/", "/guides/education/",
    "/guides/government/", "/guides/money/",
  ];
  const schemePages = [
    "/schemes/kisan-credit-card/", "/schemes/pm-fasal-bima-yojana/",
    "/schemes/pm-kisan-yojana/", "/schemes/soil-health-card/",
  ];
  const hubPages = site.hubs.map((h) => hubUrl(h.slug));
  const articlePages = articles.map((a) => ({ loc: guideUrl(a.slug), lastmod: a.lastUpdated || null }));
  const calcPages = calculators.map((c) => ({ loc: calcUrl(c.slug), lastmod: null }));
  const pubGuides = publishedStore
    .loadPublishedGuides()
    .filter((g) => g.slug && g.slug !== 'test-guide-micro7' && !publishedStore.isSlugReserved(g.slug))
    .map((g) => ({ loc: guideUrl(g.slug), lastmod: g.last_updated || g.refined_at || g.updated_at || null }));
  const allUrls = [
    ...staticPages.map((u) => urlEntry(u, today)),
    ...guideSubPages.map((u) => urlEntry(u, today)),
    ...schemePages.map((u) => urlEntry(u, today)),
    ...hubPages.map((u) => urlEntry(u, today)),
    ...articlePages.map((u) => urlEntry(u.loc, u.lastmod)),
    ...calcPages.map((u) => urlEntry(u.loc, u.lastmod)),
    ...pubGuides.map((u) => urlEntry(u.loc, u.lastmod)),
    urlEntry("/llms.txt", today),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.join("\n")}
</urlset>
`;
  write("sitemap.xml", body);
}

function buildRobots() {
  const body = `User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

Sitemap: ${site.domain}/sitemap.xml
`;
  write("robots.txt", body);
}

// ------------------------------------------------------------------ LLMS.TXT
function buildLlmsTxt() {
  const popularGuides = [
    { title: "PM Kisan Yojana 2025", href: `${site.domain}/guides/pm-kisan-yojana/`, desc: "₹6000 saalana income support scheme for eligible farmer families." },
    { title: "Aadhaar Update Guide", href: `${site.domain}/guides/what-is-aadhaar/`, desc: "Mobile number, address and demographic update steps." },
    { title: "Udyam Registration", href: `${site.domain}/guides/what-is-udyam/`, desc: "Free MSME registration for eligible small businesses." },
    { title: "PAN Card Guide", href: `${site.domain}/guides/what-is-pan-card/`, desc: "Apply, correct and track your PAN card online." },
    { title: "Ration Card Guide", href: `${site.domain}/guides/ration-card/`, desc: "e-KYC, state list and eligibility for ration cards." },
  ];

  const body = `# Samjho India

> India ka everyday information aur utility platform. Government schemes, documents, business registration, money concepts, education — sab simple Hindi mein.

## Main Categories
- [Government Guides](https://samjhoindia.com/guides/government/): Schemes, scholarships, public services
- [Documents Guides](https://samjhoindia.com/guides/documents/): Aadhaar, PAN, Voter ID, Passport
- [Business Guides](https://samjhoindia.com/guides/business/): Udyam, GST, FSSAI
- [Money Guides](https://samjhoindia.com/guides/money/): EMI, Credit Score, Savings
- [Education Guides](https://samjhoindia.com/guides/education/): CGPA, Scholarships, Exams

## Popular Guides
${popularGuides.map((g) => `- [${g.title}](${g.href}): ${g.desc}`).join("\n")}

## Calculators
- [EMI Calculator](https://samjhoindia.com/calculators/emi/): Loan EMI calculate
- [GST Calculator](https://samjhoindia.com/calculators/gst/): GST add/remove
- [Age Calculator](https://samjhoindia.com/calculators/age/): Exact age

## How This Site Works
- Every calculator runs in your browser — nothing is sent to a server.
- Guides explain what something is, why it matters, and how it works, in simple Hindi-English mix.
- Samjho is an independent information platform, not a government website.
`;
  write("llms.txt", body);
}

// ------------------------------------------------------------------ INDEXNOW
// The IndexNow key file must be UTF-8 text containing exactly the key, served
// from the site root (https://<domain>/<key>.txt) so Bing, Yandex and Naver can
// verify ownership before accepting instant-indexing submissions.
// It may live in either build/assets/<key>.txt or build/assets/indexnow/<key>.txt
// (both are copied to the site root). build/scripts/ping-indexnow.js does the
// actual URL submission after a deploy.
function buildIndexNow() {
  const cfg = site.indexNow || {};
  if (!cfg.enabled || !cfg.key) return;

  const assetsDir = path.join(__dirname, "assets");
  const srcDir = path.join(assetsDir, "indexnow");
  fs.mkdirSync(srcDir, { recursive: true });

  const canonical = path.join(srcDir, `${cfg.key}.txt`);
  const candidates = [path.join(assetsDir, `${cfg.key}.txt`), canonical];

  if (!candidates.some((f) => fs.existsSync(f))) {
    fs.writeFileSync(canonical, cfg.key, "utf8");
    console.log(`IndexNow key file created -> build/assets/indexnow/${cfg.key}.txt`);
  }

  // Reject anything that isn't plain UTF-8 text containing just the key
  // (editors sometimes save the file as UTF-16, which search engines won't read).
  for (const file of candidates.filter((f) => fs.existsSync(f))) {
    const text = fs.readFileSync(file, "utf8");
    if (text.trim() !== cfg.key) {
      throw new Error(
        `IndexNow key file ${path.relative(__dirname, file)} must be UTF-8 text containing exactly "${cfg.key}"`
      );
    }
  }

  // Always write a clean, BOM-free key file at the site root.
  write(`${cfg.key}.txt`, cfg.key);

  // Additional key files kept alongside are copied to the root as well.
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".txt") || entry.name === `${cfg.key}.txt`) continue;
    fs.copyFileSync(path.join(srcDir, entry.name), path.join(OUT, entry.name));
  }

  console.log(`IndexNow key file -> /${cfg.key}.txt`);
}

// ------------------------------------------------------------------ SITE VERIFICATION FILES
// Search-engine ownership files (e.g. BingSiteAuth.xml) must be reachable from
// the site root, so they are published from build/assets/ to dist/ unchanged:
// build/assets/BingSiteAuth.xml -> https://<domain>/BingSiteAuth.xml
const VERIFICATION_FILES = ["BingSiteAuth.xml"];

function buildVerificationFiles() {
  for (const name of VERIFICATION_FILES) {
    const src = path.join(__dirname, "assets", name);
    if (!fs.existsSync(src)) {
      console.log(`Site verification file: build/assets/${name} not found — skipped (add it to publish /${name})`);
      continue;
    }
    fs.copyFileSync(src, path.join(OUT, name));
    console.log(`Site verification file ${name} -> /${name}`);
  }
}

// ------------------------------------------------------------------ RUN
async function run() {
  if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });

  // Fetch live category counts
  var supabaseCounts = {};
  try { supabaseCounts = await getCategoryCounts(); } catch (e) {}
  categoryCounts = mergeCounts(supabaseCounts, getLocalCategoryCounts());
  console.log('[counts] Final:', categoryCounts);
  fs.mkdirSync(OUT, { recursive: true });

  buildSearchIndex();
  buildHome();
  buildExplore();
  site.hubs.filter((h) => h.slug !== "government" && h.slug !== "documents" && h.slug !== "business" && h.slug !== "money" && h.slug !== "education").forEach(buildCategoryHub);
  buildGovernmentPage();
  buildDocumentsPage();
  buildBusinessPage();
  buildMoneyPage();
  buildEducationPage();
  buildGuidesIndex();
  GUIDE_SUBPAGES.forEach(buildGuidesSubPage);
  articles.forEach(buildGuideArticle);
  schemes.forEach(buildSchemeArticle);
  buildPublishedGuides();
  buildCalculatorsIndex();
  calculators.forEach(buildCalculatorPage);
  buildAbout();
  buildContact();
  buildPrivacy();
  buildTerms();
  buildDisclaimer();
  buildNotFound();
  buildSitemap();
  buildRobots();
  buildLlmsTxt();
  buildIndexNow();
  buildVerificationFiles();

    copyDir(path.join(__dirname, "assets", "css"), path.join(OUT, "assets", "css"));
  fs.copyFileSync(
    path.join(__dirname, "assets", "js", "main.js"),
    path.join(OUT, "assets", "js", "main.js")
  );
  fs.copyFileSync(
    path.join(__dirname, "assets", "js", "calculators.js"),
    path.join(OUT, "assets", "js", "calculators.js")
  );
  fs.copyFileSync(
    path.join(__dirname, "assets", "js", "toc.js"),
    path.join(OUT, "assets", "js", "toc.js")
  );
  // Optional assets — copy only if the source file exists.
  ["hero-illustration-new.png", "featured-kisan.png", "featured-pan.png", "featured-udyam.png"].forEach((name) => {
    const src = path.join(__dirname, "assets", name);
    const dest = path.join(OUT, "assets", name);
        if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  });

  // Logo + favicon assets
  copyDir(path.join(__dirname, "assets", "logo"), path.join(OUT, "assets", "logo"));
  copyDir(path.join(__dirname, "assets", "favicon"), path.join(OUT, "assets", "favicon"));

  // Image optimization: convert to WebP for performance
  const { execSync } = require("child_process");
  try {
    execSync("node " + path.join(__dirname, "optimize-images.js"), { stdio: "inherit" });
  } catch (e) {
    console.log("Image optimization skipped:", e.message);
  }

  // Admin foundation emit (no public-site impact)
  copyAdmin();
  emitMasterGuideBrowser();
  emitQuestionsAdmin();
  emitFunctions();
  emitSupabase();

  console.log("Build complete ->", OUT);
}

run().catch(function(err) { console.error('Build failed:', err); process.exit(1); });
