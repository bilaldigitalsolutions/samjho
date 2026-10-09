// Master Guide Template for Samjho India
// ONE reusable template for all guide categories:
// Government, Documents, Business, Money, Education
//
// Data comes from the Guide schema (admin/schemas/guide.js).
// Sections render only when the corresponding data exists.

const { esc } = require('./layout');
// SiteScope FIX 3 — emit intrinsic width/height on hero images (CLS).
const { dimAttrs } = require('../image-dims');
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

// ---------------------------------------------------------------------------
// Magazine layout helpers — top bar, hero meta, dates, sidebar widgets
// ---------------------------------------------------------------------------

// "government" / "Government" -> "GOVERNMENT" (top bar + category pill).
function upperLabel(value) {
  var t = toTitleCase(value == null ? '' : value);
  return t ? t.toUpperCase() : '';
}

// Rough reading time: words / 200 wpm, minimum 1 minute.
function readMinutes(guide) {
  var text = [
    guide && guide.content ? guide.content : '',
    guide && guide.content_html ? guide.content_html : '',
    guide && typeof guide.summary === 'string' ? guide.summary : ''
  ].join(' ').replace(/<[^>]+>/g, ' ');
  var words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// Full-width notification bar, rendered ABOVE the site header (layout.js).
function buildTopBar(guide, categoryUpper) {
  var date = guide.last_updated || guide.lastUpdated || '';
  var right = date
    ? '<span class="ag-topbar__meta">Updated ' + esc(formatDate(date)) + '</span>'
    : '';
  return '<div class="ag-topbar"><div class="container ag-topbar__inner">' +
    '<span class="ag-topbar__live">LIVE FROM BHARAT' +
    '<span class="ag-topbar__dot"> &bull; </span>' + esc(categoryUpper || 'INDIA') + ' UPDATE</span>' +
    right + '</div></div>';
}

// Hero dek: the SEO description when it differs from the summary, otherwise
// only the first sentence of the summary (never a full duplicate on the page).
function buildDek(guide, summaryText) {
  var meta = String(guide.metaDescription || guide.shortAnswer || '').trim();
  var summary = String(summaryText || '').trim();
  if (meta && meta !== summary) return meta;
  if (!summary) return '';
  var m = summary.match(/^[^.!?]+[.!?]/);
  var first = m ? m[0].trim() : summary;
  if (first.length > 220) first = first.slice(0, 219).replace(/\s+\S*$/, '\u2026');
  return first;
}

// Read-time + last-updated row under the hero title. Always emits
// .guide-last-updated — the structure verifier requires that class.
function buildHeroMeta(guide) {
  var date = guide.last_updated || guide.lastUpdated || '';
  var mins = readMinutes(guide);
  if (!date) {
    return '<div class="ag-hero__meta"><p class="guide-last-updated">' + mins + ' min read</p></div>';
  }
  var badge = isToday(date) ? ' <span class="guide-new-badge">NEW</span>' : '';
  return '<div class="ag-hero__meta">' +
    '<span class="ag-meta__read">' + mins + ' min read</span>' +
    '<span class="ag-meta__dot" aria-hidden="true">&bull;</span>' +
    '<p class="guide-last-updated">Last updated: ' + esc(formatDate(date)) + badge + '</p>' +
    '</div>';
}

// important_dates arrives as an array (of strings or {date,label,note}) or as
// one string. Normalise to [{date, text, note}]. The dash between the date and
// its description is a separator, not content.
function parseDateEntries(value) {
  if (isNotSpecified(value)) return [];
  var list = Array.isArray(value) ? value : String(value).split(/\r?\n/);
  return list
    .map(function (item) {
      if (item === null || item === undefined) return null;
      if (typeof item === 'object') {
        var d = item.date ? String(item.date) : '';
        var t = item.label ? String(item.label) : (item.note ? String(item.note) : d);
        var n = item.label && item.note ? String(item.note) : '';
        if (!t) return null;
        if (t === d) d = '';
        return { date: d, text: t, note: n };
      }
      var raw = String(item).trim();
      if (!raw) return null;
      var parts = raw.split(/\s+[\u2013\u2014]\s+/);
      if (parts.length > 1) return { date: parts[0], text: parts.slice(1).join(' '), note: '' };
      var hm = raw.match(/^(.{4,60}?)\s+-\s+(.+)$/);
      if (hm && /\d/.test(hm[1]) && /[a-z]/i.test(hm[1])) {
        return { date: hm[1], text: hm[2], note: '' };
      }
      return { date: '', text: raw, note: '' };
    })
    .filter(function (e) { return e && e.text; });
}

// Timeline with a teal dot + navy date chip per entry.
function renderTimeline(entries) {
  if (!entries.length) return '';
  return '<ol class="ag-timeline">' + entries.map(function (e) {
    var chip = e.date ? '<span class="ag-timeline__date">' + esc(e.date) + '</span>' : '';
    var note = e.note ? '<span class="ag-timeline__note">' + esc(e.note) + '</span>' : '';
    return '<li class="ag-timeline__item">' + chip +
      '<span class="ag-timeline__text">' + esc(e.text) + '</span>' + note + '</li>';
  }).join('') + '</ol>';
}

// Give every H2 a stable #sec-N anchor and collect TOC entries in document
// order. "Disclaimer" / "Related Guides" are excluded — the reference design
// ends the TOC at the last real content section.
function stampToc(mainHtml) {
  var toc = [];
  var n = 0;
  var EXCLUDE = /^(disclaimer|related guides)$/i;
  var html = String(mainHtml).replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/g, function (m, attrs, inner) {
    if (/\sid=/.test(attrs)) return m;
    n += 1;
    var id = 'sec-' + n;
    var label = headingText(inner);
    if (label && !EXCLUDE.test(label)) toc.push({ id: id, label: label });
    return '<h2' + attrs + ' id="' + id + '">' + inner + '</h2>';
  });
  return { html: html, toc: toc.slice(0, 14) };
}

function buildTocWidget(tocItems) {
  if (!tocItems || !tocItems.length) return '';
  var links = tocItems.map(function (item) {
    return '<a href="#' + item.id + '">' + esc(item.label) + '</a>';
  }).join('');
  return '<details class="ag-widget" open>' +
    '<summary class="ag-widget__head">On this page</summary>' +
    '<div class="ag-widget__body"><nav class="guide-sidebar__toc">' + links + '</nav></div>' +
    '</details>';
}

function buildDatesWidget(tocItems, entries) {
  var target = '';
  (tocItems || []).forEach(function (i) {
    if (/^important dates$/i.test(i.label)) target = i.id;
  });
  var dated = (entries || []).filter(function (e) { return e.date; }).slice(0, 3);
  if (!dated.length && !target) return '';
  var items = dated.map(function (e) {
    return '<li><span class="ag-sdates__date">' + esc(e.date) + '</span></li>';
  }).join('');
  var more = target
    ? '<a class="ag-widget__link" href="#' + target + '">All important dates</a>'
    : '';
  if (!items && !more) return '';
  return '<details class="ag-widget" open>' +
    '<summary class="ag-widget__head">Important dates</summary>' +
    '<div class="ag-widget__body">' +
    (items ? '<ul class="ag-sdates">' + items + '</ul>' : '') + more +
    '</div></details>';
}

function buildShareWidget(absUrl, title) {
  // Campaign params ride inside the shared URL, so visits from a share are
  // attributed (utm_source per network, utm_medium per action type).
  function shareUrl(source, medium) {
    var sep = absUrl.indexOf("?") === -1 ? "?" : "&";
    return encodeURIComponent(absUrl + sep + "utm_source=" + source + "&utm_medium=" + medium);
  }
  var t = encodeURIComponent(title || '');
  var wa = 'https://wa.me/?text=' + t + '%20' + shareUrl('whatsapp', 'share');
  var tw = 'https://twitter.com/intent/tweet?url=' + shareUrl('twitter', 'social') + '&amp;text=' + t;
  var li = 'https://www.linkedin.com/sharing/share-offsite/?url=' + shareUrl('linkedin', 'social');
  return '<details class="ag-widget" open>' +
    '<summary class="ag-widget__head">Share this article</summary>' +
    '<div class="ag-widget__body"><div class="ag-share">' +
    '<a class="ag-share__btn ag-share__btn--wa" href="' + wa + '" target="_blank" rel="noopener" aria-label="Share on WhatsApp">' +
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg><span>WhatsApp</span></a>' +
    '<a class="ag-share__btn ag-share__btn--x" href="' + tw + '" target="_blank" rel="noopener" aria-label="Share on X">' +
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg><span>X</span></a>' +
    '<a class="ag-share__btn ag-share__btn--in" href="' + li + '" target="_blank" rel="noopener" aria-label="Share on LinkedIn">' +
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.002-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 110-4.124 2.062 2.062 0 010 4.124zM7.119 20.452H3.555V9h3.564v11.452z"/></svg><span>LinkedIn</span></a>' +
    '</div></div></details>';
}

function buildAdWidget() {
  var site = null;
  try { site = require('../data/site'); } catch (e) { site = null; }
  var client = (site && site.adsense && site.adsense.publisherId) || 'ca-pub-6197766330959347';
  var slot = (site && site.adsense && site.adsense.slots && (site.adsense.slots.sidebar || site.adsense.slots.inContent)) || '';
  var slotAttr = slot ? ' data-ad-slot="' + slot + '"' : '';
  return '<div class="ag-widget ag-widget--ad"><div class="ag-widget__body">' +
    '<ins class="adsbygoogle" style="display:block" data-ad-client="' + client + '"' + slotAttr + ' data-ad-format="auto" data-full-width-responsive="true"></ins>' +
    '<scr' + 'ipt>(adsbygoogle = window.adsbygoogle || []).push({});</scr' + 'ipt>' +
    '</div></div>';
}

function buildNewsletterWidget() {
  return '<details class="ag-widget ag-widget--news" open>' +
    '<summary class="ag-widget__head">Stay updated</summary>' +
    '<div class="ag-widget__body">' +
    '<p class="ag-widget__text">Get the week&rsquo;s most useful explainers in your inbox.</p>' +
    '<form class="ag-newsletter-form">' +
    '<input type="email" placeholder="Enter your email" aria-label="Email for newsletter" required />' +
    '<button type="submit">Subscribe</button>' +
    '</form>' +
    '<p class="ag-widget__note">Join our newsletter for weekly updates &middot; No spam, unsubscribe anytime</p>' +
    '</div></details>';
}

function renderSection(classes, innerHtml) {
  if (!innerHtml || String(innerHtml).trim() === '') return '';
  return '<section class="' + classes + '">' + innerHtml + '</section>';
}

// ---------------------------------------------------------------------------
// Heading de-duplication (template heading vs markdown heading clash)
// ---------------------------------------------------------------------------
// The template renders its own H2 section titles (Quick Summary, Why It
// Matters, Important Dates, ...). When the article markdown also contains a
// heading with the same name, the page ends up with the heading twice
// (e.g. H2 "Important Dates" from the template + H2 "Important Dates" from
// the markdown). We strip the markdown copy and keep its body text.
function normHeading(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headingText(match) {
  return String(match == null ? '' : match)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Remove any <h2>/<h3>/<h4> whose text matches one of the reserved titles.
// Only the heading element is removed — the paragraph body underneath it is
// kept, so no content or meaning is lost.
function stripReservedHeadings(html, reservedTitles) {
  if (!html || !reservedTitles || !reservedTitles.length) return html;
  var reserved = {};
  reservedTitles.forEach(function (t) { reserved[normHeading(t)] = true; });
  return html.replace(/<(h[2-4])>([\s\S]*?)<\/\1>/gi, function (m, tag, inner) {
    var key = normHeading(headingText(inner));
    if (key && reserved[key]) return '';
    return m;
  });
}

// ---------------------------------------------------------------------------
// Markdown-to-HTML converter for DeepSeek content
// Handles: ## headings, - list items, 1. numbered items, **bold**,
//          [label](https://...) links, paragraphs
// ---------------------------------------------------------------------------

// Escape first, then apply inline markup, so plain text is never double
// escaped and links/bold can be mixed safely.
function inlineHtml(s) {
  var out = esc(s);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (m, label, href) {
    return '<a href="' + href + '" target="_blank" rel="noopener">' + label + '</a>';
  });
  out = out.replace(/\*\*(.+?)\*\*/g, function (m, inner) { return '<strong>' + inner + '</strong>'; });
  out = out.replace(/__(.+?)__/g, function (m, inner) { return '<strong>' + inner + '</strong>'; });
  return out;
}

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
      out.push('<li>' + inlineHtml(ulMatch[1]) + '</li>');
      continue;
    }

    // Bold-only line used as a pseudo-heading: **Why It Matters** etc.
    var boldOnly = trimmed.match(/^\*\*(.+?)\*\*$/);
    if (boldOnly) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      var norm = boldOnly[1].trim().toLowerCase();
      if (norm === 'why it matters' || norm === 'what happened' || norm === 'key points') {
        out.push('<h3>' + esc(boldOnly[1].trim()) + '</h3>');
      } else {
        out.push('<p><strong>' + esc(boldOnly[1].trim()) + '</strong></p>');
      }
      continue;
    }
    // Ordered list item: 1. or 2. etc.
    var olMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push('<li>' + inlineHtml(olMatch[1]) + '</li>');
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

    // Regular paragraph text — inline links, then bold
    out.push('<p>' + inlineHtml(trimmed) + '</p>');
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
    .map((f, i) => {
      const q = f.q || f.question;
      const a = f.a || f.answer;
      // Native <details> = accordion with zero JS; first item ships open to
      // match the reference design. FAQPage schema is built from the data in
      // build.js, so the markup change does not affect structured data.
      return '<details class="guide-faq__item"' + (i === 0 ? ' open' : '') + '>' +
        '<summary class="guide-faq__q">' + esc(q) + '</summary>' +
        '<div class="guide-faq__a">' + esc(a) + '</div>' +
        '</details>';
    })
    .join('');
  if (!rows) return '';
  return '<div class="guide-faq">' + rows + '</div>';
}

// Friendly labels for well-known official hosts used as plain URLs.
var HOST_LABELS = {
  "pib.gov.in": "PIB — Original Press Release",
  "pmindia.gov.in": "PMO India",
  "www.pmindia.gov.in": "PMO India",
  "rbi.org.in": "Reserve Bank of India",
  "www.rbi.org.in": "Reserve Bank of India",
  "sebi.gov.in": "SEBI — Securities and Exchange Board of India",
  "www.sebi.gov.in": "SEBI — Securities and Exchange Board of India",
  "epfindia.gov.in": "EPFO — Employees' Provident Fund Organisation",
  "www.epfindia.gov.in": "EPFO — Employees' Provident Fund Organisation",
  "dgft.gov.in": "DGFT — Directorate General of Foreign Trade",
  "www.dgft.gov.in": "DGFT — Directorate General of Foreign Trade",
  "cersai.org.in": "CERSAI — Central KYC Registry",
  "www.cersai.org.in": "CERSAI — Central KYC Registry",
  "india.gov.in": "National Portal of India",
  "www.india.gov.in": "National Portal of India",
  "mygov.in": "MyGov India",
  "www.mygov.in": "MyGov India",
};

function sourceLabelFromUrl(href) {
  var host = "";
  try { host = new URL(href).hostname.toLowerCase(); }
  catch (e) { host = String(href).replace(/^https?:\/\//i, "").split("/")[0].toLowerCase(); }
  if (HOST_LABELS[host]) return HOST_LABELS[host];
  if (/\.gov\.in$|\.nic\.in$/.test(host)) return "Official source — " + host;
  return host || "Official source";
}

// Accept both rich entries ({label, href, description}) and plain URL strings
// (the shape stored in source_ids), so every article shows real outbound links.
function normalizeSourceList(sources) {
  if (!sources) return [];
  var list = Array.isArray(sources) ? sources : [sources];
  return list.map(function (s) {
    if (typeof s === "string") {
      var href = s.trim();
      if (!/^https?:\/\//i.test(href)) return null;
      return { label: sourceLabelFromUrl(href), href: href, description: "" };
    }
    if (s && typeof s === "object") {
      var url = s.href || s.source_url || "";
      if (!url) return null;
      return {
        label: s.label || s.source_name || sourceLabelFromUrl(url),
        href: url,
        description: s.description || "",
      };
    }
    return null;
  }).filter(Boolean);
}

function renderSourceList(sources) {
  const normalized = normalizeSourceList(sources);
  if (!normalized.length) return '';
  const rows = normalized
    .map((s) => {
      const descHtml = s.description ? '<p class="guide-source__desc">' + esc(s.description) + '</p>' : '';
      return '<a class="guide-source" href="' + esc(s.href) + '" target="_blank" rel="noopener">' +
        '<span class="guide-source__label">' + esc(s.label) + '</span>' +
        descHtml +
        '</a>';
    })
    .join('');
  return '<div class="guide-sources">' + rows + '</div>';
}

// ---------------------------------------------------------------------------
// Section builders — each renders only when its data exists
// ---------------------------------------------------------------------------

// "government" / "Government" -> "Government"; keeps multi-word labels intact.
function toTitleCase(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/(^|[\s/-])([a-z])/g, function (m, sep, ch) { return sep + ch.toUpperCase(); });
}

function buildBreadcrumb(guide, categoryLabel) {
  if (!guide || (!guide.category && !guide.slug)) return '';
  const items = [{ label: 'Home', href: '/' }];
  if (guide.category) {
    // FIX 1 — category links go to the MAIN hub (/government/, /documents/,
    // /business/, /money/, /education/), not the /guides/<cat>/ sub-index.
    // Stored values may be capitalised ("Government") — normalise first.
    // Non-hub categories fall back to the /guides/ index so links never 404.
    const catSlug = String(guide.category).trim().toLowerCase();
    const hubSlugs = ['government', 'documents', 'business', 'money', 'education'];
    items.push({
      label: toTitleCase(categoryLabel || guide.category),
      href: hubSlugs.indexOf(catSlug) !== -1 ? '/' + catSlug + '/' : '/guides/',
    });
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
  // Caption below the image (reference design); photographer credit stays for
  // Pexels licence compliance when the data carries it.
  const caption = '<figcaption class="guide-hero__caption"><span>Made for readability, not stock</span>' + credit + '</figcaption>';
  return '<figure class="guide-hero">' +
    '<img src="' + esc(imageUrl) + '" alt="' + esc(alt) + '"' + dimAttrs(imageUrl) + ' class="guide-hero__img" loading="lazy" decoding="async" />' +
    caption +
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
  if (!String(summary).trim()) {
    // AEO fallback: guides over ~800 words always get a TL;DR — derive it
    // from the first 2-3 sentences of the body when no curated summary
    // exists (every current long guide has one; this guards future ones).
    const body = guide.content_html || guide.content || '';
    const text = String(Array.isArray(body) ? body.join(' ') : body)
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/[#*_>`~[\]()|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.split(' ').length < 800) return '';
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const tldr = sentences.slice(0, 3).join(' ').trim();
    if (tldr.length < 80) return '';
    return renderSection('guide-section guide-section--summary',
      '<h2 class="guide-section__title">Quick Summary</h2>' +
      '<p class="guide-summary">' + esc(tldr) + '</p>');
  }
  return renderSection('guide-section guide-section--summary',
    '<h2 class="guide-section__title">Quick Summary</h2>' +
    '<p class="guide-summary">' + esc(summary) + '</p>');
}

// ---------------------------------------------------------------------------
// Body content — NO section wrapper and NO "Why It Matters" H2.
//
// The body used to be emitted inside <section class="guide-section--why-matters">
// under the template's own "Why It Matters" H2, which forced every markdown H2
// to become a nested child of that single heading (wrong on 37 of 42 pages).
//
// It is now a flat <div>: the markdown's own H2/H3 become top-level siblings of
// the template's section headings, giving a natural H1 → H2 → H3 outline.
//
// `content_html` (pre-rendered — used by migrated legacy articles so tables and
// ordered step lists survive) wins over the markdown `content`.
// ---------------------------------------------------------------------------
function buildBody(guide, reservedTitles) {
  const source = guide.content_html || guide.content || '';
  if (Array.isArray(source)) {
    return source.length
      ? renderSection('guide-section guide-section--body',
          '<div class="guide-prose guide-body">' + renderList(source, false) + '</div>')
      : '';
  }
  if (!String(source).trim()) return '';
  // Pre-rendered HTML is built in build.js and trusted here; markdown is converted.
  var html = guide.content_html ? String(guide.content_html) : mdToHtml(source);
  // Structural pseudo-headings DeepSeek writes as plain paragraphs or headings.
  // There is no wrapper H2 any more, so they promote straight to <h2>.
  html = html.replace(/<(p|h[23])>(What Happened|Key Points)<\/(p|h[23])>/gi, function (m, o, inner) {
    return '<h2>' + esc(inner.trim()) + '</h2>';
  });
  // The "Why It Matters" wrapper is gone — drop any leftover copy of that heading.
  // Only the heading element is removed; its paragraph body stays (no content lost).
  html = html.replace(/<h[23]>Why It Matters<\/h[23]>/gi, '');
  // General pass: remove any markdown heading that repeats a title the template
  // itself renders elsewhere on the page (e.g. "Important Dates", "FAQs").
  var reserved = (reservedTitles && reservedTitles.length)
    ? reservedTitles
    : ['Quick Summary', 'Why It Matters', 'Important Dates', 'FAQs',
       'Official Sources', 'Disclaimer', 'Related Guides'];
  html = stripReservedHeadings(html, reserved);
  if (!html.trim()) return '';
  // Magazine styling: the "Key Points" list renders as check-mark cards.
  html = html.replace(/(<h2[^>]*>\s*Key Points\s*<\/h2>)(\s*)(<ul>)/g,
    '$1$2<ul class="ag-checklist">');
  // Wrapped in .guide-section so the body gets the same vertical rhythm and
  // full-width divider as every other section; the inner .guide-prose keeps
  // the capped reading measure.
  return renderSection('guide-section guide-section--body',
    '<div class="guide-prose guide-body">' + html + '</div>');
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
  const entries = parseDateEntries(guide.important_dates || guide.importantDates || '');
  if (!entries.length) return '';
  return renderSection('guide-section guide-section--dates',
    '<h2 class="guide-section__title">Important Dates</h2>' + renderTimeline(entries));
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
  // Merge rich references with the plain source_ids and de-duplicate by URL so
  // every article shows real, working outbound links.
  var merged = [];
  var seen = {};
  function add(list) {
    var items = normalizeSourceList(list);
    for (var i = 0; i < items.length; i++) {
      var key = items[i].href.replace(/\/+$/, "").toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      merged.push(items[i]);
    }
  }
  add(guide.officialReferences || guide.sources || []);
  add(guide.source_ids || []);
  var html = renderSourceList(merged);
  if (!html) return '';
  return renderSection('guide-section guide-section--sources',
    '<h2 class="guide-section__title">Official Sources</h2>' +
    '<p class="guide-section__sub">Verified links &bull; No WhatsApp forwards</p>' + html);
}

function buildDisclaimer() {
  return renderSection('guide-section guide-section--disclaimer',
    '<span class="ag-disclaimer__icon" aria-hidden="true">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>' +
    '</span>' +
    '<div class="ag-disclaimer__body">' +
    '<h2 class="guide-section__title">Disclaimer</h2>' +
    '<div class="guide-prose"><p>Samjho is an independent informational resource and is not a government website. ' +
    'Content is for general understanding only and is not financial, legal, tax or professional advice. ' +
    'Rules, rates and eligibility can change; always verify current details with official sources before acting.</p></div>' +
    '</div>');
}

// ---------------------------------------------------------------------------
// Related Guides — picks up to 3 guides from same category (or cross-category fallback)
// ---------------------------------------------------------------------------
function buildRelatedGuides(guide, options) {
  options = options || {};
  const allGuides = options.allGuides || [];
  const currentSlug = guide.slug || '';
  const currentCat = (guide.category || guide.primary_category || '').toLowerCase();

  // Curated links carried over from the legacy article schema win, so those
  // pages keep the exact pairings they shipped with after the migration.
  const explicit = (Array.isArray(guide.relatedGuides) ? guide.relatedGuides : [])
    .filter(function (g) { return g && g.href && g.title; });
  if (explicit.length) {
    const explicitCards = explicit.slice(0, 3).map(function (g) {
      return '<a class="card" href="' + esc(g.href) + '">' +
        '<span class="card-eyebrow">Guide</span>' +
        '<h3>' + esc(g.title) + '</h3>' +
        '<p>' + esc(g.desc || 'Read the simple explanation.') + '</p>' +
      '</a>';
    }).join('');
    return renderSection('guide-section guide-section--related',
      '<h2 class="guide-section__title">Related Guides</h2>' +
      '<div class="related-grid">' + explicitCards + '</div>');
  }

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

  // Titles the TEMPLATE will emit as its own H2 for THIS guide. Used to strip
  // any markdown heading in the body that would repeat one of them, so a page
  // never shows the same heading twice (template vs markdown clash).
  const reservedTitles = [];
  if (typeof normalized.summary === 'string' && normalized.summary.trim()) reservedTitles.push('Quick Summary');
  const bodyText = guide.content_html || guide.content || '';
  if (Array.isArray(bodyText) ? bodyText.length : String(bodyText).trim()) reservedTitles.push('Why It Matters');
  if (!isPressRelease) {
    if (!isNotSpecified(normalized.eligibility)) reservedTitles.push('Eligibility');
    if (!isNotSpecified(normalized.benefits)) reservedTitles.push('Benefits');
    if (!isNotSpecified(normalized.required_documents)) reservedTitles.push('Required Documents');
    if (!isNotSpecified(normalized.application_process)) reservedTitles.push('How to Apply');
  }
  if (!isNotSpecified(normalized.important_dates)) reservedTitles.push('Important Dates');
  if (!isPressRelease && !isNotSpecified(normalized.common_mistakes)) reservedTitles.push('Common Mistakes');
  if (renderFaqList(normalized.faqs || normalized.faq || []).trim()) reservedTitles.push('FAQs');
  if (buildOfficialSources(normalized)) reservedTitles.push('Official Sources');
  reservedTitles.push('Disclaimer', 'Related Guides');

  // ----------------------------------------------------------------- hero
  // Two-column hero (60/40): badge + title + dek + meta + author on the left,
  // hero image + caption on the right.
  const categoryUpper = upperLabel(categoryLabel);
  const typeLabel = String(guide.content_type || options.contentType || '').trim();
  const badgeText = typeLabel
    ? esc(categoryUpper) + ' <span class="ag-catbadge__sep">&bull;</span> ' + esc(typeLabel.toUpperCase())
    : esc(categoryUpper);
  const dek = buildDek(guide, summaryText);
  const heroImage = buildHeroImage(normalized);
  const hero =
    '<header class="ag-hero' + (heroImage ? ' ag-hero--media' : '') + '">' +
      '<div class="ag-hero__main">' +
        (badgeText ? '<span class="ag-catbadge">' + badgeText + '</span>' : '') +
        buildTitle(normalized) +
        (dek ? '<p class="ag-hero__dek">' + esc(dek) + '</p>' : '') +
        buildHeroMeta(normalized) +
        buildAuthor(normalized) +
      '</div>' +
      (heroImage ? '<div class="ag-hero__media">' + heroImage + '</div>' : '') +
    '</header>';

  // Article sections render into the 70% content column of .ag-layout;
  // breadcrumb + hero sit above the two-column grid.
  const sections = [
    buildQuickSummary(normalized),
    buildBody(normalized, reservedTitles),
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

  const contentHtml = sections
    .filter((s) => s && String(s).trim() !== '')
    .join('\n  ');

  // Anchor every H2 (#sec-N) and build the sidebar TOC from the final markup.
  const stamped = stampToc(contentHtml);
  const dateEntries = parseDateEntries(normalized.important_dates || '');

  const siteDomain = String(options.siteDomain || 'https://samjhoindia.com').replace(/\/$/, '');
  const absUrl = /^https?:/i.test(canonical) ? canonical : siteDomain + canonical;
  const sidebar =
    '<aside class="ag-sidebar">' +
      buildTocWidget(stamped.toc) +
      buildDatesWidget(stamped.toc, dateEntries) +
      buildShareWidget(absUrl, guide.metaTitle || normalized.title || '') +
      buildNewsletterWidget() +
      buildAdWidget() +
    '</aside>';

  // FIX: <main> is a bare element, so without this wrapper every article block
  // rendered edge-to-edge while the header/footer sat in the centred 1120px
  // .container. One wrapper aligns breadcrumb, hero and the 70/30 grid with the
  // header/footer grid.
  const html =
    '<div class="container">\n  ' +
    buildBreadcrumb(normalized, categoryLabel) +
    hero +
    '<div class="ag-layout">' +
      '<div class="ag-content">\n  ' + stamped.html + '\n  </div>' +
      sidebar +
    '</div>' +
    '\n  </div>';

  // The dark notification bar renders ABOVE the site header (layout.js).
  const topBar = buildTopBar(normalized, categoryUpper);

  return {
    html: html,
    topBar: topBar,
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
  buildBody,
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
  normalizeSourceList,
  sourceLabelFromUrl,
  inlineHtml,
  mdToHtml,
  renderFaqList,
  renderList,
  renderSection,
  formatDate,
  isToday,
  isNotSpecified,
  buildAuthor,
  upperLabel,
  readMinutes,
  buildTopBar,
  buildDek,
  buildHeroMeta,
  parseDateEntries,
  renderTimeline,
  stampToc,
  buildTocWidget,
  buildDatesWidget,
  buildAdWidget,
  buildShareWidget,
  buildNewsletterWidget,
  GUIDE_SCHEMA,
};
