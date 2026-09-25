// Samjho — MICRO 15A — Response Parser (Deno port)
// SOURCE OF TRUTH: admin/ai/deepseek/response-parser.js
import { createApiError } from "./api-error-handler.ts";
import { validateGuideFields, assertSourcePreserved } from "./helpers.ts";

export function parseDeepSeekResponse(responseData: Record<string, unknown>, sourceUrl: string): { ok: boolean; guide?: Record<string, unknown>; code?: string; message?: string } {
  if (!responseData || typeof responseData !== "object") {
    return createApiError("INVALID_API_RESPONSE", "API response is not a valid object.");
  }
  const err = responseData.error as Record<string, string> | undefined;
  if (err) {
    const code = String(err.code || err.message || "").toLowerCase();
    const msg = err.message || JSON.stringify(err);
    if (code.includes("rate") || code.includes("429")) return createApiError("API_RATE_LIMITED", "API rate limit exceeded: " + msg);
    if (code.includes("401") || code.includes("unauthorized") || code.includes("invalid api")) return createApiError("INVALID_API_KEY", "Invalid API key or unauthorized: " + msg);
    if (code.includes("timeout")) return createApiError("API_TIMEOUT", "API timeout: " + msg);
    return createApiError("API_UNAVAILABLE", "API error: " + msg);
  }
  const choices = responseData.choices as Array<{ message?: { content?: string } }> | undefined;
  if (!choices || !Array.isArray(choices) || choices.length === 0) {
    return createApiError("INVALID_API_RESPONSE", "API response has no choices.");
  }
  const content = choices[0]?.message?.content?.trim();
  if (!content) return createApiError("MALFORMED_OUTPUT", "API response content is empty.");

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(content); } catch (e) {
    return createApiError("MALFORMED_OUTPUT", "API response is not valid JSON: " + (e as Error).message + ". Content preview: " + content.substring(0, 500));
  }
  if (!parsed || typeof parsed !== "object") return createApiError("MALFORMED_OUTPUT", "Parsed JSON is not an object.");

  const validation = validateGuideFields(parsed);
  if (!validation.ok) return createApiError("INVALID_GUIDE_OUTPUT", "Guide schema validation failed: " + validation.errors.join(", "));

  const sourceOk = assertSourcePreserved(parsed, sourceUrl);
  if (!sourceOk.ok) return createApiError("INVALID_GUIDE_OUTPUT", "Source URL preservation check failed: " + (sourceOk.errors || []).join(", "));

  return { ok: true, guide: parsed };
}
