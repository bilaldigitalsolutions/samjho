const fs = require('fs');
const path = require('path');

const dist = 'dist';
const results = [];

function extractFromHtml(html, filepath) {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["'](.*?)["']/is) 
    || html.match(/<meta[^>]+content=["'](.*?)["'][^>]+name=["']description["']/is);
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  
  const cleanH1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : null;
  
  return {
    filepath,
    title: titleMatch ? titleMatch[1].trim() : null,
    metaDesc: descMatch ? descMatch[1].trim() : null,
    h1: cleanH1
  };
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath);
    } else if (entry.name.endsWith('.html')) {
      try {
        const html = fs.readFileSync(fullPath, 'utf8');
        const data = extractFromHtml(html, fullPath.replace('dist\\', '').replace(/\\/g, '/'));
        results.push(data);
      } catch(e) {
        console.error('Error reading ' + fullPath + ': ' + e.message);
      }
    }
  }
}

walkDir(dist);

// === CHECK 1: HEADING vs TITLE/META MISMATCHES ===
console.log('=== HEADING vs TITLE/META DESCRIPTION MISMATCHES ===\n');
let mismatchCount = 0;
const mismatchResults = [];

for (const r of results) {
  const issues = [];
  
  if (r.h1 && r.title) {
    const h1Norm = r.h1.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const titleNorm = r.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    
    // Year discrepancies
    const h1Year = r.h1.match(/20\d{2}/);
    const titleYear = r.title.match(/20\d{2}/);
    if (h1Year && titleYear && h1Year[0] !== titleYear[0]) {
      issues.push('Year mismatch: H1="' + r.h1 + '" (year ' + h1Year[0] + ') vs <title>="' + r.title + '" (year ' + titleYear[0] + ')');
    }
    
    // Wording mismatch: h1 not found in title and title not found in h1
    if (h1Norm.length > 15 && titleNorm.length > 15) {
      if (!titleNorm.includes(h1Norm.substring(0, 20)) && !h1Norm.includes(titleNorm.substring(0, 20))) {
        issues.push('Wording mismatch: H1="' + r.h1 + '" vs <title>="' + r.title + '"');
      }
    }
  }
  
  if (r.metaDesc && r.h1) {
    const descYear = r.metaDesc.match(/20\d{2}/);
    const h1Year = r.h1.match(/20\d{2}/);
    if (descYear && h1Year && descYear[0] !== h1Year[0]) {
      issues.push('Year mismatch: meta description has ' + descYear[0] + ' but H1 has ' + h1Year[0]);
    }
  }
  
  if (issues.length > 0) {
    mismatchCount++;
    mismatchResults.push({ filepath: r.filepath, issues, title: r.title, metaDesc: r.metaDesc, h1: r.h1 });
  }
}

if (mismatchCount === 0) {
  console.log('No mismatches found.\n');
} else {
  mismatchResults.forEach(r => {
    console.log('FILE: ' + r.filepath);
    console.log('  <title>:     ' + (r.title || '(missing)'));
    console.log('  meta desc:   ' + (r.metaDesc || '(missing)'));
    console.log('  <h1>:        ' + (r.h1 || '(missing)'));
    r.issues.forEach(i => console.log('  -> ' + i));
    console.log('');
  });
}

// === CHECK 2: DUPLICATE TITLES ===
console.log('=== DUPLICATE TITLES ===\n');
const titleMap = {};
for (const r of results) {
  if (r.title) {
    const key = r.title.toLowerCase().trim();
    if (!titleMap[key]) titleMap[key] = [];
    titleMap[key].push(r.filepath);
  }
}
let dupCount = 0;
for (const [title, files] of Object.entries(titleMap)) {
  if (files.length > 1) {
    dupCount++;
    console.log('DUPLICATE: "' + title + '"');
    files.forEach(f => console.log('  - ' + f));
    console.log('');
  }
}
if (dupCount === 0) console.log('No duplicate titles found.\n');

// === CHECK 3: DUPLICATE META DESCRIPTIONS ===
console.log('=== DUPLICATE META DESCRIPTIONS ===\n');
const descMap = {};
for (const r of results) {
  if (r.metaDesc) {
    const key = r.metaDesc.toLowerCase().trim();
    if (!descMap[key]) descMap[key] = [];
    descMap[key].push(r.filepath);
  }
}
dupCount = 0;
for (const [desc, files] of Object.entries(descMap)) {
  if (files.length > 1) {
    dupCount++;
    const shortDesc = desc.length > 100 ? desc.substring(0, 100) + '...' : desc;
    console.log('DUPLICATE: "' + shortDesc + '"');
    files.forEach(f => console.log('  - ' + f));
    console.log('');
  }
}
if (dupCount === 0) console.log('No duplicate meta descriptions found.\n');

// Summary
console.log('=== SUMMARY ===');
console.log('Total pages scanned: ' + results.length);
console.log('Pages with mismatches: ' + mismatchCount);
console.log('Duplicate title groups: ' + Object.values(titleMap).filter(a => a.length > 1).length);
console.log('Duplicate meta desc groups: ' + Object.values(descMap).filter(a => a.length > 1).length);
