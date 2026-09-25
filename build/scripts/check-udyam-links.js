// quick unit check of inlineLinked without building
process.chdir(__dirname);
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync("../build.js", "utf8");
const fn = src.match(/function inlineLinked[\s\S]*?\n}/)[0];
eval(fn + "\nfunction esc(str){return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');}\nconst INLINE_LINK_TERMS = { \"what-is-udyam\": [[\"Business Loan\",\"/guides/business-loan/\"],[\"MSME\",\"/guides/msme-schemes/\"],[\"GST\",\"/guides/what-is-gst/\"],[\"PAN\",\"/guides/what-is-pan-card/\"],[\"Trademark\",\"/guides/trademark/\"]] };");
const src2 = fs.readFileSync("../data/articles.js", "utf8");
const sample = "Udyam Registration is the official MSME registration for eligible businesses in India. GST, PAN aur CGTMSE covered loans, Business Loan aur Trademark.";
console.log(inlineLinked(sample, "what-is-udyam"));
console.log("---other guide unaffected---");
console.log(inlineLinked(sample, "what-is-gst"));

// dist verification
process.chdir(path.join(__dirname, "..", "..")); // repo root (build/../..)
const h = fs.readFileSync("dist/guides/what-is-udyam/index.html", "utf8");
const c = h.slice(h.indexOf("article-body"));
const externals = (c.match(/https:\/\/[^"'\s<]+/g) || []).filter((u) =>
  /udyamregistration|msme\.gov\.in|cgtmse|mudra/.test(u)
);
const set = [...new Set(externals.map((u) => u.replace(/\/$/, "")))];
console.log("EXTERNAL LINKS: " + set.length + "/4");
set.forEach((u) => console.log("  - " + u));
const inline = c.match(/<a href="\/guides\/[^"]+"/g) || [];
console.log("INLINE INTERNAL LINKS (body): " + inline.length);
inline.forEach((x) => console.log("  - " + x));
