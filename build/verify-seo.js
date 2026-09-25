const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, '..', 'dist');

function checkFile(relPath, label) {
  const full = path.join(dist, relPath);
  if (!fs.existsSync(full)) { console.log(`❌ ${label}: FILE NOT FOUND`); return; }
  const html = fs.readFileSync(full, 'utf8');

  const title = html.match(/<title>(.*?)<\/title>/);
  const h1 = html.match(/<h1>(.*?)<\/h1>/);
  const dateMod = html.match(/"dateModified"\s*:\s*"([^"]+)"/);
  const lastUp = html.match(/Last updated: ([^<]+)/);
  const hasFAQ = html.includes('FAQPage');
  const hasArticle = html.includes('"@type":"Article"');

  console.log(`\n=== ${label} ===`);
  console.log(`  Title: ${title ? title[1].substring(0,80) : 'NOT FOUND'}`);
  console.log(`  H1:    ${h1 ? h1[1].substring(0,80) : 'NOT FOUND'}`);
  console.log(`  dateModified: ${dateMod ? dateMod[1] : 'NOT FOUND'}`);
  console.log(`  Visible Last updated: ${lastUp ? lastUp[1] : 'NOT FOUND'}`);
  console.log(`  FAQPage schema: ${hasFAQ ? '✅' : '❌'}`);
  console.log(`  Article schema: ${hasArticle ? '✅' : '❌'}`);
  console.log(`  Title vs H1 year mismatch: ${title && h1 ? (title[1].includes('2026') !== h1[1].includes('2026') ? '⚠️ YES' : '✅ NO') : 'N/A'}`);
}

// Check guide page
checkFile('guides/what-is-gst/index.html', 'Guide: what-is-gst');

// Check calculator page
checkFile('calculators/emi/index.html', 'Calculator: emi');

// Check scheme page
checkFile('schemes/pm-kisan-yojana/index.html', 'Scheme: pm-kisan-yojana');

// Check homepage footer
const home = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
console.log('\n=== Homepage Footer Social Links ===');
const socialUrls = [];
const socialRegex = /<a href="(https?:\/\/[^"]+)"[^>]*foot-social-icon/g;
let match;
while ((match = socialRegex.exec(home)) !== null) {
  socialUrls.push(match[1]);
}
socialUrls.forEach(u => console.log(`  ${u}`));
console.log(`  Total social links: ${socialUrls.length} (expected 5)`);

// Check for ad placeholders
const adCount = (home.match(/ad-slot/g) || []).length;
console.log(`\n=== Ad Placeholders (homepage) ===`);
console.log(`  ad-slot occurrences: ${adCount}`);

// Check sitemap
const sm = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
const smUrls = (sm.match(/<loc>(.*?)<\/loc>/g) || []).map(m => m.replace(/<\/?loc>/g, ''));
console.log(`\n=== Sitemap ===`);
console.log(`  URLs: ${smUrls.length}`);
console.log(`  Has sitemap ref in robots: ${fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8').includes('Sitemap:')}`);

// Summary of meta/title consistency across all guides
console.log('\n=== Meta Title Consistency Audit (all guides) ===');
const mismatches = [];
for (const slug of [
  'what-is-udyam','msme-schemes','fssai-license','business-loan','trademark',
  'what-is-gst','what-is-emi','what-is-credit-score','what-is-uan','what-is-cgpa',
  'what-is-inflation','pm-kisan-yojana','udyam-registration','what-is-compound-interest',
  'what-is-pan-card','what-is-credit-card','what-is-savings-account','what-is-aadhaar',
  'ration-card','e-shram-card','voter-id','passport','driving-licence',
  'birth-certificate','income-certificate','caste-certificate','marriage-certificate',
  'scholarship-guide','entrance-exams','career-options'
]) {
  const html = fs.readFileSync(path.join(dist, 'guides', slug, 'index.html'), 'utf8');
  const t = html.match(/<title>(.*?)<\/title>/);
  const h = html.match(/<h1>(.*?)<\/h1>/);
  if (t && h) {
    const tHas2026 = t[1].includes('2026');
    const hHas2026 = h[1].includes('2026');
    if (tHas2026 !== hHas2026) {
      mismatches.push(`${slug}: title has 2026=${tHas2026}, h1 has 2026=${hHas2026}`);
    }
  }
}
if (mismatches.length === 0) {
  console.log('  ✅ All 30 guide pages have consistent year between <title> and <h1>');
} else {
  console.log(`  ❌ ${mismatches.length} mismatches found:`);
  mismatches.forEach(m => console.log(`    ${m}`));
}
