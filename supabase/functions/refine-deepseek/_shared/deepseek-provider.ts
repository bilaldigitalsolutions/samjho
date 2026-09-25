// Samjho — MICRO 15A — DeepSeek Provider (Deno port)
// SOURCE OF TRUTH: admin/ai/deepseek.js
// Combines: provider-enums + api-request + api-error-handler + payload-builder + response-parser + helpers
import { isEnabled, getApiKey, getModel, NOT_SPECIFIED, ERROR_CODES } from "./provider-enums.ts";
import { makeApiRequest } from "./api-request.ts";
import { categorizeApiError } from "./api-error-handler.ts";
import { buildDeepSeekPayload } from "./payload-builder.ts";
import { parseDeepSeekResponse } from "./response-parser.ts";
import * as h from "./helpers.ts";

export async function provide(raw: Record<string, unknown>, options: { model?: string; timeoutMs?: number; fetchImpl?: typeof fetch; baseUrl?: string } = {}) {
  if (!isEnabled()) {
    return categorizeApiError(new Error(PROVIDER_DISABLED_MSG));
  }
  const apiKey = getApiKey();
  if (!apiKey || apiKey.trim() === "") {
    return categorizeApiError(new Error(MISSING_KEY_MSG));
  }
  const model = getModel(options);
  const timeoutMs = options.timeoutMs || 30000;
  const categorization = raw?.categorization as Record<string, string> | null;
  const payload = buildDeepSeekPayload(raw, categorization, model);

  try {
    const responseData = await makeApiRequest(payload, apiKey, timeoutMs, { fetchImpl: options.fetchImpl, baseUrl: options.baseUrl });
    const result = parseDeepSeekResponse(responseData, String(raw.source_url || ""));
    if (!result.ok) return result;

    const guide = result.guide!;
    guide.status = "draft";
    guide.last_updated = h.today();
    guide.source_ids = [raw.source_url];

    const wordSet = h.buildWordSet(String(raw.raw_content || ""));
    // Grounding check on text fields
    for (const field of ["summary", "content"]) {
      const val = h.text(guide[field] || "");
      if (val.trim() && !h.isGroundedText(wordSet, val)) guide[field] = NOT_SPECIFIED;
    }
    // Grounding check on list fields
    for (const field of ["eligibility", "benefits", "required_documents", "application_process", "important_dates", "common_mistakes"]) {
      const list = guide[field];
      if (Array.isArray(list)) {
        const filtered = list.filter((item: unknown) => {
          if (!item || !h.text(item).trim()) return false;
          return h.isGroundedText(wordSet, h.text(item));
        });
        guide[field] = filtered.length > 0 ? filtered : [NOT_SPECIFIED];
      }
    }
    // FAQ grounding
    if (Array.isArray(guide.faqs)) {
      const validFaqs = guide.faqs.filter((faq: Record<string, string>) => {
        if (!faq || typeof faq !== "object") return false;
        const q = h.text(faq.q || ""), a = h.text(faq.a || "");
        return q.trim() && a.trim() && h.isGroundedText(wordSet, q) && h.isGroundedText(wordSet, a);
      }).map((faq: Record<string, string>) => ({ q: h.text(faq.q || ""), a: h.text(faq.a || "") }));
      guide.faqs = validFaqs.length > 0 ? validFaqs : [];
    }
    return { ok: true, guide, model, provider: "deepseek" };
  } catch (err) {
    return categorizeApiError(err);
  }
}

const PROVIDER_DISABLED_MSG = "DeepSeek provider is not configured. Set DEEPSEEK_API_KEY on the server (Supabase secret). RAW unchanged; nothing created.";
const MISSING_KEY_MSG = "DeepSeek API key is not configured. RAW unchanged; nothing created.";

export { isEnabled, getApiKey, getModel, NOT_SPECIFIED, ERROR_CODES };
