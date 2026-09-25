// Adds a quickSummary field to every guide in data/articles.js (idempotent).
const fs = require("fs");
const FILE = __dirname + "/../data/articles.js";
const QS = require("./quick-summary-data.json");

let src = fs.readFileSync(FILE, "utf8");
let added = 0, skipped = 0;
for (const [slug, items] of Object.entries(QS)) {
  if (new RegExp('slug: "' + slug + '"[\\s\\S]{0,1200}quickSummary').test(src)) { skipped++; continue; }
  const rx = new RegExp('(slug: "' + slug + '",\\n\\s*title: "[^"]*",\\n(?:\\s*metaTitle: "[^"]*",\\n)?\\s*metaDescription: "[^"]*",\\n)');
  if (!rx.test(src)) { console.log("ANCHOR MISS: " + slug); continue; }
  src = src.replace(rx, "$1    quickSummary: [" + items.map((s) => '"' + s + '"').join(", ") + "],\n");
  added++;
}
fs.writeFileSync(FILE, src);
console.log("quickSummary added=" + added + " skipped(already)=" + skipped);
