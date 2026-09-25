// Samjho — MICRO 15A — Server Bridge (Deno port)
// SOURCE OF TRUTH: admin/ai/server-bridge.js
// Validates input, categorization, calls DeepSeek provider, validates guide schema.
import * as deepSeek from "./deepseek-provider.ts";
import { validateGuide } from "./guide-schema.ts";
import { text } from "./provider-enums.ts";

const NOT_SPECIFIED = deepSeek.NOT_SPECIFIED || "Not specified in the official source.";
const ERROR_CODES = Object.assign({}, deepSeek.ERROR_CODES, {
  INVALID_RAW_INPUT: "INVALID_RAW_INPUT",
  MANUAL_CATEGORIZATION_REQUIRED: "MANUAL_CATEGORIZATION_REQUIRED",
  GUIDE_SCHEMA_VALIDATION_FAILED: "GUIDE_SCHEMA_VALIDATION_FAILED",
});

function fail(code: string, message: string, extra?: Record<string, unknown>) {
  return Object.assign({ ok: false, code, message }, extra || {});
}

export function validateRawInput(raw: Record<string, unknown>): { ok: boolean; code?: string; message?: string } {
  if (!raw || typeof raw !== "object") return fail(ERROR_CODES.INVALID_RAW_INPUT, "Refinement failed: RAW announcement is missing.");
  const errors: string[] = [];
  if (!text(raw.title).trim()) errors.push("title is required");
  if (!text(raw.raw_content).trim()) errors.push("raw_content is required");
  if (!text(raw.source_url).trim()) errors.push("source_url is required");
  if (!text(raw.source_name).trim()) errors.push("source_name is required");
  if (errors.length) return fail(ERROR_CODES.INVALID_RAW_INPUT, "Refinement failed: invalid RAW input (" + errors.join("; ") + "). RAW left unchanged.");
  return { ok: true };
}

export function validateGuideAgainstSchema(guide: Record<string, unknown>) {
  if (!guide || typeof guide !== "object") return fail(ERROR_CODES.GUIDE_SCHEMA_VALIDATION_FAILED, "Refinement failed: AI returned no guide object. RAW unchanged; nothing published.");
  const validation = validateGuide(guide);
  if (!validation.valid) return fail(ERROR_CODES.GUIDE_SCHEMA_VALIDATION_FAILED, "Refinement failed: guide schema validation failed (" + validation.errors.join("; ") + "). RAW unchanged; nothing published.");
  if (text(guide.status).toLowerCase() !== "draft") guide.status = "draft";
  return { ok: true, guide: validation.normalized };
}

export async function refineWithDeepSeek(raw: Record<string, unknown>, options: { model?: string; timeoutMs?: number; fetchImpl?: typeof fetch; baseUrl?: string } = {}) {
  const inputCheck = validateRawInput(raw);
  if (!inputCheck.ok) return Object.assign({}, inputCheck, { raw: raw || null, guide: null });

  const cat = raw?.categorization as Record<string, string> | null | undefined;
  const catStatus = text(cat?.categorization_status).trim();
  if (!cat || catStatus !== "categorized") {
    const why = !cat ? "content is uncategorized" : "content is marked '" + (cat?.categorization_status || "uncategorized") + "'";
    return fail(ERROR_CODES.MANUAL_CATEGORIZATION_REQUIRED, "Manual categorization is required first: " + why + ". Not sent to DeepSeek. RAW unchanged.", { raw, guide: null });
  }

  const deepSeekRaw = Object.assign({}, raw, {
    categorization: { content_type: text(cat.content_type), category: text(cat.category), sub_category: text(cat.sub_category), user_group: text(cat.user_group), categorization_status: catStatus },
  });

  const result = await deepSeek.provide(deepSeekRaw, { model: options.model, timeoutMs: options.timeoutMs || 30000, fetchImpl: options.fetchImpl, baseUrl: options.baseUrl });
  if (!result.ok) return Object.assign({}, result, { raw, guide: null });

  const schemaCheck = validateGuideAgainstSchema(result.guide!);
  if (!schemaCheck.ok) return Object.assign({}, schemaCheck, { raw, guide: null });

  return { ok: true, code: "OK", message: "DeepSeek refinement complete: RAW restructured into a draft guide. Human verification still required.", guide: schemaCheck.guide, raw, provider: "deepseek", model: result.model };
}

export { ERROR_CODES, NOT_SPECIFIED };
