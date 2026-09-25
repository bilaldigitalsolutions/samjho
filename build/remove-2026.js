const fs = require('fs');

function strip2026(filePath) {
  let c = fs.readFileSync(filePath, 'utf8');
  const before = c.length;
  // Remove "2026" from metaTitle: "..." lines  (handles "... 2026", "2026 — ...", "...2026")
  c = c.replace(/metaTitle:\s*"([^"]*?)\s*2026\s*"/g, (m, p1) => 'metaTitle: "' + p1.trim() + '"');
  // Remove "2026" from metaDescription: "..." lines
  c = c.replace(/metaDescription:\s*"([^"]*?)\s*2026\s*"/g, (m, p1) => 'metaDescription: "' + p1.trim() + '"');
  fs.writeFileSync(filePath, c);
  console.log('Updated: ' + filePath + ' (' + (before - c.length) + ' chars removed)');
}

strip2026('data/articles.js');
strip2026('data/calculators.js');

// Fix llms.txt 2025->2026
try {
  let l = fs.readFileSync('../dist/llms.txt', 'utf8');
  const before = l.length;
  l = l.replace(/2025/g, '2026');
  fs.writeFileSync('../dist/llms.txt', l);
  console.log('Updated: llms.txt (' + (before - l.length) + ' chars changed)');
} catch(e) {}

// Verify
console.log('\n=== Verification ===');
const a = require('./data/articles.js');
const c = require('./data/calculators.js');
let gi = 0, ci = 0;
a.forEach(x => { if (x.metaTitle && x.metaTitle.includes('2026')) { console.log('REMAINING:', x.slug, '|', x.metaTitle.substring(0,60)); gi++; } });
c.forEach(x => { if (x.metaTitle && x.metaTitle.includes('2026')) { console.log('REMAINING:', x.slug, '|', x.metaTitle.substring(0,60)); ci++; } });
if (!gi && !ci) {
  console.log('✅ CLEAN: No 2026 in any metaTitle or metaDescription');
  // Show sample
  console.log('\nSample metaTitles:');
  a.filter(x => ['what-is-gst','udyam-registration','pm-kisan-yojana'].includes(x.slug)).forEach(x => console.log('  guide', x.slug, ':', x.metaTitle.substring(0,70)));
  c.filter(x => ['emi','gst'].includes(x.slug)).forEach(x => console.log('  calc', x.slug, ':', x.metaTitle.substring(0,70)));
} else {
  console.log('❌ Failed: ' + gi + ' guides, ' + ci + ' calculators still have 2026');
}
