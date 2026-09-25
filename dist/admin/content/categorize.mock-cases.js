// MICRO 10 mock test cases (deterministic categorizer).
// Covers: scheme, service, scholarship, business, education, unclear.
// Run: node build/verify-micro10.js (exercises categorize.js directly).
// This file documents the same fixtures for admin reviewers.

var MICRO10_MOCK_CASES = [
  { id: "mock-scheme", expect: "Government / Schemes & Benefits / Farmers" },
  { id: "mock-service", expect: "Government / Government Services" },
  { id: "mock-scholarship", expect: "Government / Scholarships / Students" },
  { id: "mock-business", expect: "Business / Entrepreneurs" },
  { id: "mock-education", expect: "Education / Students" },
  { id: "mock-unclear", expect: "Needs Manual Categorization" }
];

if (typeof module === "object" && module.exports) {
  module.exports = MICRO10_MOCK_CASES;
}
