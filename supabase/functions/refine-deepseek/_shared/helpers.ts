// =============================================================================
// Samjho — MICRO 15A — DeepSeek Helpers (Deno / Edge Function port)
// =============================================================================
// Ported from admin/ai/deepseek/helpers.js (Node.js CommonJS).
// SOURCE OF TRUTH remains admin/ai/deepseek/helpers.js.
// =============================================================================

import { text, today, NOT_SPECIFIED } from "./provider-enums.ts";

export { text, today, NOT_SPECIFIED };

export function hasWords(wordSet: Record<string, boolean>, str: string): boolean {
  return groundingScore(wordSet, str) > 0;
}

// Count distinct RAW words (length >= 4) that also appear in `str`.
export function groundingScore(wordSet: Record<string, boolean>, str: string): number {
  const pieces = String(str).toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, " ").split(/\s+/);
  const seen: Record<string, boolean> = {};
  let score = 0;
  for (const w of pieces) {
    if (w.length >= 4 && wordSet[w] && !seen[w]) {
      seen[w] = true;
      score++;
    }
  }
  return score;
}

// HALLUCINATION GUARD (stricter than a raw word-overlap test).
// A statement is treated as grounded only when it shares *substantive*
// evidence with the official source: either at least two distinct RAW words,
// or a single distinctive RAW word of 6+ characters. This stops a lone common
// noun (e.g. "card") from letting an invented claim pass.
export function isGroundedText(wordSet: Record<string, boolean>, str: string): boolean {
  const pieces = String(str).toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, " ").split(/\s+/);
  const seen: Record<string, boolean> = {};
  let score = 0;
  let hasDistinctive = false;
  for (const w of pieces) {
    if (w.length >= 4 && wordSet[w] && !seen[w]) {
      seen[w] = true;
      score++;
      if (w.length >= 6) hasDistinctive = true;
    }
  }
  return score >= 2 || hasDistinctive;
}

export function buildWordSet(raw: string): Record<string, boolean> {
  const set: Record<string, boolean> = {};
  const words = String(raw).toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, " ").split(/\s+/);
  for (const w of words) {
    if (w.length >= 4) set[w] = true;
  }
  return set;
}

// Collect every official source URL carried by the guide.
export function guideSourceUrls(guide: Record<string, unknown>): string[] {
  const urls: string[] = [];
  if (guide && typeof guide === "object") {
    if (text(guide.source_url).trim()) urls.push(text(guide.source_url).trim());
    if (Array.isArray(guide.source_ids)) {
      for (const id of guide.source_ids) {
        if (text(id).trim()) urls.push(text(id).trim());
      }
    }
  }
  return urls;
}

// Simple independent validation of key guide fields.
export function validateGuideFields(guide: Record<string, unknown>): { ok: boolean; errors: string[] } {
  const errs: string[] = [];
  if (!guide || typeof guide !== "object") return { ok: false, errors: ["guide missing"] };
  if (!text(guide.title).trim()) errs.push("title");
  if (!text(guide.slug).trim()) errs.push("slug");
  if (!text(guide.category).trim()) errs.push("category");
  if (text(guide.status).toLowerCase() !== "draft") errs.push("status");
  if (guideSourceUrls(guide).length === 0) errs.push("source_ids");
  return { ok: errs.length === 0, errors: errs };
}

export function assertSourcePreserved(guide: Record<string, unknown>, sourceUrl: string): { ok: boolean; errors?: string[] } {
  const want = text(sourceUrl).trim();
  if (!want) return { ok: false, errors: ["missing source url"] };
  const urls = guideSourceUrls(guide);
  for (const u of urls) {
    if (u === want) return { ok: true };
  }
  return { ok: false, errors: ["source url mismatch"] };
}
