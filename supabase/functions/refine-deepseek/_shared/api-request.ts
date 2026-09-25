// Samjho — MICRO 15A — API Request (Deno port)
// SOURCE OF TRUTH: admin/ai/deepseek/api-request.js
// Deno has native fetch — no polyfill needed.
import { text } from "./provider-enums.ts";
import { getBaseUrl } from "./provider-enums.ts";
import { createApiError } from "./api-error-handler.ts";
import { ERROR_CODES } from "./provider-enums.ts";

export async function makeApiRequest(
  payload: Record<string, unknown>, apiKey: string, timeoutMs: number,
  options?: { fetchImpl?: typeof fetch; baseUrl?: string },
): Promise<Record<string, unknown>> {
  const baseUrl = text(options?.baseUrl || getBaseUrl());
  const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const doFetch = options?.fetchImpl || globalThis.fetch;
  const controller = new AbortController();
  let timer: number | undefined;

  const timeoutMsSafe = Number(timeoutMs) > 0 ? Number(timeoutMs) : 0;
  const timeoutPromise = timeoutMsSafe > 0
    ? new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Request timeout after " + timeoutMsSafe + "ms")); }, timeoutMsSafe);
      })
    : null;

  try {
    const response = await (timeoutPromise
      ? Promise.race([doFetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey }, body: JSON.stringify(payload), signal: controller.signal }), timeoutPromise])
      : doFetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey }, body: JSON.stringify(payload), signal: controller.signal }));

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const errBody = body ? JSON.stringify(body) : String(response.statusText || "");
      throw Object.assign(new Error("HTTP " + response.status + ": " + errBody), { statusCode: response.status, responseBody: errBody });
    }
    return await response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
