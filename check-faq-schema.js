const fs = require('fs');
const path = require('path');

const dist = './dist';

// Check what the 4th script tag contains in a sample guide page
function check4thScript(slug) {
  const filePath = path.join(dist, 'guides', slug, 'index.html');
  if (!fs.existsSync(filePath)) return;
  const html = fs.readFileSync(filePath, 'utf8');
  const scripts = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gs) || [];
  
  console.log('\n=== ' + slug + ' ===');
  console.log('Total JSON-LD scripts: ' + scripts.length);
  
  scripts.forEach((s, i) => {
    const raw = s.replace(/<script type="application\/ld\+json">/, '').replace('</script>', '');
    console.log('\n--- Script ' + (i+1) + ' (first 200 chars) ---');
    console.log(raw.substring(0, 200));
    if (raw.length > 200) console.log('... (truncated)');
    
    // Try to parse
    try {
      const obj = JSON.parse(raw);
      const type = obj['@type'] || 'unknown';
      if (type === 'FAQPage') {
        console.log('  => PARSED: FAQPage with ' + (obj.mainEntity ? obj.mainEntity.length : 0) + ' questions');
      } else {
        console.log('  => PARSED: ' + type);
      }
    } catch(e) {
      console.log('  => PARSE ERROR: ' + e.message);
      // Check if it looks like it's supposed to be HowTo but has formatting issues
      if (raw.includes('HowTo') || raw.includes('howTo') || raw.includes('steps')) {
        console.log('  => Looks like it attempts HowTo schema but JSON is malformed');
      }
    }
  });
}

console.log('=== SAMPLE PAGE ANALYSIS ===\n');
['what-is-gst', 'what-is-emi', 'what-is-credit-score'].forEach(check4thScript);

// Check which guides have howTo data
console.log('\n\n=== GUIDES WITH howTo DATA ===');
const articles = require('./build/data/articles.js');
const guidesWithHowTo = articles.filter(x => x.howTo && x.howTo.steps && x.howTo.steps.length > 0);
console.log('Total guides with howTo:', guidesWithHowTo.length);
guidesWithHowTo.forEach(g => {
  console.log(' - ' + g.slug + ': ' + g.howTo.name + ' (' + g.howTo.steps.length + ' steps)');
});
