// Guide content schema type for Samjho Admin.
// Designed to stay reusable for future database/CMS integration.

const { isValidStatus } = require("./status");

const GUIDE_FIELDS = [
  "id",
  "title",
  "slug",
  "category",
  "summary",
  "content",
  "eligibility",
  "benefits",
  "required_documents",
  "application_process",
  "important_dates",
  "common_mistakes",
  "faqs",
  "source_ids",
  "status",
  "last_updated",
  "hero_image",
  "image_photographer",
  "image_photographer_url",
  "content_type",
];

const OPTIONAL_GUIDE_FIELDS = [
  "eligibility",
  "benefits",
  "required_documents",
  "application_process",
  "important_dates",
  "common_mistakes",
  "faqs",
  "source_ids",
];

function normalizeGuide(data = {}) {
  return Object.fromEntries(
    GUIDE_FIELDS.map((field) => {
      let value = data[field];

      if (field === "source_ids") {
        if (!Array.isArray(value)) value = [];
        value = value.filter((id) => id != null && String(id).trim() !== "");
      }

      if (field === "faqs") {
        if (!Array.isArray(value)) value = [];
      }

      if (field === "status") {
        if (!isValidStatus(value)) value = "draft";
        value = String(value).toLowerCase();
      }

      if (field === "slug" && typeof value === "string") {
        value = value.trim().toLowerCase().replace(/\s+/g, "-");
      }

      return [field, value];
    })
  );
}

function validateGuide(data = {}) {
  const normalized = normalizeGuide(data);
  const errors = [];

  if (!normalized.title || String(normalized.title).trim() === "") {
    errors.push("title is required");
  }

  if (!normalized.slug || String(normalized.slug).trim() === "") {
    errors.push("slug is required");
  }

  if (!normalized.category || String(normalized.category).trim() === "") {
    errors.push("category is required");
  }

  if (normalized.status === "published" && !normalized.last_updated) {
    errors.push("published guides should include last_updated");
  }

  return {
    normalized,
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  GUIDE_FIELDS,
  OPTIONAL_GUIDE_FIELDS,
  normalizeGuide,
  validateGuide,
};
