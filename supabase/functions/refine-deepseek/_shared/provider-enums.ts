// =============================================================================
// Samjho — MICRO 15A — DeepSeek Provider Enums (Deno / Edge Function port)
// =============================================================================
// Ported from admin/ai/deepseek/provider-enums.js (Node.js CommonJS).
// SOURCE OF TRUTH remains admin/ai/deepseek/provider-enums.js.
// This file is a runtime-adapted copy for Supabase Edge Functions (Deno).
//
// Changes from source:
//   - CommonJS require/module.exports -> ES module import/export
//   - process.env.X -> Deno.env.get("X")
//   - TypeScript types added
// =============================================================================

export const NOT_SPECIFIED = "Not specified in the official source.";
export const DEFAULT_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_BASE_URL = DEFAULT_BASE_URL;

export const ERROR_CODES = {
  MISSING_API_KEY: "MISSING_API_KEY",
  PROVIDER_DISABLED: "PROVIDER_DISABLED",
  INVALID_API_KEY: "INVALID_API_KEY",
  API_UNAVAILABLE: "API_UNAVAILABLE",
  API_TIMEOUT: "API_TIMEOUT",
  API_RATE_LIMITED: "API_RATE_LIMITED",
  INVALID_API_RESPONSE: "INVALID_API_RESPONSE",
  MALFORMED_OUTPUT: "MALFORMED_OUTPUT",
  INVALID_GUIDE_OUTPUT: "INVALID_GUIDE_OUTPUT",
} as const;

export function text(v: unknown): string {
  return String(v == null ? "" : v);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fail(code: string, message: string, extra?: Record<string, unknown>) {
  return Object.assign({ ok: false, code, message }, extra || {});
}

export function getApiKey(): string | undefined {
  return Deno.env.get("DEEPSEEK_API_KEY");
}

export function getModel(options?: { model?: string }): string {
  return text(options?.model) || text(Deno.env.get("DEEPSEEK_MODEL") || "deepseek-flash");
}

export function getBaseUrl(options?: { baseUrl?: string }): string {
  return text(options?.baseUrl || Deno.env.get("DEEPSEEK_BASE_URL") || DEFAULT_BASE_URL);
}

export function isEnabled(): boolean {
  const key = getApiKey();
  return !!(key && key.trim());
}
