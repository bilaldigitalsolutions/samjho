const fs = require("fs");
const path = require("path");
const G = require("./seo-g.js");
const T = require("./seo-t.js");
const R = require("./seo-r.js");
const F = path.join(__dirname, "..", "data", "articles.js");
const lines = fs.readFileSync(F, "utf8").split("\n");
const articles = require("../data/articles");
const bySlug = {};
articles.forEach((a) => (bySlug[a.slug] = a));
let cur = null, cg = 0, ct = 0, cr = 0;
const dump = (arr) => arr.map((o) => "{ " + Object.entries(o).map(([k, v]) => k + ': "' + String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(", ") + " }").join(", ");
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/slug: "([^"]+)"/);
  if (m) { cur = m[1]; continue; }
  if (cur && lines[i].includes("relatedTools: [")) {
    const a = bySlug[cur];
    const th = new Set((a.relatedTools || []).map((t) => t.href));
    for (const [title, href] of (T[cur] || [])) {
      if (href === "/calculators/percentage/" || th.has(href)) continue;
      a.relatedTools.push({ title, href }); th.add(href); ct++;
    }
    const rh = new Set((a.officialReferences || []).map((r) => r.href));
    for (const r of (R[cur] || [])) {
      if (rh.has(r.href)) continue;
      a.officialReferences.push(r); rh.add(r.href); cr++;
    }
    const gh = new Set((a.relatedGuides || []).map((g) => g.href));
    for (const slug of (G[cur] || [])) {
      const href = "/guides/" + slug + "/";
      if (gh.has(href) || !bySlug[slug]) continue;
      a.relatedGuides.push({ title: bySlug[slug].title, href }); gh.add(href); cg++;
    }
    lines[i] = "    relatedTools: [" + dump(a.relatedTools) + "], relatedGuides: [" + dump(a.relatedGuides) + "], officialReferences: [" + dump(a.officialReferences) + "]";
    cur = null;
  }
}
fs.writeFileSync(F, lines.join("\n"));
console.log("guides+" + cg + " tools+" + ct + " refs+" + cr);
