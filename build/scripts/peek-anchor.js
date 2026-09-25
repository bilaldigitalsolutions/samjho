// debug: show the raw text right after a slug declaration
const fs = require("fs");
const s = fs.readFileSync(__dirname + "/../data/articles.js", "utf8");
const slug = process.argv[2] || "what-is-aadhaar";
const i = s.indexOf('slug: "' + slug + '"');
console.log(JSON.stringify(s.slice(i, i + 320)));
