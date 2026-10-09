// Published guides store — the bridge between the admin workflow and the
// static build. Approved guides are staged here; build.js renders them via
// the Master Guide Template into dist/guides/<slug>/index.html.
//
// No database. This JSON file IS the persistent store for now. A future
// database integration can replace the read/write internals of this module
// without touching build.js or the admin UI.

const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "published-guides.json");

// Existing public guides must never be replaced by the publishing pipeline.
const articles = require("./articles");
const schemes = require("./schemes");
const calculators = require("./calculators");
const { guideQualityErrors } = require("../quality");

const RESERVED_SLUGS = new Set(
  []
    .concat(articles.map((a) => a.slug))
    .concat(schemes.map((s) => s.slug))
    .concat(calculators.map((c) => c.slug))
);

function readStore() {
  if (!fs.existsSync(STORE_PATH)) return [];
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    throw new Error("published-guides.json is not valid JSON: " + err.message);
  }
}

function writeStore(list) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(list, null, 2) + "\n", "utf8");
}

// Load the approved, staged guides for rendering during build.
// Only guides with status "approved" are returned.
function loadPublishedGuides() {
  return readStore().filter((g) => g && g.status === "approved");
}

// Publish action: stage ONE explicitly published Guide into the store.
// Hard requirement: the guide must have status === "approved".
// Draft / review guides are rejected — only an approved Guide can publish.
function stageApprovedGuide(guide) {
  if (!guide || typeof guide !== "object") {
    throw new Error("stageApprovedGuide: guide object is required");
  }
  if (guide.status !== "approved") {
    throw new Error(
      'stageApprovedGuide: publishing requires status "approved" (got "' +
        (guide.status || "none") + '")'
    );
  }
  if (!guide.slug || RESERVED_SLUGS.has(guide.slug)) {
    throw new Error(
      "stageApprovedGuide: slug missing or reserved by an existing public page: " +
        (guide.slug || "(none)")
    );
  }

  const list = readStore();
  const existingIndex = list.findIndex((g) => g.slug === guide.slug);

  if (guide.title && !String(guide.title).trim()) {
    throw new Error("stageApprovedGuide: title is required");
  }

  const entry = Object.assign({}, guide);
  entry.last_updated = entry.last_updated || new Date().toISOString().slice(0, 10);

  // Quality gate — thin (< 300 words or < 3 FAQs) or test/mock content is
  // never staged. Expand the guide to 300+ words with 3+ FAQs, then publish
  // again; the build's noindex + sitemap filters remain as a safety net for
  // anything already in the store.
  const qualityErrors = guideQualityErrors(entry);
  if (qualityErrors.length) {
    throw new Error("Quality gate rejected \"" + (guide.slug || "(no slug)") + "\": " + qualityErrors.join("; "));
  }

  if (existingIndex === -1) {
    list.push(entry);
  } else {
    list[existingIndex] = entry; // re-publish/update an already staged approved guide
  }

  writeStore(list);
  return entry;
}

function removePublishedGuide(slug) {
  const list = readStore();
  const next = list.filter((g) => g.slug !== slug);
  const removed = next.length !== list.length;
  if (removed) writeStore(next);
  return removed;
}

function isSlugReserved(slug) {
  return RESERVED_SLUGS.has(slug);
}

module.exports = {
  loadPublishedGuides,
  stageApprovedGuide,
  removePublishedGuide,
  isSlugReserved,
  guideQualityErrors,
};
