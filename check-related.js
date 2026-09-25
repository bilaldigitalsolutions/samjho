const fs = require('fs');
const path = require('path');

const pages = [
  'what-is-inflation', 'career-options', 'what-is-compound-interest',
  'business-loan', 'trademark', 'what-is-credit-score',
  'what-is-pan-card', 'passport', 'voter-id',
  'udyam-registration', 'pm-kisan-yojana', 'scholarship-guide',
  'entrance-exams', 'e-shram-card', 'ration-card',
  'birth-certificate', 'caste-certificate', 'marriage-certificate',
  'income-certificate', 'driving-licence', 'fssai-license',
  'msme-schemes', 'what-is-udyam', 'what-is-gst', 'what-is-emi',
  'what-is-uan', 'what-is-cgpa', 'what-is-savings-account',
  'what-is-aadhaar', 'what-is-credit-card'
];

const dist = path.join(__dirname, 'dist');

console.log('=== Guide pages with visible "Related guides" / "related-grid" section ===\n');

let hasRelated = 0;
let missingRelated = 0;

pages.forEach(slug => {
  const filePath = path.join(dist, 'guides', slug, 'index.html');
  if (!fs.existsSync(filePath)) {
    console.log('MISSING FILE: ' + slug);
    missingRelated++;
    return;
  }
  const html = fs.readFileSync(filePath, 'utf8');
  const hasSection = html.includes('Related guides') || html.includes('related-grid') || html.includes('<div class="related-grid">');
  if (hasSection) {
    hasRelated++;
  } else {
    console.log('MISSING RELATED SECTION: ' + slug);
    missingRelated++;
  }
});

console.log('\n=== Summary ===');
console.log('Total pages checked: ' + pages.length);
console.log('Pages with Related section: ' + hasRelated);
console.log('Pages missing Related section: ' + missingRelated);
