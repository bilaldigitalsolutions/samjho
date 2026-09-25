const fs = require('fs');
const path = require('path');

const layoutPath = path.join(__dirname, 'templates', 'layout.js');
let content = fs.readFileSync(layoutPath, 'utf8');

// Fix 1: Remove the corrupted WebSite schema injected inside the newsletter column
// It was inserted between <h4>Stay Updated</h4> and <p>Get important updates...
const newsletterSchemaRegex = /<h4>Stay Updated<\/h4>\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g;
content = content.replace(newsletterSchemaRegex, '<h4>Stay Updated</h4>');

// Fix 2: Remove duplicate Facebook opening tag (line 82 - has no closing, breaks HTML)
// The pattern: Facebook <a> tag immediately followed by Instagram <a> tag without closing
content = content.replace(
  /<a href="https:\/\/www\.facebook\.com\/samjhoindia" aria-label="Facebook" class="foot-social-icon" target="_blank" rel="noopener">\s*<a href="https:\/\/www\.instagram\.com\/samjhoindia"/,
  '<a href="https://www.instagram.com/samjhoindia"'
);

// Fix 3: Remove duplicate X (Twitter) link (lines 94-95 - empty anchor with no SVG)
content = content.replace(
  /<a href="https:\/\/x\.com\/samjhoindia" aria-label="X \(Twitter\)" class="foot-social-icon" target="_blank" rel="noopener">\s*<\/a>/g,
  ''
);

// Fix 4: Fix remaining broken X (Twitter) link that still has href="#"
content = content.replace(
  /<a href="#" aria-label="X \(Twitter\)" class="foot-social-icon">/,
  '<a href="https://x.com/samjhoindia" aria-label="X (Twitter)" class="foot-social-icon" target="_blank" rel="noopener">'
);

// Fix 5: Fix remaining broken Facebook link that still has href="#"
content = content.replace(
  /<a href="#" aria-label="Facebook" class="foot-social-icon">/,
  '<a href="https://www.facebook.com/samjhoindia" aria-label="Facebook" class="foot-social-icon" target="_blank" rel="noopener">'
);

fs.writeFileSync(layoutPath, content, 'utf8');
console.log('layout.js has been fixed');

// Verify
const fixed = fs.readFileSync(layoutPath, 'utf8');
const issues = [];
if (fixed.includes('href="#"') && fixed.includes('foot-social-icon')) {
  const matches = fixed.match(/<a href="#"[^>]*foot-social-icon[^>]*>/g);
  if (matches) issues.push('Remaining # links: ' + matches.join(', '));
}
if (fixed.includes('<script type="application/ld+json">') && fixed.includes('<h4>Stay Updated</h4>\n            <script')) {
  issues.push('Schema still in newsletter section');
}
if (issues.length === 0) {
  console.log('No remaining issues found in footer social links');
} else {
  console.log('Remaining issues:');
  issues.forEach(i => console.log('  - ' + i));
}
