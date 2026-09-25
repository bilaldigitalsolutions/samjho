// =============================================================================
// Samjho — MICRO 14 — emit-functions.js
// =============================================================================
// Firebase deploys only the functions/ directory, but the DeepSeek provider
// logic must stay single-source-of-truth in admin/ai/. This build step copies
// the EXISTING Micro 13 modules VERBATIM (byte-for-byte) into functions/lib/
// so ./lib requires resolve identically. No logic is duplicated or rewritten.
//
// Run automatically as part of `node build/build.js`.
// =============================================================================

"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FN_DIR = path.join(ROOT, "functions");
const LIB_DIR = path.join(FN_DIR, "lib");

// [source relative to repo root, destination relative to functions/]
const COPY_MAP = [
  ["admin/ai/server-bridge.js", "lib/ai/server-bridge.js"],
  ["admin/ai/deepseek.js", "lib/ai/deepseek.js"],
  ["admin/ai/deepseek/provider-enums.js", "lib/ai/deepseek/provider-enums.js"],
  ["admin/ai/deepseek/api-request.js", "lib/ai/deepseek/api-request.js"],
  ["admin/ai/deepseek/api-error-handler.js", "lib/ai/deepseek/api-error-handler.js"],
  ["admin/ai/deepseek/payload-builder.js", "lib/ai/deepseek/payload-builder.js"],
  ["admin/ai/deepseek/response-parser.js", "lib/ai/deepseek/response-parser.js"],
  ["admin/ai/deepseek/helpers.js", "lib/ai/deepseek/helpers.js"],
  ["admin/schemas/guide.js", "lib/schemas/guide.js"],
  ["admin/schemas/status.js", "lib/schemas/status.js"],
  ["admin/schemas/index.js", "lib/schemas/index.js"],
  ["admin/schemas/source.js", "lib/schemas/source.js"],
  ["admin/schemas/question.js", "lib/schemas/question.js"]
];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  const a = fs.readFileSync(src);
  const b = fs.readFileSync(dest);
  if (!a.equals(b)) {
    throw new Error("Verbatim copy failed for " + src);
  }
}

function emitFunctions() {
  let count = 0;
  for (const [srcRel, destRel] of COPY_MAP) {
    const src = path.join(ROOT, srcRel);
    if (!fs.existsSync(src)) {
      throw new Error("emit-functions: missing source file " + srcRel);
    }
    copyFile(src, path.join(FN_DIR, destRel));
    count++;
  }
  // Remove any stale copied file that no longer has a source (keeps lib clean).
  const aiDir = path.join(LIB_DIR, "ai", "deepseek");
  if (fs.existsSync(aiDir)) {
    for (const f of fs.readdirSync(aiDir)) {
      if (!COPY_MAP.some(([s]) => s.endsWith("deepseek/" + f))) {
        fs.unlinkSync(path.join(aiDir, f));
      }
    }
  }
  console.log("Micro 14: " + count + " server modules copied verbatim -> functions/lib");
}

module.exports = { emitFunctions, COPY_MAP };

if (require.main === module) {
  emitFunctions();
}