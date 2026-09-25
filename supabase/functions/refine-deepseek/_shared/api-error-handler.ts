// =============================================================================
// Samjho — MICRO 15A — API Error Handler (Deno / Edge Function port)
// =============================================================================
// Ported from admin/ai/deepseek/api-error-handler.js (Node.js CommonJS).
// SOURCE OF TRUTH remains admin/ai/deepseek/api-error-handler.js.
// =============================================================================

export interface ApiError {
  ok: false;
  code: string;
  message: string;
  originalError?: unknown;
}

export function createApiError(code: string, message: string, details?: Record<string, unknown>): ApiError {
  return Object.assign({ ok: false, code, message }, details || {}) as ApiError;
}

export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as Error).message || err || "").toLowerCase();
  return msg.includes("fetch") || msg.includes("network") || msg.includes("abort") ||
    msg.includes("timeout") || msg.includes("econnrefused") || msg.includes("enotfound");
}

export function isTimeoutError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as Error).message || err || "").toLowerCase();
  return msg.includes("timeout") || msg.includes("abort");
}

export function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as Error).message || err || "").toLowerCase();
  return msg.includes("429") || msg.includes("rate") || msg.includes("too many");
}

export function isAuthError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as Error).message || err || "").toLowerCase();
  return msg.includes("401") || msg.includes("unauthorized") || msg.includes("invalid api");
}

export function categorizeApiError(err: unknown): ApiError {
  if (isTimeoutError(err)) {
    return createApiError("API_TIMEOUT", "Request timed out", { originalError: err });
  }
  if (isRateLimitError(err)) {
    return createApiError("API_RATE_LIMITED", "Rate limit exceeded", { originalError: err });
  }
  if (isAuthError(err)) {
    return createApiError("INVALID_API_KEY", "Authentication failed", { originalError: err });
  }
  if (isNetworkError(err)) {
    return createApiError("API_UNAVAILABLE", "Network error", { originalError: err });
  }
  return createApiError("API_UNAVAILABLE", "API request failed: " + String(err), { originalError: err });
}
