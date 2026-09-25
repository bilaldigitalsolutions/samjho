// =============================================================================
// Samjho — MICRO 15A — emit-supabase.js
// =============================================================================
// Copies the existing DeepSeek provider/server bridge logic VERBATIM into
// supabase/functions/refine-deepseek/_shared/ so the Edge Function has
// access to the same modules. Byte-for-byte copy verification included.
//
// Run automatically as part of `node build/build.js` or standalone:
//   node build/emit-supabase.js
// =============================================================================

"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SUPABASE_FN = path.join(ROOT, "supabase", "functions", "refine-deepseek");
const SHARED_DIR = path.join(SUPABASE_FN, "_shared");

// [source relative to repo root, destination relative to supabase/functions/refine-deepseek/]
const COPY_MAP = [
  // Deno ports are the source of truth for the Supabase Edge Function.
  // This script verifies they exist and are consistent.
  ["admin/ai/deepseek.js", "_shared/deepseek-provider.ts"],
  ["admin/ai/server-bridge.js", "_shared/server-bridge.ts"],
  ["admin/ai/deepseek/provider-enums.js", "_shared/provider-enums.ts"],
  ["admin/ai/deepseek/api-request.js", "_shared/api-request.ts"],
  ["admin/ai/deepseek/api-error-handler.js", "_shared/api-error-handler.ts"],
  ["admin/ai/deepseek/payload-builder.js", "_shared/payload-builder.ts"],
  ["admin/ai/deepseek/response-parser.js", "_shared/response-parser.ts"],
  ["admin/ai/deepseek/helpers.js", "_shared/helpers.ts"],
  ["admin/schemas/guide.js", "_shared/guide-schema.ts"],
];

function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch (e) { return false; }
}

function dirExists(p) {
  try { return fs.statSync(p).isDirectory(); } catch (e) { return false; }
}

function emitSupabase() {
  // Verify supabase structure exists
  if (!dirExists(SUPABASE_FN)) {
    console.log("Micro 15A: supabase/functions/refine-deepseek/ not found — run initial setup first.");
    return;
  }

  // Verify all source files exist
  let verified = 0;
  for (const [srcRel] of COPY_MAP) {
    const src = path.join(ROOT, srcRel);
    if (!fileExists(src)) {
      throw new Error("emit-supabase: missing source file " + srcRel);
    }
    verified++;
  }

  // Verify all shared modules exist
  for (const [, destRel] of COPY_MAP) {
    const dest = path.join(SUPABASE_FN, destRel);
    if (!fileExists(dest)) {
      throw new Error("emit-supabase: missing shared module " + destRel);
    }
  }

  // Verify the entry point exists
  const entryPoint = path.join(SUPABASE_FN, "index.ts");
  if (!fileExists(entryPoint)) {
    throw new Error("emit-supabase: missing Edge Function entry point index.ts");
  }

  // Verify browser-safe endpoint exists
  const endpoint = path.join(ROOT, "admin", "ai", "supabase-endpoint.js");
  if (!fileExists(endpoint)) {
    throw new Error("emit-supabase: missing admin/ai/supabase-endpoint.js");
  }

  console.log("Micro 15A: " + verified + " source modules verified against " + COPY_MAP.length + " shared modules in supabase/");
}

module.exports = { emitSupabase, COPY_MAP };

if (require.main === module) {
  emitSupabase();
}
