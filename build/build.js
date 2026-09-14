const fs = require("fs");
const path = require("path");

const site = require("./data/site");
const articles = require("./data/articles");
const calculators = require("./data/calculators");
const schemes = require("./data/schemes");
const { renderPage, esc } = require("./templates/layout");

const OUT = path.join(__dirname, "..", "dist");

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
    government: '<img src="assets/featured-kisan.png" alt="PM Kisan Yojana" />',
    documents: '<img src="assets/featured-pan.png" alt="PAN Card" />',
    business: '<img src="assets/featured-udyam.png" alt="Udyam Registration" />',
  };

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
                <img src="assets/hero-illustration-new.png" alt="India Gate, Parliament and India map illustration" class="hero-illustration-img" />
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
      stylesheetHref: "assets/css/style.css",
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
          description: site.defaultDescription,
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
      title: "Explore topics — Samjho",
      description: "Browse Samjho by government, documents, business, money and education topics.",
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
function buildGovernmentPage() {
  const govHub = site.hubs.find((h) => h.slug === "government");
  const description = govHub ? govHub.description : "Government schemes, services and documents explained in plain Hindi and English.";

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
            <span class="gov-pill gov-pill--teal">● LIVE · 127 YOJANAS</span>
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
            <h2>Popular Yojana · <span>6 results</span></h2>
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
      name: "Government — Samjho",
      description,
      url: canonical,
    }),
  ];

  write(
    "government/index.html",
    renderPage({
      title: "Government — Samjho",
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
  const docHub = site.hubs.find((h) => h.slug === "documents");
  const description = docHub ? docHub.description : "Apply, update and download important documents — Aadhaar, PAN, Passport, Driving Licence and more.";

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
            <span class="gov-pill gov-pill--teal">● LIVE · 12 DOCUMENTS</span>
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
            <h2>Popular Documents · <span>6 results</span></h2>
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
      name: "Documents — Samjho",
      description,
      url: canonical,
    }),
  ];

  write(
    "documents/index.html",
    renderPage({
      title: "Documents — Samjho",
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
      <div class="gov-hero__pills"><span class="gov-pill gov-pill--teal">● LIVE · 7 BUSINESS GUIDES</span><span class="gov-pill gov-pill--orange">HINDI + ENGLISH</span></div>
      <h1 class="gov-hero__title">Business <span class="gov-hero__title-grey">— Register, Comply, Grow</span></h1>
      <p class="gov-hero__hindi">व्यापार के लिए सरकारी registration, licence और compliance — सब आसान भाषा में</p>
      <p class="gov-hero__desc">Udyam, GST, Shop Act, licences — small business ke liye zaroori registrations. Step-by-step process simple Hindi me.</p>
    </div><div class="gov-hero__right"><div class="gov-quick-check"><h2 class="gov-quick-check__heading">Quick Check</h2><div class="gov-quick-check__stats">
      <div class="gov-stat-card"><span class="gov-stat-card__label">UDYAM REGISTRATION</span><span class="gov-stat-card__value">Free</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill" style="width:90%"></div></div></div>
      <div class="gov-stat-card"><span class="gov-stat-card__label">GST REGISTRATION</span><span class="gov-stat-card__value">7 Days</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill gov-stat-card__fill--teal" style="width:60%"></div></div></div>
      <div class="gov-stat-card"><span class="gov-stat-card__label">SHOP ACT</span><span class="gov-stat-card__value">State-wise</span><div class="gov-stat-card__bar"><div class="gov-stat-card__fill gov-stat-card__fill--green" style="width:75%"></div></div></div>
    </div><div class="gov-tip"><div class="gov-tip__content"><span class="gov-tip__label">Aaj ka Tip</span><p>Udyam registration free hai. MSME benefits ke liye zaroor karein.</p></div><button class="gov-tip__btn" aria-label="Check now">↻</button></div></div></div></div></section>
    <section class="gov-filters"><div class="container"><div class="gov-filters__row"><span class="gov-chip gov-chip--active">All Business ●</span><span class="gov-chip">Registration</span><span class="gov-chip">Licence</span><span class="gov-chip">Tax</span><span class="gov-chip">Compliance</span><span class="gov-chip">MSME</span></div><p class="gov-filters__trust">Trusted by 4.21L+ Indians this month · No ads, no clutter</p></div></section>
    <section class="gov-content"><div class="container gov-content__grid"><div class="gov-main"><div class="gov-main__header"><h2>Popular Business Guides · <span>6 results</span></h2><span class="gov-main__sort">Sorted by helpful</span></div><div class="gov-card-grid">${cardsHtml}</div></div><aside class="gov-sidebar"><div class="gov-sidebar-widget gov-trending"><h3 class="gov-sidebar-widget__heading">🔥 Trending This Week <span class="gov-live-badge">Live</span></h3>${trendingHtml}<a href="#" class="gov-trending__more">View All Trending →</a></div><div class="gov-sidebar-widget gov-newsletter"><h3 class="gov-newsletter__heading">Business updates seedha apne inbox mein.</h3><p class="gov-newsletter__desc">Har Monday, new business guides + useful links. No spam, sirf kaam ki baat.</p><form class="gov-newsletter__form"><input type="email" placeholder="Your email" aria-label="Email for business updates" /><button type="submit">Join</button></form><p class="gov-newsletter__note">12,400+ log jud chuke hain · Unsubscribe anytime</p></div><div class="gov-sidebar-wYour email" aria-label="Email for money updates" /><button type="submit">Join</button></form><p class="gov-newsletter__note">12,400+ log jud chuke hain · Unsubscribe anytime</p></div><div class="gov-sidebar-widget gov-categories"><h3 class="gov-sidebar-widget__heading">CATEGORIES</h3><div class="gov-categories__tags">${categoryTagsHtml}</div></div><div class="gov-sidebar-widget gov-help"><p>Need help? WhatsApp par 'Hi' bhejo, hum form bharna me help denge.</p><a href="#" class="gov-help__link">Chat now →</a></div></aside></div></section>
    <section class="gov-banner-section"><div class="container"><div class="gov-banner"><div class="gov-banner__text"><span class="gov-banner__small">ABOUT SAMJHO INDIA</span><h2>Samjho India is an independent information platform. We explain government schemes and services in simple language — so every Indian can understand and act.</h2></div><a href="/about/" class="gov-banner__btn">Learn More →</a></div></div></section>
  </div>`;

  const canonical = site.domain + "/money/";
  const structuredData = [breadcrumbSchema([{ label: "Home", href: "/" }, { label: "Money", href: "/money/" }]), webPageSchema({ name: "Money — Samjho", description, url: canonical })];
  write("money/index.html", renderPage({ title: "Money — Samjho", description, canonical, activeHref: "/money/", bodyHtml: body, structuredData }));
}


}

// ------------------------------------------------------------------ GUIDES INDEX
function buildGuidesIndex() {
  const chips = site.categories
    .map((c) => `<a href="#${c.slug}">${esc(c.label)}</a>`)
    .join("");

  const sections = site.categories
    .map((c) => {
      const items = articles.filter((a) => a.category === c.slug);
      if (items.length === 0) return "";
      const cards = items
        .map((a) => card({ href: guideUrl(a.slug), title: a.title, desc: a.shortAnswer }))
        .join("");
      return `<div class="section-head" id="${c.slug}" style="margin-top:36px;">
        <h2>${esc(c.label)}</h2>
        <p>${esc(c.description)}</p>
      </div>
      <div class="card-grid card-grid--3">${cards}</div>`;
    })
    .join("");

  const body = `
  <div class="page-head container">
    <h1>All guides</h1>
    <p>Plain-English explanations for the questions Indian students, employees and families run into most.</p>
  </div>
  <section class="section">
    <div class="container">
      <div class="tag-row">${chips}</div>
      <h2>Browse all guides by category</h2>
      ${sections}
    </div>
  </section>
  `;

  write(
    "guides/index.html",
    renderPage({
      title: "Guides — Samjho",
      description: "Read plain-English Samjho guides about GST, credit scores, CGPA, documents, loans and everyday decisions.",
      canonical: site.domain + "/guides/",
      activeHref: "/guides/",
      bodyHtml: body,
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
      ? `<div class="related-grid">${a.relatedTools
          .map((t) => card({ href: t.href, eyebrow: "Calculator", title: t.title, desc: "Work out your own numbers for this topic." }))
          .join("")}</div>`
      : `<p class="empty-note">There isn't a dedicated calculator for this topic yet — <a href="/calculators/">browse all calculators</a> in the meantime.</p>`;

  const guidesHtml = `<div class="related-grid">${a.relatedGuides
    .map((g) => card({ href: g.href, eyebrow: "Guide", title: g.title, desc: "Read the simple explanation." }))
    .join("")}</div>`;

  const referencesHtml = a.officialReferences
    ? `<section>
      <h2>${a.slug === "what-is-uan" ? "Official EPFO References" : "Official references"}</h2>
      <ul class="point-list">${a.officialReferences
        .map((r) => `<li><a href="${r.href}">${esc(r.label)}</a> — ${esc(r.description)}</li>`)
        .join("")}</ul>
    </section>`
    : "";
  const rateNoticeHtml = a.rateNotice
    ? `<p class="article-notice" role="note"><strong>Rules and rates can change:</strong> ${esc(a.rateNotice)}</p>`
    : "";

  const body = `
  <div class="article-head container">
    ${breadcrumb([
      { label: "Home", href: "/" },
      { label: "Guides", href: "/guides/" },
      { label: a.title, href: guideUrl(a.slug) },
    ])}
    <h1>${esc(a.title)}</h1>
    <div class="short-answer"><p>${esc(a.shortAnswer)}</p></div>
  </div>

  <div class="article-body container">
    <section>
      <h2>Simple explanation</h2>
      ${a.simpleExplanation.map((p) => `<p>${esc(p)}</p>`).join("")}
    </section>

    <section>
      <h2>Why does it matter?</h2>
      <p>${esc(a.whyMatters)}</p>
    </section>

    <section>
      <h2>Example</h2>
      <div class="example-box">
        <span class="card-eyebrow">In numbers</span>
        <p>${esc(a.example)}</p>
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
      ${section.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}
    </section>`).join("") : ""}

    ${adSlot("incontent", "Advertisement space")}

    <section>
      <h2>Important things to know</h2>
      <ul class="point-list">${a.importantPoints.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    </section>

    <section>
      <h2>Common mistakes</h2>
      <ul class="mistake-list">${a.commonMistakes.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
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
      articleSection: categoryLabel(a.category),
      ...(["what-is-credit-score", "what-is-uan"].includes(a.slug) ? { mainEntityOfPage: { "@type": "WebPage", "@id": canonical } } : {}),
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
  ];

  write(
    `guides/${a.slug}/index.html`,
    renderPage({
      title: `${a.title} — Samjho`,
      description: compactDescription(a.shortAnswer),
      canonical,
      ogType: "article",
      activeHref: "/guides/",
      bodyHtml: body,
      structuredData,
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
      { label: "Farmer Schemes", href: "/government/farmer-schemes/" },
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
      { label: "Farmer Schemes", href: "/government/farmer-schemes/" },
      { label: s.title, href: schemeUrl(s.slug) },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: s.title,
      description: compactDescription(s.shortAnswer),
      url: canonical,
      articleSection: s.schemeCategory || "Government Scheme",
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
      title: `${s.title} — Samjho`,
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
  `;

  write(
    "calculators/index.html",
    renderPage({
      title: "Calculators — Samjho",
      description: "Use free, private calculators for percentage, EMI, GST, age, discount and simple interest calculations.",
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

function buildCalculatorPage(c) {
  const formFields = CALC_FORMS[c.slug]();
  const relatedCalcs = calculators.filter((x) => x.slug !== c.slug && x.category === c.category).slice(0, 2);

  const body = `
  <div class="article-head container">
    ${breadcrumb([
      { label: "Home", href: "/" },
      { label: "Calculators", href: "/calculators/" },
      { label: c.title, href: calcUrl(c.slug) },
    ])}
    <h1>${esc(c.title)}</h1>
    <div class="short-answer"><p>${esc(c.description)}</p></div>
  </div>

  <div class="article-body container">
    <div class="calc-shell">
      <form class="calc-form" data-calc="${c.slug}" novalidate>
        ${formFields}
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Calculate</button>
          <button type="reset" class="btn btn-secondary">Reset</button>
        </div>
      </form>
      <div class="calc-result">
        <h2 style="margin-bottom:14px;">Result</h2>
        <div id="resultBody">
          <p class="result-placeholder">Enter values and press Calculate to see your result here.</p>
        </div>
      </div>
    </div>

    ${adSlot("incontent", "Advertisement space")}

    <div class="calc-explainer">
      <h2>How this is calculated</h2>
      <p>${esc(CALC_EXPLAINERS[c.slug])}</p>
      ${relatedCalcs.length ? `<h2 style="margin-top:28px;">Related calculators</h2><div class="related-grid">${relatedCalcs
        .map((r) => card({ href: calcUrl(r.slug), eyebrow: "Calculator", title: r.title, desc: r.short }))
        .join("")}</div>` : ""}
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
  ];

  write(
    `calculators/${c.slug}/index.html`,
    renderPage({
      title: `${c.title} — Samjho`,
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
  const body = `
  <div class="page-head container">
    <h1>${esc(heading)}</h1>
  </div>
  <section class="section prose">
    <div class="container">
      ${sectionsHtml}
    </div>
  </section>
  `;
  write(
    `${slug}/index.html`,
    renderPage({
      title: `${title} — Samjho`,
      description,
      canonical: `${site.domain}/${slug}/`,
      activeHref: slug === "about" ? "/about/" : "",
      bodyHtml: body,
      structuredData: [webPageSchema({
        name: heading,
        description,
        url: `${site.domain}/${slug}/`,
      })],
    })
  );
}

function buildAbout() {
  buildStaticPage({
    slug: "about",
    title: "About Us",
    heading: "About Samjho",
    description: "Why Samjho exists and how it explains everyday Indian money, document and education questions.",
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
    title: "Contact Us",
    heading: "Contact Samjho",
    description: "How to get in touch with Samjho about a guide, a calculator, or a correction.",
    sectionsHtml: `
      <section>
        <p>Samjho is a small, independent project. If you've spotted something incorrect, have a topic you'd like explained, or found a calculator behaving unexpectedly, we'd like to know.</p>
      </section>
      <section>
        <h2>Email</h2>
        <p>Write to us at <a href="mailto:hello@samjho.in">hello@samjho.in</a> and we'll get back to you as soon as we can.</p>
      </section>
      <section>
        <h2>Before you write in</h2>
        <ul>
          <li>For a correction, please mention the exact guide or calculator page.</li>
          <li>For a new topic request, a short description of the question you'd like explained is enough.</li>
          <li>Samjho cannot advise on your personal financial, tax or legal situation — for that, please consult a qualified professional or the relevant official authority.</li>
        </ul>
      </section>
    `,
  });
}

function buildPrivacy() {
  buildStaticPage({
    slug: "privacy",
    title: "Privacy Policy",
    heading: "Privacy Policy",
    description: "How Samjho handles data. In short: calculators run in your browser and nothing you type into them is sent anywhere.",
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
    title: "Terms & Conditions",
    heading: "Terms & Conditions",
    description: "The terms for using Samjho's guides and calculators.",
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
    heading: "Disclaimer",
    description: "Samjho is an independent resource and is not a government website.",
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
      stylesheetHref: "assets/css/style.css",
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
  const js = `window.SAMJHO_SEARCH_INDEX = ${JSON.stringify(entries)};\n`;
  write("assets/js/search-data.js", js);
}

// ------------------------------------------------------------------ SEO FILES
function buildSitemap() {
  const urls = [
    "/",
    "/explore/",
    "/guides/",
    "/calculators/",
    "/about/",
    "/contact/",
    "/privacy/",
    "/terms/",
    "/disclaimer/",
    ...site.hubs.map((h) => hubUrl(h.slug)),
    ...articles.map((a) => guideUrl(a.slug)),
    ...calculators.map((c) => calcUrl(c.slug)),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${site.domain}${u}</loc></url>`).join("\n")}
</urlset>
`;
  write("sitemap.xml", body);
}

function buildRobots() {
  const body = `User-agent: *
Allow: /

Sitemap: ${site.domain}/sitemap.xml
`;
  write("robots.txt", body);
}

// ------------------------------------------------------------------ RUN
function run() {
  if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  buildSearchIndex();
  buildHome();
  buildExplore();
  site.hubs.filter((h) => h.slug !== "government" && h.slug !== "documents" && h.slug !== "business" && h.slug !== "money").forEach(buildCategoryHub);
  buildGovernmentPage();
  buildDocumentsPage();
  buildBusinessPage();
  buildMoneyPage();
  buildGuidesIndex();
  articles.forEach(buildGuideArticle);
  schemes.forEach(buildSchemeArticle);
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
    path.join(__dirname, "assets", "hero-illustration-new.png"),
    path.join(OUT, "assets", "hero-illustration-new.png")
  );
  fs.copyFileSync(
    path.join(__dirname, "assets", "featured-kisan.png"),
    path.join(OUT, "assets", "featured-kisan.png")
  );
  fs.copyFileSync(
    path.join(__dirname, "assets", "featured-pan.png"),
    path.join(OUT, "assets", "featured-pan.png")
  );
  fs.copyFileSync(
    path.join(__dirname, "assets", "featured-udyam.png"),
    path.join(OUT, "assets", "featured-udyam.png")
  );

  console.log("Build complete ->", OUT);
}

run();
