// Samjho — MICRO 15A — Guide Schema Validation (Deno port)
// SOURCE OF TRUTH: admin/schemas/guide.js + admin/schemas/status.js
// Preserves the EXISTING Guide Schema — no changes to validation rules.

const STATUS = { DRAFT: "draft", REVIEW: "review", APPROVED: "approved", PUBLISHED: "published" };
const STATUS_VALUES = Object.values(STATUS);

export function isValidStatus(value: unknown): boolean {
  return STATUS_VALUES.includes(String(value).toLowerCase() as typeof STATUS_VALUES[number]);
}

const GUIDE_FIELDS = [
  "id", "title", "slug", "category", "summary", "content",
  "eligibility", "benefits", "required_documents", "application_process",
  "important_dates", "common_mistakes", "faqs", "source_ids", "status", "last_updated",
];

export function normalizeGuide(data: Record<string, unknown> = {}): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of GUIDE_FIELDS) {
    let value = data[field];
    if (field === "source_ids") {
      if (!Array.isArray(value)) value = [];
      value = (value as unknown[]).filter((id) => id != null && String(id).trim() !== "");
    }
    if (field === "faqs") { if (!Array.isArray(value)) value = []; }
    if (field === "status") {
      if (!isValidStatus(value)) value = "draft";
      value = String(value).toLowerCase();
    }
    if (field === "slug" && typeof value === "string") {
      value = value.trim().toLowerCase().replace(/\s+/g, "-");
    }
    result[field] = value;
  }
  return result;
}

export function validateGuide(data: Record<string, unknown> = {}): { normalized: Record<string, unknown>; valid: boolean; errors: string[] } {
  const normalized = normalizeGuide(data);
  const errors: string[] = [];
  if (!normalized.title || String(normalized.title).trim() === "") errors.push("title is required");
  if (!normalized.slug || String(normalized.slug).trim() === "") errors.push("slug is required");
  if (!normalized.category || String(normalized.category).trim() === "") errors.push("category is required");
  if (normalized.status === "published" && !normalized.last_updated) errors.push("published guides should include last_updated");
  return { normalized, valid: errors.length === 0, errors };
}
