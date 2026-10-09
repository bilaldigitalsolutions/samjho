// Spot-check the redesign markers on a mix of legacy + published articles.
const fs = require('fs');
const path = require('path');
const DIST = path.join(__dirname, '..', 'dist', 'guides');

const SLUGS = [
  'sadhana-shrinkhla-2026-mission-karmayogi-regional-workshops', // published (reference design subject)
  'india-international-water-week-2026',                        // published, has dates + Key Points
  'what-is-gst',                                                // legacy
  'pm-kisan-yojana',                                            // legacy, fallback hero
  'what-is-emi',                                                // legacy
];

const MARKERS = {
  'top bar above header': (h) => /skip-link[\s\S]{0,400}ag-topbar/.test(h) && h.indexOf('LIVE FROM BHARAT') !== -1,
  'topbar before <header': (h) => h.indexOf('ag-topbar') < h.indexOf('<header class="site-header'),
  'category pill': (h) => h.indexOf('ag-catbadge') !== -1,
  'hero 2-col': (h) => h.indexOf('ag-hero') !== -1 && h.indexOf('ag-hero--media') !== -1,
  'hero dek': (h) => h.indexOf('ag-hero__dek') !== -1,
  'read time': (h) => h.indexOf('min read') !== -1,
  'guide-last-updated': (h) => h.indexOf('guide-last-updated') !== -1,
  'article-author': (h) => h.indexOf('article-author') !== -1,
  'hero caption': (h) => h.indexOf('guide-hero__caption') !== -1,
  '70/30 layout': (h) => h.indexOf('ag-layout') !== -1 && h.indexOf('ag-content') !== -1,
  'sidebar': (h) => h.indexOf('ag-sidebar') !== -1,
  'TOC widget': (h) => h.indexOf('guide-sidebar__toc') !== -1 && /href="#sec-\d+"/.test(h),
  'TOC + body anchors match': (h) => {
    const links = [...h.matchAll(/guide-sidebar__toc[\s\S]*?<\/nav>/g)];
    if (!links.length) return false;
    const ids = [...links[0][0].matchAll(/href="#(sec-[\w-]+)"/g)].map((m) => m[1]);
    return ids.length > 0 && ids.every((id) => h.indexOf('id="' + id + '"') !== -1);
  },
  'share WhatsApp': (h) => h.indexOf('wa.me/?text=') !== -1,
  'share X': (h) => h.indexOf('twitter.com/intent/tweet') !== -1,
  'share LinkedIn': (h) => h.indexOf('linkedin.com/sharing') !== -1,
  'share absolute url': (h) => h.indexOf(encodeURIComponent('https://samjhoindia.com')) !== -1,
  'newsletter box': (h) => h.indexOf('ag-widget--news') !== -1 && h.indexOf('ag-newsletter-form') !== -1,
  'quick summary box': (h) => h.indexOf('guide-section--summary') !== -1,
  'FAQ accordion (details)': (h) => /<details class="guide-faq__item"[\s\S]{0,60}open/.test(h) && h.indexOf('<summary class="guide-faq__q">') !== -1,
  'FAQ no longer h3': (h) => h.indexOf('guide-faq__q">') !== -1 && !/<h3 class="guide-faq__q"/.test(h),
  'source cards': (h) => h.indexOf('guide-section--sources') !== -1 && h.indexOf('guide-source') !== -1,
  'sources sub-line': (h) => h.indexOf('No WhatsApp forwards') !== -1,
  'disclaimer banner': (h) => h.indexOf('guide-section--disclaimer') !== -1 && h.indexOf('ag-disclaimer__icon') !== -1,
  'related guides': (h) => h.indexOf('guide-section--related') !== -1,
  'toc.js loaded': (h) => h.indexOf('/assets/js/toc.js') !== -1,
  'single H1': (h) => (h.match(/<h1/g) || []).length === 1,
  'canonical': (h) => /rel="canonical" href="https:\/\/samjhoindia\.com\/guides\//.test(h),
  'FAQPage schema': (h) => h.indexOf('FAQPage') !== -1,
  'Article schema': (h) => h.indexOf('"@type":"Article"') !== -1 || h.indexOf('"@type": "Article"') !== -1,
  'Breadcrumb schema': (h) => h.indexOf('BreadcrumbList') !== -1,
  'mobile media queries in css': () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'dist', 'assets', 'css', 'style.css'), 'utf8');
    return css.indexOf('ag-layout') !== -1 && css.indexOf('(max-width: 768px)') !== -1 &&
      css.indexOf('(max-width: 480px)') !== -1 && css.indexOf('position: sticky') !== -1;
  },
};

// Content-dependent markers — checked only on the slugs that carry the data.
const OPTIONAL = {
  'timeline (dates)': (h) => h.indexOf('ag-timeline') !== -1 && h.indexOf('ag-timeline__date') !== -1,
  'sidebar dates widget': (h) => h.indexOf('ag-sdates') !== -1,
  'key points checklist': (h) => h.indexOf('ag-checklist') !== -1,
  'example box (legacy)': (h) => h.indexOf('example-box') !== -1,
  'numbered list': (h) => h.indexOf('<ol') !== -1,
};

let fail = 0;
SLUGS.forEach((slug) => {
  const file = path.join(DIST, slug, 'index.html');
  const h = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (!h) { console.log(slug + ': FILE MISSING'); fail++; return; }
  const bad = [];
  Object.keys(MARKERS).forEach((k) => { try { if (!MARKERS[k](h)) bad.push(k); } catch (e) { bad.push(k + ' (err)'); } });
  const present = Object.keys(OPTIONAL).filter((k) => { try { return OPTIONAL[k](h); } catch (e) { return false; } });
  console.log(slug);
  console.log('  required failed: ' + (bad.length ? bad.join(', ') : 'none'));
  console.log('  content markers present: ' + (present.join(', ') || 'none'));
  if (bad.length) fail++;
});
console.log(fail === 0 ? '\nSPOT-CHECK PASS' : '\nSPOT-CHECK FAIL (' + fail + ' pages)');
process.exit(fail ? 1 : 0);