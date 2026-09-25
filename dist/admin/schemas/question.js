// Question content schema type for Samjho Admin.
// Mirrors the question structure used by the separate questions module,
// while staying reusable for future database integration.

const { isValidStatus } = require("./status");

const QUESTION_FIELDS = [
  "id",
  "question",
  "category",
  "answer",
  "source_ids",
  "status",
  "last_updated",
];

const OPTIONAL_QUESTION_FIELDS = ["source_ids"];

function normalizeQuestion(data = {}) {
  return Object.fromEntries(
    QUESTION_FIELDS.map((field) => {
      let value = data[field];

      if (field === "source_ids") {
        if (!Array.isArray(value)) value = [];
        value = value.filter((id) => id != null && String(id).trim() !== "");
      }

      if (field === "status") {
        if (!isValidStatus(value)) value = "draft";
        value = String(value).toLowerCase();
      }

      return [field, value];
    })
  );
}

function validateQuestion(data = {}) {
  const normalized = normalizeQuestion(data);
  const errors = [];

  if (!normalized.question || String(normalized.question).trim() === "") {
    errors.push("question is required");
  }

  if (!normalized.category || String(normalized.category).trim() === "") {
    errors.push("category is required");
  }

  if (!normalized.answer || String(normalized.answer).trim() === "") {
    errors.push("answer is required");
  }

  return {
    normalized,
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  QUESTION_FIELDS,
  OPTIONAL_QUESTION_FIELDS,
  normalizeQuestion,
  validateQuestion,
};
