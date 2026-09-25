// Shared content status constants for Samjho Admin content schema.
// Reusable by future database or CMS integration.

const STATUS = {
  DRAFT: "draft",
  REVIEW: "review",
  APPROVED: "approved",
  PUBLISHED: "published",
};

const STATUS_VALUES = Object.values(STATUS);

function isValidStatus(value) {
  return STATUS_VALUES.includes(String(value).toLowerCase());
}

module.exports = {
  STATUS,
  STATUS_VALUES,
  isValidStatus,
};
