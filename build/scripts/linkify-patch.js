const fs = require("fs");
let s = fs.readFileSync("build.js", "utf8");
const before = s;
s = s.split('${section.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}')
  .join('${section.paragraphs.map((p) => `<p>${inlineLinked(p, a.slug)}</p>`).join("")}');
fs.writeFileSync("build.js", s);
console.log("replacements made:", before !== s ? "yes" : "no");
console.log("occurrences now using inlineLinked:",
  (s.match(/section\.paragraphs\.map\(\(p\) => `<p>\$\{inlineLinked\(p, a\.slug\)\}<\/p>`/g) || []).length);
