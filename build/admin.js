const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "admin");
const OUT = path.join(__dirname, "..", "dist", "admin");

// ---------------------------------------------------------------------------
// SERVER-SIDE ONLY files (MICRO 13). These read DEEPSEEK_API_KEY from the
// server environment and must NEVER be copied into the browser bundle served
// from dist/. They stay in admin/ for the server/Cloud Function to require().
// ---------------------------------------------------------------------------
const SERVER_ONLY_PATHS = [
  path.join("ai", "server-bridge.js"), // secure DeepSeek boundary
  path.join("ai", "deepseek.js"),      // server-side provider entry
  path.join("ai", "deepseek"),         // server-side provider modules
];

function isServerOnly(relPath) {
  const norm = relPath.split(/[\\/]/).join(path.sep);
  return SERVER_ONLY_PATHS.some((p) => norm === p || norm.startsWith(p + path.sep));
}

function copyAdmin() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const entry of fs.readdirSync(SRC, { withFileTypes: true })) {
    const s = path.join(SRC, entry.name);
    const d = path.join(OUT, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d, entry.name);
    } else {
      if (isServerOnly(entry.name)) continue;
      fs.copyFileSync(s, d);
    }
  }
}

function copyDir(src, dest, relBase) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const rel = relBase ? path.join(relBase, entry.name) : entry.name;
    if (isServerOnly(rel)) continue; // never ship server-only modules
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d, rel);
    else fs.copyFileSync(s, d);
  }
}

module.exports = { copyAdmin, emitMasterGuideBrowser, emitQuestionsAdmin };

// ---------------------------------------------------------------------------
// Draft editor support: emit a browser bundle of the EXISTING Master Guide
// Template (build/templates/master-guide.js) plus the existing Guide/Status
// schemas (admin/schemas/*). The real sources are embedded verbatim and
// executed at runtime via a tiny loader — no template logic is duplicated.
// ---------------------------------------------------------------------------

function emitMasterGuideBrowser() {
  const OUT_DIR = path.join(__dirname, "..", "dist", "admin", "content");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const readSrc = (p) => fs.readFileSync(p, "utf8");
  const templateSrc = readSrc(path.join(__dirname, "templates", "master-guide.js"));
  const guideSchemaSrc = readSrc(path.join(__dirname, "..", "admin", "schemas", "guide.js"));
  const statusSchemaSrc = readSrc(path.join(__dirname, "..", "admin", "schemas", "status.js"));

  const bundle = [
    "// GENERATED at build time from build/templates/master-guide.js",
    "// and admin/schemas/{guide,status}.js — single source of truth.",
    "(function () {",
    '  "use strict";',
    "  var __sources = {",
    '    "guide": ' + JSON.stringify(guideSchemaSrc) + ",",
    '    "status": ' + JSON.stringify(statusSchemaSrc),
    "  };",
    "  function __esc(str) {",
    '    str = String(str == null ? "" : str);',
    '    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;")',
    '      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");',
    "  }",
    "  function __loadSchema(p) {",
    '    var key = /status\\.js$|status$/.test(p) ? "status"',
    '      : /guide\\.js$|guide$/.test(p) ? "guide" : null;',
    '    if (!key) throw new Error("Unknown module: " + p);',
    "    var mod = { exports: {} };",
    '    var fn = new Function("require", "module", "exports", __sources[key]);',
    "    fn(__require, mod, mod.exports);",
    "    return mod.exports;",
    "  }",
    "  function __require(p) {",
    '    if (p === "./layout") return { esc: __esc };',
    "    return __loadSchema(p);",
    "  }",
    "  var __mod = { exports: {} };",
    '  new Function("require", "module", "exports", ' + JSON.stringify(templateSrc) + ")(__require, __mod, __mod.exports);",
    "  window.MasterGuideTemplate = __mod.exports;",
    "})();",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(OUT_DIR, "master-guide.js"), bundle, "utf8");
  console.log("Master Guide Template browser bundle -> dist/admin/content/master-guide.js");
}

// ---------------------------------------------------------------------------
// Questions Management support: emit the separate questions/admin module
// (questions/admin/**) into dist/questions/admin/ and generate a browser
// bundle of the EXISTING Question schema (questions/schemas/question.js).
// No question content is published to the public website — this is admin
// tooling only, kept separate from the guide workflow.
// ---------------------------------------------------------------------------

function emitQuestionsAdmin() {
  const SRC_DIR = path.join(__dirname, "..", "questions", "admin");
  const OUT_DIR = path.join(__dirname, "..", "dist", "questions", "admin");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const entry of fs.readdirSync(SRC_DIR, { withFileTypes: true })) {
    if (entry.isFile()) {
      fs.copyFileSync(path.join(SRC_DIR, entry.name), path.join(OUT_DIR, entry.name));
    }
  }

  const schemaSrc = fs.readFileSync(
    path.join(__dirname, "..", "questions", "schemas", "question.js"),
    "utf8"
  );

  const bundle = [
    "// GENERATED at build time from questions/schemas/question.js —",
    "// single source of truth for the Question schema.",
    "(function () {",
    '  "use strict";',
    "  var __mod = { exports: {} };",
    '  new Function("require", "module", "exports", ' + JSON.stringify(schemaSrc) + ")(function () { throw new Error('requires are not supported in the question schema bundle'); }, __mod, __mod.exports);",
    "  window.SamjhoQuestionSchema = __mod.exports;",
    "})();",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(OUT_DIR, "question-schema.js"), bundle, "utf8");
  console.log("Questions admin emitted -> dist/questions/admin");
}

copyAdmin();
emitMasterGuideBrowser();
emitQuestionsAdmin();
console.log("Admin assets copied to dist/admin");
