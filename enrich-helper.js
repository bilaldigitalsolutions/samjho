// Part 1: Helper to enrich published guides
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'build/data/published-guides.json');
const guides = JSON.parse(fs.readFileSync(FILE, 'utf8'));

function update(slug, patch) {
  const g = guides.find(x => x.slug === slug);
  if (!g) throw new Error('Not found: ' + slug);
  Object.assign(g, patch);
}

module.exports = { fs, guides, FILE, update };
