// Source content schema type for Samjho Admin.
// Tracks where content originates and when it was checked.
//
// MICRO 8 (Source Registry + PIB fetcher foundation):
// - source_url  = Official Website URL (e.g. https://pib.gov.in/)
// - feed_url    = Optional RSS/Feed URL. Empty string means "not configured".
//                 Do NOT invent a feed URL. PIB ships with feed_url = "".
// - is_active   = Active (true) / Inactive (false). Optional, defaults to true.
// - checked_date = Last Checked (ISO date string). Optional.
// Existing fields and validation behaviour are preserved.

const SOURCE_FIELDS = [
  "id",
  "source_name",
  "source_url",
  "feed_url",
  "source_type",
  "is_active",
  "published_date",
  "checked_date",
];

const OPTIONAL_SOURCE_FIELDS = [
  "feed_url",
  "is_active",
  "published_date",
  "checked_date",
];

function normalizeSource(data = {}) {
  return Object.fromEntries(
    SOURCE_FIELDS.map((field) => {
      let value = data[field];

      if (field === "source_url" && typeof value === "string") {
        value = value.trim();
      }

      if (field === "feed_url") {
        // Feed URL is optional/configurable. Empty/missing stays empty.
        if (value == null) value = "";
        if (typeof value === "string") value = value.trim();
      }

      if (field === "is_active") {
        // Default to active when not explicitly set.
        if (value == null || value === "") value = true;
        if (typeof value === "string") {
          const v = value.trim().toLowerCase();
          if (v === "false" || v === "0" || v === "inactive" || v === "off") value = false;
          else if (v === "true" || v === "1" || v === "active" || v === "on") value = true;
          else value = true;
        }
        value = Boolean(value);
      }

      if (field === "source_type" && typeof value === "string") {
        value = value.trim().toLowerCase();
      }

      return [field, value];
    })
  );
}

function validateSource(data = {}) {
  const normalized = normalizeSource(data);
  const errors = [];

  if (!normalized.source_name || String(normalized.source_name).trim() === "") {
    errors.push("source_name is required");
  }

  if (!normalized.source_url || String(normalized.source_url).trim() === "") {
    errors.push("source_url is required");
  }

  if (!normalized.source_type || String(normalized.source_type).trim() === "") {
    errors.push("source_type is required");
  }

  // feed_url is intentionally optional (configurable/empty for PIB pilot).
  // is_active / checked_date / published_date are optional.

  return {
    normalized,
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  SOURCE_FIELDS,
  OPTIONAL_SOURCE_FIELDS,
  normalizeSource,
  validateSource,
};
