const fs = require("fs");
const path = require("path");
const G = require("./seo-g.js");
const T = require("./seo-t.js");
const R = require("./seo-r.js");
const F = path.join(__dirname, "..", "data", "articles.js");
let src = fs.readFileSync(F, "utf8");
const articles = require("../data/articles");
const bySlug = {};
articles.forEach((a) => (bySlug[a.slug] = a));
const dump = (arr) => arr.map((o) => "{ " + Object.entries(o).map(([k, v]) => k + ': "' + String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(", ") + " }").join(", ");
let cg = 0, ct = 0, cr = 0;
for (const a of articles) {
  const want = G[a.slug] || [];
  const have = new Set((a.relatedGuides || []).map((g) => g.href));
  for (const slug of want) {
    const href = "/guides/" + slug + "/";
    if (have.has(href) || !bySlug[slug]) continue;
    a.relatedGuides.push({ title: bySlug[slug].title, href });
    have.add(href); cg++;
  }
  const tw = (T[a.slug] || []).filter(([t, h]) => h !== "/calculators/percentage/");
  const th = new Set((a.relatedTools || []).map((t) => t.href));
  for (const [title, href] of tw) {
    if (th.has(href)) continue;
    a.relatedTools.push({ title, href });
    th.add(href); ct++;
  }
  const rh = new Set((a.officialReferences || []).map((r) => r.href));
  for (const r of (R[a.slug] || [])) {
    if (rh.has(r.href)) continue;
    a.officialReferences.push(r);
    rh.add(r.href); cr++;
  }
  const re = new RegExp("(slug: \"" + a.slug + "\"[\\s\\S]*?relatedTools: \\[)([\\s\\S]*?)(\\], relatedGuides: \\[)([\\s\\S]*?)(\\], officialReferences: \\[)([\\s\\S]*?)(\\]\\n)");
  if (!re.test(src)) { console.log("PATTERN MISS " + a.slug); continue; }
  src = src.replace(re, "$1" + dump(a.relatedTools) + "$3" + dump(a.relatedGuides) + "$5" + dump(a.officialReferences) + "$7");
}
fs.writeFileSync(F, src);
console.log("guides+" + cg + " tools+" + ct + " refs+" + cr);
