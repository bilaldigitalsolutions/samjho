// Quick smoke test for the redesigned master guide template (not part of CI).
const mg = require('../build/templates/master-guide');

const r = mg.renderMasterGuide({
  title: 'Test Guide',
  slug: 'test-guide',
  category: 'government',
  content_type: 'Press Release',
  summary: 'This is the summary sentence one. This is sentence two with more detail about the thing.',
  content: '## What Happened\nSome happened text.\n\n## Key Points\n- Point one\n- Point two',
  last_updated: '2026-09-23',
  important_dates: ['September 22, 2026 – Launch happened.'],
  faqs: [{ q: 'Q1?', a: 'A1.' }, { q: 'Q2?', a: 'A2.' }],
  hero_image: '/assets/hero-illustration-new.png',
  image_photographer: 'Test Photographer',
  officialReferences: [{ label: 'PIB', href: 'https://pib.gov.in/x' }],
}, { siteDomain: 'https://samjhoindia.com', allGuides: [{ slug: 'other', title: 'Other', category: 'government', summary: 'x' }] });

console.log('html len:', r.html.length);
console.log('topBar:', r.topBar.substring(0, 160));
const checks = [
  'guide-breadcrumb', 'ag-hero', 'ag-layout', 'ag-sidebar', 'guide-sidebar__toc',
  'ag-timeline', 'ag-checklist', 'guide-faq__item', 'guide-section--disclaimer',
  'id="sec-1"', 'ag-catbadge', 'ag-widget--news', 'wa.me', 'ag-hero__dek',
  'guide-hero__caption', 'guide-last-updated', 'article-author', 'guide-section--summary',
  'guide-section--faqs', 'guide-section--sources', 'guide-section--related',
  'ag-share__btn', 'ag-newsletter-form', 'ag-timeline__date', 'toc.js-placeholder-not-needed',
];
let missing = 0;
checks.forEach((k) => {
  const inHtml = r.html.indexOf(k) !== -1;
  if (!inHtml && k !== 'toc.js-placeholder-not-needed') { missing++; console.log('MISSING html:', k); }
});
if (r.topBar.indexOf('LIVE FROM BHARAT') === -1) { missing++; console.log('MISSING topBar text'); }
if (r.topBar.indexOf('GOVERNMENT') === -1) { missing++; console.log('MISSING topBar category'); }
if (r.html.indexOf('PRESS RELEASE') === -1) { missing++; console.log('MISSING badge type'); }
// heading rules
const h1s = (r.html.match(/<h1/g) || []).length;
if (h1s !== 1) { missing++; console.log('H1 count =', h1s); }
if (/why it matters/i.test((r.html.match(/<h2[^>]*>[^<]*<\/h2>/g) || []).join(''))) {
  missing++; console.log('Why It Matters H2 present (verifier would fail)');
}
console.log(missing === 0 ? 'SMOKE PASS' : 'SMOKE FAIL (' + missing + ')');
process.exit(missing ? 1 : 0);