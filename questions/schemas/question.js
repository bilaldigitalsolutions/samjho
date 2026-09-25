// Question content schema type for Samjho Questions module.
// Kept separate from admin code but aligned with the same schema concepts.

const QUESTION_FIELDS = [
  "id",
  "question",
  "category",
  "answer",
  "source_ids",
  "status",
  "last_updated",
];

const VALID_STATUSES = ["draft", "review", "approved", "published"];

function normalizeQuestion(data = {}) {
  return Object.fromEntries(
    QUESTION_FIELDS.map((field) => {
      let value = data[field];

      if (field === "source_ids") {
        if (!Array.isArray(value)) value = [];
        value = value.filter((id) => id != null && String(id).trim() !== "");
      }

      if (field === "status") {
        if (!VALID_STATUSES.includes(String(value).toLowerCase())) {
          value = "draft";
        } else {
          value = String(value).toLowerCase();
        }
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
  VALID_STATUSES,
  normalizeQuestion,
  validateQuestion,
};
