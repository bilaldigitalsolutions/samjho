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
  // Pre-rendered body HTML. Used by legacy articles whose body contains tables,
  // ordered step lists or tool cards that the markdown renderer cannot express.
  // When present it wins over `content` (see buildBody in master-guide.js).
  "content_html",
  "eligibility",
  "benefits",
  "required_documents",
  "application_process",
  "important_dates",
  "common_mistakes",
  "faqs",
  "source_ids",
  "officialReferences",
  "sources",
  // Explicit related-guide links carried over from the legacy article schema.
  // buildRelatedGuides prefers these and falls back to the category listing.
  "relatedGuides",
  "status",
  "last_updated",
  "hero_image",
  "image_photographer",
  "image_photographer_url",
  "content_type",
];

const OPTIONAL_GUIDE_FIELDS = [
  "content_html",
  "eligibility",
  "benefits",
  "required_documents",
  "application_process",
  "important_dates",
  "common_mistakes",
  "faqs",
  "source_ids",
  "officialReferences",
  "sources",
];

function normalizeGuide(data = {}) {
  return Object.fromEntries(
    GUIDE_FIELDS.map((field) => {
      let value = data[field];

      if (field === "source_ids") {
        if (!Array.isArray(value)) value = [];
        value = value.filter((id) => id != null && String(id).trim() !== "");
      }

      // Outbound authoritative links (label + href + description) or plain
      // URL strings. Kept as-is so the template can render real anchors.
      if (field === "officialReferences" || field === "sources") {
        if (!Array.isArray(value)) value = [];
        value = value.filter((ref) => {
          if (typeof ref === "string") return /^https?:\/\//i.test(ref.trim());
          return !!(ref && typeof ref === "object" && (ref.href || ref.source_url));
        });
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
