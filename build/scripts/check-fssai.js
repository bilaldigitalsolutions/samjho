const fs = require("fs");
const h = fs.readFileSync("dist/guides/fssai-license/index.html", "utf8");
const txt = h
  .replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ");
console.log("dist words=" + txt.split(" ").filter(Boolean).length);
console.log(
  "h1=" + (h.match(/<h1/g) || []).length +
  " h2=" + (h.match(/<h2/g) || []).length +
  " faqQ=" + (h.match(/"@type":"Question"/g) || []).length +
  " howTo=" + h.includes('"@type":"HowTo"') +
  " tables=" + (h.match(/<table/g) || []).length +
  " guideLinks=" + (h.match(/href="\/guides\//g) || []).length
);
console.log("title=" + (h.match(/<title>([^<]+)/) || [])[1]);
const sm = fs.readFileSync("dist/sitemap.xml", "utf8");
console.log("fssai in sitemap=" + sm.includes("fssai-license"));
