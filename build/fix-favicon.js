const fs = require("fs");
const p = "D:/bilal-digital-solutions/samjho/build/templates/layout.js";
const lines = fs.readFileSync(p, "utf8").split("\n");
console.log("Line 148:", lines[147].substring(0, 100));
const newFavicons = [
  '  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon/favicon-32x32.png">',
  '  <link rel="icon" type="image/png" href="/assets/logo/logo-icon.png">',
  '  <link rel="apple-touch-icon" sizes="180x180" href="/assets/logo/logo-icon.png">',
  '  <meta name="theme-color" content="#0d9488">',
];
if (lines[147].includes("data:image/svg+xml")) {
  lines.splice(147, 1, ...newFavicons);
  fs.writeFileSync(p, lines.join("\n"), "utf8");
  console.log("Favicon replaced");
} else {
  console.log("Pattern not found at line 148");
}
