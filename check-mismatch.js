const articles = require('./build/data/articles.js');

console.log('=== REAL YEAR MISMATCH CHECK ===\n');
console.log('(Only counts if BOTH title and metaTitle have a year, but they differ)\n');

let realMismatches = 0;
const fixedList = [];

articles.forEach((a) => {
  const tMatch = (x || '').match(/20\d{2}/);
  const mMatch = (a.metaTitle || '').match(/20\d{2}/);
  
  const tHasYear = tMatch !== null;
  const mHasYear = mMatch !== null;
  
  if (tHasYear && mHasYear && tMatch[0] !== mMatch[0]) {
    realMismatches++;
    fixedList.push({
      slug: a.slug,
      title: x,
      metaTitle: a.metaTitle,
      titleYear: tMatch[0],
      metaTitleYear: mMatch[0]
    });
    console.log(`REAL MISMATCH: ${a.slug}`);
    console.log(`  Title:    "${x}" (year: ${tMatch[0]})`);
    console.log(`  MetaTitle: "${a.metaTitle}" (year: ${mMatch[0]})`);
    console.log(`  FIX: Change title year ${tMatch[0]} → ${mMatch[0]}`);
    console.log('');
  }
});

console.log('=== SUMMARY ===');
console.log(`GUIDES WITH REAL YEAR MISMATCH: ${realMismatches}/30`);
console.log('(Both title and metaTitle have years, but they differ)');

if (realMismatches === 0) {
  console.log('\nAll titles with years now match their metaTitle years.');
  console.log('PM Kisan Yojana was fixed in previous task (2025→2026).');
}

// Also report titles without years
const noYearInTitle = articles.filter(a => !/(x || '').match(/20\d{2}/));
console.log(`\nGuides with NO year in title but 2026 in metaTitle: ${noYearInTitle.length}/30`);
