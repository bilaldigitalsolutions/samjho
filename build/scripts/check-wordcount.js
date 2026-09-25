const fs = require("fs");
for (const f of [
  "dist/guides/what-is-udyam/index.html",
  "dist/guides/msme-schemes/index.html",
]) {
  const h = fs.readFileSync(f, "utf8");
  const txt = h
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const words = txt.split(" ").filter(Boolean).length;
  console.log(
    f.split("/")[2] +
      " | words=" + words +
      " | h1=" + (h.match(/<h1/g) || []).length +
      " | h2=" + (h.match(/<h2/g) || []).length +
      " | faqQ=" + (h.match(/"@type":"Question"/g) || []).length +
      " | howTo=" + h.includes('"@type":"HowTo"') +
      " | tables=" + (h.match(/<table/g) || []).length +
      " | guideLinks=" + (h.match(/href="\/guides\//g) || []).length
  );
  console.log("  title=" + (h.match(/<title>([^<]+)/) || [])[1]);
}
