// Master Guide Template for Samjho India
// ONE reusable template for all guide categories:
// Government, Documents, Business, Money, Education
//
// Data comes from the Guide schema (admin/schemas/guide.js).
// Sections render only when the corresponding data exists.

const { esc } = require('./layout');
const GUIDE_SCHEMA = require('../../admin/schemas/guide');

const { normalizeGuide } = GUIDE_SCHEMA;

// ---------------------------------------------------------------------------
// Shared render helpers
// ---------------------------------------------------------------------------

var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  var parts = String(dateStr).trim().split('-');
  if (parts.length !== 3) return dateStr;
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10);
  var day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return dateStr;
  return day + ' ' + MONTH_NAMES[month - 1] + ' ' + year;
}

function isToday(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  var now = new Date();
  var today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  return String(dateStr).trim() === today;
}

var NOT_SPECIFIED_PATTERN = /not specified in the official source/i;

function isNotSpecified(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && NOT_SPECIFIED_PATTERN.test(value.trim())) return true;
  if (Array.isArray(value)) {
    if (value.length === 0) return true;
    return value.every(function (item) {
      return item === null || item === undefined || (typeof item === 'string' && NOT_SPECIFIED_PATTERN.test(item.trim()));
    });
  }
  return false;
}

function renderSection(classes, innerHtml) {
  if (!innerHtml || String(innerHtml).trim() === '') return '';
  return '<section class="' + classes + '">' + innerHtml + '</section>';
}

// ---------------------------------------------------------------------------
// Markdown-to-HTML converter for DeepSeek content
// Handles: ## headings, - list items, 1. numbered items, **bold**, paragraphs
// ---------------------------------------------------------------------------
function mdToHtml(text) {
  if (!text || typeof text !== 'string') return '';
  var s = String(text).trim();
  if (!s) return '';

  var lines = s.split('\n');
  var out = [];
  var inUl = false;
  var inOl = false;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();

    // Heading: ## or ### or ####
    var headingMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      var level = Math.min(headingMatch[1].length, 3);
      out.push('<h' + level + '>' + esc(headingMatch[2]) + '</h' + level + '>');
      continue;
    }

    // Unordered list item: - or * or •
    var ulMatch = trimmed.match(/^[-*•]\s+(.+)/);
    if (ulMatch) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push('<li>' + esc(ulMatch[1]) + '</li>');
      continue;
    }

    // Ordered list item: 1. or 2. etc.
    var olMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push('<li>' + esc(olMatch[1]) + '</li>');
      continue;
    }

    // End any open lists
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }

    // Empty line = paragraph break
    if (!trimmed) {
      out.push('');
      continue;
    }

    // Regular paragraph text — handle bold
    var pText = trimmed;
    pText = pText.replace(/\*\*(.+?)\*\*/g, function (m, inner) { return '<strong>' + esc(inner) + '</strong>'; });
    pText = pText.replace(/__(.+?)__/g, function (m, inner) { return '<strong>' + esc(inner) + '</strong>'; });
    // Already escaped above, so re-check for plain text
    if (!pText.includes('<strong>')) {
      pText = esc(pText);
    }
    out.push('<p>' + pText + '</p>');
  }

  if (inUl) out.push('</ul>');
  if (inOl) out.push('</ol>');

  return out.join('\n');
}

function renderProse(text) {
  var html = mdToHtml(text);
  return html ? '<div class="guide-prose">' + html + '</div>' : '';
}

function renderList(items, ordered) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const tag = ordered ? 'ol' : 'ul';
  const rows = items
    .filter((item) => item !== null && item !== undefined && String(item).trim() !== '' && !NOT_SPECIFIED_PATTERN.test(String(item)))
    .map((item) => '<li>' + esc(item) + '</li>')
    .join('');
  if (!rows) return '';
  return '<' + tag + ' class="guide-list">' + rows + '</' + tag + '>';
}

function renderFaqList(faqs) {
  if (!Array.isArray(faqs) || faqs.length === 0) return '';
  const rows = faqs
    .filter((f) => f && (f.q || f.question) && (f.a || f.answer))
    .map((f) => {
      const q = f.q || f.question;
      const a = f.a || f.answer;
      return '<div class="guide-faq__item">' +
        '<h3 class="guide-faq__q">' + esc(q) + '</h3>' +
        '<div class="guide-faq__a">' + esc(a) + '</div>' +
        '</div>';
    })
    .join('');
  if (!rows) return '';
  return '<div class="guide-faq">' + rows + '</div>';
}

function renderSourceList(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return '';
  const rows = sources
    .filter((s) => s && (s.label || s.source_name) && (s.href || s.source_url))
    .map((s) => {
      const label = s.label || s.source_name;
      const href = s.href || s.source_url;
      const desc = s.description || '';
      const descHtml = desc ? '<p class="guide-source__desc">' + esc(desc) + '</p>' : '';
      return '<a class="guide-source" href="' + esc(href) + '" target="_blank" rel="noopener">' +
        '<span class="guide-source__label">' + esc(label) + '</span>' +
        descHtml +
        '</a>';
    })
    .join('');
  if (!rows) return '';
  return '<div class="guide-sources">' + rows + '</div>';
}

// ---------------------------------------------------------------------------
// Section builders — each renders only when its data exists
// ---------------------------------------------------------------------------

function buildBreadcrumb(guide, categoryLabel) {
  if (!guide || (!guide.category && !guide.slug)) return '';
  const items = [{ label: 'Home', href: '/' }];
  if (guide.category) {
    items.push({ label: categoryLabel || guide.category, href: '/guides/' + guide.category + '/' });
  }
  if (guide.title) {
    items.push({ label: guide.title, href: '/guides/' + (guide.slug || '') + '/' });
  }
  const parts = items
    .map((item, i) => {
      const isLast = i === items.length - 1;
      return isLast
        ? '<span>' + esc(item.label) + '</span>'
        : '<a href="' + esc(item.href) + '">' + esc(item.label) + '</a>';
    })
    .join(' &nbsp;/&nbsp; ');
  return '<nav class="guide-breadcrumb" aria-label="Breadcrumb">' + parts + '</nav>';
}

function buildTitle(guide) {
  const title = guide.title || '';
  if (!String(title).trim()) return '';
  return '<h1 class="guide-title">' + esc(title) + '</h1>';
}

function buildHeroImage(guide) {
  const imageUrl = guide.hero_image || guide.heroImage || '';
  if (!imageUrl) return '';
  const alt = guide.title || '';
  const photographer = guide.image_photographer || guide.imagePhotographer || '';
  const photographerUrl = guide.image_photographer_url || guide.imagePhotographerUrl || '';
  let credit = '';
  if (photographer) {
    credit = photographerUrl
      ? '<span class="guide-hero__credit">Photo by <a href="' + esc(photographerUrl) + '" target="_blank" rel="noopener">' + esc(photographer) + '</a> / Pexels</span>'
      : '<span class="guide-hero__credit">Photo by ' + esc(photographer) + ' / Pexels</span>';
  }
  return '<figure class="guide-hero">' +
    '<img src="' + esc(imageUrl) + '" alt="' + esc(alt) + '" class="guide-hero__img" loading="lazy" />' +
    credit +
    '</figure>';
}

function buildLastUpdated(guide) {
  const date = guide.last_updated || guide.lastUpdated || '';
  if (!String(date).trim()) return '';
  const formatted = formatDate(date);
  const newBadge = isToday(date)
    ? ' <span class="guide-new-badge">NEW</span>'
    : '';
  return '<p class="guide-last-updated">Last updated: ' + esc(formatted) + newBadge + '</p>';
}

// ---------------------------------------------------------------------------
// Author block — E-E-A-T signal for Google 2026 + AI Overviews
// ---------------------------------------------------------------------------

var SITE_AUTHOR_NAME = 'Samjho Content Team';
var SITE_AUTHOR_URL = '/about/';
var SITE_AUTHOR_BIO = 'Finance and policy experts with 5+ years of experience helping Indians understand money, documents and government schemes.';

function buildAuthor(guide) {
  return '<div class="article-author">' +
    '<a href="' + SITE_AUTHOR_URL + '" class="article-author__link">' +
    '<div class="article-author__avatar">S</div>' +
    '<div class="article-author__info">' +
    '<div class="article-author__name">' + esc(SITE_AUTHOR_NAME) + '</div>' +
    '<div class="article-author__bio">' + esc(SITE_AUTHOR_BIO) + '</div>' +
    '</div>' +
    '</a>' +
    '</div>';
}

function buildQuickSummary(guide) {
  const summary = guide.summary || guide.quickSummary || '';
  if (Array.isArray(summary)) {
    return renderSection('guide-section guide-section--summary',
      '<h2 class="guide-section__title">Quick Summary</h2>' + renderList(summary, false));
  }
  if (!String(summary).trim()) return '';
  return renderSection('guide-section guide-section--summary',
    '<h2 class="guide-section__title">Quick Summary</h2>' +
    '<p class="guide-summary">' + esc(summary) + '</p>');
}

function buildWhyItMatters(guide) {
  const content = guide.whyMatters || guide.content || '';
  if (Array.isArray(content)) {
    return renderSection('guide-section guide-section--why-matters',
      '<h2 class="guide-section__title">Why It Matters</h2>' + renderList(content, false));
  }
  if (!String(content).trim()) return '';
  return renderSection('guide-section guide-section--why-matters',
    '<h2 class="guide-section__title">Why It Matters</h2>' +
    renderProse(content));
}

function buildEligibility(guide) {
  const value = guide.eligibility || '';
  if (isNotSpecified(value)) return '';
  if (Array.isArray(value)) {
    return renderSection('guide-section guide-section--eligibility',
      '<h2 class="guide-section__title">Eligibility</h2>' + renderList(value, false));
  }
  if (!String(value).trim()) return '';
  return renderSection('guide-section guide-section--eligibility',
    '<h2 class="guide-section__title">Eligibility</h2>' +
    renderProse(value));
}

function buildBenefits(guide) {
  const value = guide.benefits || '';
  if (isNotSpecified(value)) return '';
  if (Array.isArray(value)) {
    return renderSection('guide-section guide-section--benefits',
      '<h2 class="guide-section__title">Benefits</h2>' + renderList(value, false));
  }
  if (!String(value).trim()) return '';
  return renderSection('guide-section guide-section--benefits',
    '<h2 class="guide-section__title">Benefits</h2>' +
    renderProse(value));
}

function buildRequiredDocuments(guide) {
  const value = guide.required_documents || '';
  if (isNotSpecified(value)) return '';
  if (Array.isArray(value)) {
    return renderSection('guide-section guide-section--documents',
      '<h2 class="guide-section__title">Required Documents</h2>' + renderList(value, false));
  }
  if (!String(value).trim()) return '';
  return renderSection('guide-section guide-section--documents',
    '<h2 class="guide-section__title">Required Documents</h2>' +
    renderProse(value));
}

function buildApplicationProcess(guide) {
  const value = guide.application_process || '';
  if (isNotSpecified(value)) return '';
  if (Array.isArray(value)) {
    return renderSection('guide-section guide-section--apply',
      '<h2 class="guide-section__title">How to Apply</h2>' + renderList(value, true));
  }
  if (!String(value).trim()) return '';
  return renderSection('guide-section guide-section--apply',
    '<h2 class="guide-section__title">How to Apply</h2>' +
    renderProse(value));
}

function buildImportantDates(guide) {
  const value = guide.important_dates || '';
  if (isNotSpecified(value)) return '';
  if (Array.isArray(value)) {
    return renderSection('guide-section guide-section--dates',
      '<h2 class="guide-section__title">Important Dates</h2>' + renderList(value, false));
  }
  if (!String(value).trim()) return '';
  return renderSection('guide-section guide-section--dates',
    '<h2 class="guide-section__title">Important Dates</h2>' +
    renderProse(value));
}

function buildCommonMistakes(guide) {
  const value = guide.common_mistakes || guide.commonMistakes || '';
  if (isNotSpecified(value)) return '';
  if (Array.isArray(value)) {
    return renderSection('guide-section guide-section--mistakes',
      '<h2 class="guide-section__title">Common Mistakes</h2>' + renderList(value, false));
  }
  if (!String(value).trim()) return '';
  return renderSection('guide-section guide-section--mistakes',
    '<h2 class="guide-section__title">Common Mistakes</h2>' +
    renderProse(value));
}

function buildFaqs(guide) {
  const value = guide.faqs || guide.faq || '';
  const html = renderFaqList(value);
  if (!html) return '';
  return renderSection('guide-section guide-section--faqs',
    '<h2 class="guide-section__title">FAQs</h2>' + html);
}

function buildOfficialSources(guide) {
  const value = guide.officialReferences || guide.sources || guide.source_ids || '';
  const html = renderSourceList(value);
  if (!html) return '';
  return renderSection('guide-section guide-section--sources',
    '<h2 class="guide-section__title">Official Sources</h2>' + html);
}

function buildDisclaimer() {
  return renderSection('guide-section guide-section--disclaimer',
    '<h2 class="guide-section__title">Disclaimer</h2>' +
    '<div class="guide-prose"><p>Samjho is an independent informational resource and is not a government website. ' +
    'Content is for general understanding only and is not financial, legal, tax or professional advice. ' +
    'Rules, rates and eligibility can change; always verify current details with official sources before acting.</p></div>');
}

// ---------------------------------------------------------------------------
// Related Guides — picks up to 3 guides from same category (or cross-category fallback)
// ---------------------------------------------------------------------------
function buildRelatedGuides(guide, options) {
  options = options || {};
  const allGuides = options.allGuides || [];
  const currentSlug = guide.slug || '';
  const currentCat = (guide.category || guide.primary_category || '').toLowerCase();
  if (!allGuides.length || !currentSlug) return '';
  const sameCat = allGuides.filter(function(g) {
    return g.slug !== currentSlug && (g.category || '').toLowerCase() === currentCat;
  });
  const fallback = allGuides.filter(function(g) { return g.slug !== currentSlug; });
  const picks = (sameCat.length >= 2 ? sameCat : fallback).slice(0, 3);
  if (!picks.length) return '';
  const cards = picks.map(function(g) {
    return '<a class="card" href="/guides/' + esc(g.slug) + '/">' +
      '<span class="card-eyebrow">Guide</span>' +
      '<h3>' + esc(g.title || 'Guide') + '</h3>' +
      '<p>' + esc(g.summary || 'Read the simple explanation.') + '</p>' +
    '</a>';
  }).join('');
  return renderSection('guide-section guide-section--related',
    '<h2 class="guide-section__title">Related Guides</h2>' +
    '<div class="related-grid">' + cards + '</div>');
}

// ---------------------------------------------------------------------------
// Master renderer — ONE reusable template for every guide category
// ---------------------------------------------------------------------------

function renderMasterGuide(guide = {}, options = {}) {
  const normalized = normalizeGuide(guide);
  const categoryLabel = options.categoryLabel || normalized.category || 'Guide';
  const canonical = options.canonical || ('/guides/' + (normalized.slug || '') + '/');
  const summaryText = typeof normalized.summary === 'string' ? normalized.summary : '';
  const description =
    options.description ||
    guide.metaDescription ||
    summaryText ||
    '';

  // Determine content_type from guide or options
  const contentType = (guide.content_type || options.contentType || '').toLowerCase();

  // For 'press release' type, only show certain sections
  const isPressRelease = contentType === 'press release';

  const sections = [
    buildBreadcrumb(normalized, categoryLabel),
    buildTitle(normalized),
    buildHeroImage(normalized),
    buildLastUpdated(normalized),
    buildAuthor(normalized),
    buildQuickSummary(normalized),
    buildWhyItMatters(normalized),
  ];

  if (!isPressRelease) {
    // Scheme / other types: show all sections (empty ones filtered below)
    sections.push(buildEligibility(normalized));
    sections.push(buildBenefits(normalized));
    sections.push(buildRequiredDocuments(normalized));
    sections.push(buildApplicationProcess(normalized));
  }

  sections.push(buildImportantDates(normalized));

  if (!isPressRelease) {
    sections.push(buildCommonMistakes(normalized));
  }

  sections.push(buildFaqs(normalized));
  sections.push(buildOfficialSources(normalized));
  sections.push(buildDisclaimer());
  sections.push(buildRelatedGuides(normalized, options));

  const bodyHtml = sections
    .filter((s) => s && String(s).trim() !== '')
    .join('\n  ');

  return {
    html: bodyHtml,
    title: guide.metaTitle || normalized.title || 'Guide',
    description,
    canonical,
    structuredData: options.structuredData || [],
  };
}

module.exports = {
  renderMasterGuide,
  buildBreadcrumb,
  buildTitle,
  buildLastUpdated,
  buildQuickSummary,
  buildWhyItMatters,
  buildEligibility,
  buildBenefits,
  buildRequiredDocuments,
  buildApplicationProcess,
  buildImportantDates,
  buildCommonMistakes,
  buildFaqs,
  buildOfficialSources,
  buildDisclaimer,
  buildRelatedGuides,
  renderSourceList,
  renderFaqList,
  renderList,
  renderSection,
  formatDate,
  isToday,
  isNotSpecified,
  buildAuthor,
  GUIDE_SCHEMA,
};
