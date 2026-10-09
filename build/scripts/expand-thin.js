#!/usr/bin/env node
// =============================================================================
// EXPAND THIN ARTICLES — deepen short articles and enrich FAQs via DeepSeek.
// =============================================================================
// Fixes two issues from the content audit:
//   ISSUE 2 (thin content) : target 300+ words and 5+ FAQs per article.
//   ISSUE 3 (content quality): write about the ACTUAL TOPIC, never about the
//            source page ("this page says...", "the shared text...").
//
// Safety — "Do NOT change existing content meaning":
//   mode "append"  (default): existing content + FAQ answers kept VERBATIM
//                            (verified by a substring check before any write).
//   mode "rewrite" (only for source-page articles): body replaced, but every
//                            URL and number from the original must survive or
//                            the article is rejected and left untouched.
//
// Usage:
//   node build/scripts/expand-thin.js --dry-run
//   node build/scripts/expand-thin.js --limit=5
//   node build/scripts/expand-thin.js --slug=income-tax-exemption-notifications-startup-india
//   node build/scripts/expand-thin.js --slug=a,b,c     (comma separated list)
// =============================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
try {
  require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });
} catch (e) { /* optional */ }

const lib = require("./readability-lib");

const ROOT = path.resolve(__dirname, "../..");
const STORE_PATH = path.join(ROOT, "build", "data", "published-guides.json");
const REPORT_PATH = path.join(ROOT, "build", "data", "thin-content-report.json");

const API_KEY = process.env.DEEPSEEK_API_KEY || "";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";
const TARGET_WORDS = 300;
const TARGET_FAQS = 5;
const MAX_FAQS = 6; // target is "5-6 FAQs per article"

// Section titles the page template renders itself — the model must NOT emit
// these or the page would show the heading twice (see master-guide.js).
const RESERVED_HEADINGS = [
  "quick summary", "why it matters", "eligibility", "benefits",
  "required documents", "how to apply", "important dates", "common mistakes",
  "faqs", "frequently asked questions", "official sources", "disclaimer",
  "related guides", "related tools",
];

// Language that describes the source page instead of the topic (Issue 3).
// Deliberately broad: these phrases mean the article talks ABOUT the document
// or web page instead of answering the reader's question.
const SOURCE_PAGE_PATTERNS = [
  /\bthis page\b/i,
  /\bthe page (is|was|does|acts|comes|shows|collects|says|means|carries|provides)\b/i,
  /\bpage (says|shows|collects|carries|means|acts|does)\b/i,
  /\bsource page\b/i,
  /\bshared text\b/i,
  /\bthe text (shared|received)\b/i,
  /\bsource text\b/i,
  /\btext we received\b/i,
  /\bpage says\b/i,
  /\bsource (does not|mentions|names|says|explains|contains|carries|for this)\b/i,
  /\bnot given in the source\b/i,
  /\bopen the page\b/i,
  /\bdo not read this page\b/i,
  /\bas per the source\b/i,
  /\bin the source text\b/i,
  /\bthe official page\b/i,
  /\bcheck the official page\b/i,
  /\blisted on the \w+ website\b/i,
  /\breleased the original information used/i,
];

const args = process.argv.slice(2);
function flag(n) { return args.indexOf("--" + n) !== -1; }
function value(n, f) {
  for (let i = 0; i < args.length; i++) if (args[i].indexOf("--" + n + "=") === 0) return args[i].slice(n.length + 3);
  return f;
}
const DRY_RUN = flag("dry-run");
const SLUG = value("slug", "");
const LIMIT = parseInt(value("limit", "0"), 10) || 0;

function text(v) { return String(v == null ? "" : v); }
function readStore() {
  if (!fs.existsSync(STORE_PATH)) return [];
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}
function writeStore(list) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(list, null, 2) + "\n", "utf8");
}
function norm(s) { return text(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

// Same measurement used to find thin articles.
function wordCount(guide) {
  const t = lib.plainText([
    guide.content || "", guide.summary || "",
    (guide.faqs || guide.faq || []).map((f) => f.a || f.answer || "").join(" "),
  ].join(" "));
  return t.split(/\s+/).filter(Boolean).length;
}
function faqCount(guide) {
  const f = guide.faqs || guide.faq || [];
  return Array.isArray(f) ? f.length : 0;
}
function hasSourcePageLanguage(guide) {
  const t = [
    guide.content || "", guide.summary || "",
    (guide.faqs || guide.faq || []).map((f) => (f.q || f.question || "") + " " + (f.a || f.answer || "")).join(" "),
  ].join(" ");
  return SOURCE_PAGE_PATTERNS.some((re) => re.test(t));
}
// Off-topic text inside one FAQ answer.
function faqOffTopic(f) {
  const a = text(f && (f.a || f.answer));
  return !!a && SOURCE_PAGE_PATTERNS.some((re) => re.test(a));
}
function existingHeadings(guide) {
  return (text(guide.content).match(/^#{1,4}\s+.+$/gm) || []).map((h) => norm(h.replace(/^#+\s+/, "")));
}

// Flat text of every field the reader ends up seeing. A number/URL that moves
// between fields (e.g. the summary's "(Source: ..., 25 September 2026.)" trailer
// dropped while the same date stays in important_dates) is still preserved.
function flatGuide(guide) {
  return [
    guide.content || "",
    guide.summary || "",
    (Array.isArray(guide.important_dates) ? guide.important_dates : []).join(" "),
    (guide.faqs || guide.faq || [])
      .map((f) => ((f && (f.q || f.question)) || "") + " " + ((f && (f.a || f.answer)) || ""))
      .join(" "),
  ].join(" ");
}

// Every number, URL and domain in the original must survive a rewrite.
function criticalTokens(guide) {
  const t = flatGuide(guide);
  return {
    nums: Array.from(new Set(t.match(/\b\d[\d,]*(?:\.\d+)?\b/g) || [])),
    urls: Array.from(new Set(t.match(/https?:\/\/[^\s)\]"']+/g) || [])),
    domains: Array.from(new Set(t.match(/\b[a-z0-9-]+\.(?:gov\.in|nic\.in|org\.in|co\.in|com|org|net|in)\b/gi) || [])),
  };
}
function checkPreserved(original, next) {
  const missing = [];
  const c = criticalTokens(original);
  const flat = flatGuide(next);
  const flatLower = flat.toLowerCase();
  c.nums.forEach((n) => { if (flat.indexOf(n) === -1) missing.push("number " + n); });
  c.urls.forEach((u) => { if (flat.indexOf(u) === -1) missing.push("url " + u); });
  c.domains.forEach((d) => { if (flatLower.indexOf(d.toLowerCase()) === -1) missing.push("domain " + d); });
  return missing;
}
function stripReserved(md) {
  return text(md).split("\n").map((line) => {
    const m = /^(\s{0,3}#{1,4}\s+)(.+)/.exec(line);
    if (!m) return line;
    return RESERVED_HEADINGS.indexOf(norm(m[2])) !== -1 ? "" : line;
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// DeepSeek call
// ---------------------------------------------------------------------------

function callDeepSeek(system, user) {
  const body = JSON.stringify({
    model: MODEL,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    temperature: 0.4,
    max_tokens: 6000,
    stream: false,
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.deepseek.com", path: "/chat/completions", method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + API_KEY,
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 180000,
    }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error("DeepSeek HTTP " + res.statusCode + ": " + b.slice(0, 300)));
        try {
          const j = JSON.parse(b);
          const content = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : "";
          if (!content) return reject(new Error("DeepSeek returned empty content"));
          resolve(content);
        } catch (e) { reject(new Error("DeepSeek bad JSON: " + b.slice(0, 300))); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("DeepSeek timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function extractJson(raw) {
  const s = text(raw);
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("no JSON object in model reply");
  return JSON.parse(s.slice(start, end + 1));
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(guide, mode) {
  const existingFaqs = (guide.faqs || guide.faq || []);
  const sources = (guide.officialReferences || guide.source_ids || [])
    .map((s) => (typeof s === "string" ? s : (s && (s.href || s.source_url)) || ""))
    .filter(Boolean);
  const faqText = existingFaqs.map((f, i) => (i + 1) + ". Q: " + (f.q || f.question) + "\n   A: " + (f.a || f.answer)).join("\n");

  const system = [
    "You write practical, accurate help content for Indian readers of Samjho India.",
    "Plain English, short sentences (max 15 words), short paragraphs (max 4 lines).",
    "You may use light Hinglish where it helps the reader, but keep it natural.",
    "NEVER invent facts, numbers, dates, amounts or official rules. If something is unknown, say plainly that the official source does not list it and tell the reader where to check.",
    "Write about the ACTUAL TOPIC the reader cares about, never about a web page or a document.",
    "BANNED WORDING - if you use any of these phrases your answer is rejected:",
    "'this page', 'the page', 'source page', 'the source says', 'the source text',",
    "'shared text', 'text we received', 'as per the source', 'the source does not',",
    "'open the page', 'the official page', 'page collects', 'page is meant',",
    "'page for the latest', 'in the source'.",
    "Instead of talking about where information came from, state the fact itself,",
    "or end with: 'Check the official portal for the latest rules.'",
    "Give practical steps, examples and who it applies to.",
    "Always answer JSON only. No markdown fences, no commentary.",
  ].join(" ");

  const schema = mode === "rewrite"
    ? {
        content: "## What Happened\n...full replacement markdown body, 300+ words...",
        summary: "1-2 sentence plain-English summary",
        new_faqs: [{ q: "question", a: "answer" }],
        new_dates: ["12 March 2026 — what happened"],
      }
    : {
        new_sections: [{ heading: "How to Apply", body: "markdown paragraphs and - bullets, no heading markers" }],
        new_faqs: [{ q: "question", a: "answer" }],
        new_dates: ["12 March 2026 — what happened"],
      };

  const user = [
    "ARTICLE TITLE: " + (guide.title || ""),
    "CATEGORY: " + (guide.category || "") + "   CONTENT TYPE: " + (guide.content_type || ""),
    "OFFICIAL SOURCES: " + (sources.length ? sources.join(" | ") : "(none)"),
    "",
    "--- EXISTING FAQS (" + existingFaqs.length + ") ---",
    faqText || "(none)",
    "",
    "--- EXISTING " + (mode === "rewrite" ? "CONTENT" : "CONTENT (keep this text exactly as it is, do not rewrite or remove it)") + " ---",
    text(guide.content),
    "",
    "TASK:",
    mode === "rewrite"
      ? [
          "Rewrite the body so it answers what a reader actually wants to know about this topic:",
          "what it is, who it applies to, how it works, what to do (steps), what documents or",
          "details are needed, a real example, and what to verify officially.",
          "Keep every existing URL, number, date, name and section heading meaning.",
          "300+ words. Do NOT describe any page, PDF, document or source.",
        ].join(" ")
      : "Add 1-2 NEW sections that deepen the topic (practical steps, examples, what it means for the reader, eligibility or documents if relevant). Do not repeat what is already written. Also add 3-4 NEW FAQs that are not already asked, and answer them.",
    "Add 1-3 items to new_dates ONLY for dates that already appear in the article above or are stated in the official sources. Use [] if none apply.",
    "FAQ RULE: if an EXISTING FAQ answer describes the source page/document instead of the",
    "topic (e.g. \"this page\", \"the page is from\", \"listed on the ... website\", \"the source does",
    "not say\"), put that SAME question in new_faqs with a corrected topic-focused answer. The",
    "question text must match the existing one exactly. Existing answers that are already",
    "on-topic must NOT be included.",
    "Do NOT include the section titles: " + RESERVED_HEADINGS.join(", ") + ".",
    "",
    "RETURN EXACTLY THIS JSON SHAPE:",
    JSON.stringify(schema, null, 2),
  ].join("\n");

  return { system: system, user: user };
}

// ---------------------------------------------------------------------------
// Merge + validation
// ---------------------------------------------------------------------------

function mergeAppend(guide, reply) {
  const next = Object.assign({}, guide);
  const seenHeads = existingHeadings(guide);
  const blocks = [];
  const fixedIndexes = [];
  (Array.isArray(reply.new_sections) ? reply.new_sections : []).forEach((s) => {
    const heading = text(s && s.heading).replace(/^#+\s*/, "").replace(/\s+/g, " ").trim();
    const body = stripReserved(text(s && s.body).replace(/\r/g, "").trim());
    if (!heading || !body) return;
    if (RESERVED_HEADINGS.indexOf(norm(heading)) !== -1) return;
    if (seenHeads.indexOf(norm(heading)) !== -1) return;
    seenHeads.push(norm(heading));
    blocks.push("## " + heading + "\n\n" + body);
  });
  if (blocks.length) next.content = text(guide.content).replace(/\s+$/, "") + "\n\n" + blocks.join("\n\n");

  const existing = Array.isArray(guide.faqs) ? guide.faqs : (Array.isArray(guide.faq) ? guide.faq : []);
  const seenQ = existing.map((f) => norm(f.q || f.question));
  const added = [];
  // Off-topic existing answers may be replaced by a corrected answer for the
  // same question; on-topic existing answers are never touched (Issue 3: no
  // change to meaning without a reason).
  const fixed = existing.map((f, i) => {
    if (!faqOffTopic(f)) return f;
    const want = norm(f.q || f.question);
    const model = (Array.isArray(reply.new_faqs) ? reply.new_faqs : [])
      .find((m) => norm(m && m.q) === want && text(m && m.a).trim());
    if (!model) return f;
    fixedIndexes.push(i);
    return { q: f.q || f.question, a: text(model.a).replace(/\s+/g, " ").trim() };
  });
  (Array.isArray(reply.new_faqs) ? reply.new_faqs : []).forEach((f) => {
    const q = text(f && f.q).replace(/\s+/g, " ").trim();
    const a = text(f && f.a).replace(/\s+/g, " ").trim();
    if (!q || !a) return;
    if (seenQ.indexOf(norm(q)) !== -1) return;
    seenQ.push(norm(q));
    added.push({ q: q, a: a });
  });
  if (existing.length || added.length) {
    // Target is 5-6 FAQs: keep every existing FAQ, add new ones up to 6 total.
    const room = Math.max(0, MAX_FAQS - existing.length);
    next.faqs = fixed.concat(added.slice(0, room));
  }

  return { next: next, added: next.faqs.slice(fixed.length), sections: blocks.length, faqFixes: fixedIndexes.length };
}

function mergeRewrite(guide, reply) {
  const next = Object.assign({}, guide);
  const content = stripReserved(text(reply.content).replace(/\r/g, "").trim());
  if (content) next.content = content;
  const summary = text(reply.summary).replace(/\s+/g, " ").trim();
  if (summary) next.summary = summary;

  const existing = Array.isArray(guide.faqs) ? guide.faqs : (Array.isArray(guide.faq) ? guide.faq : []);
  const seenQ = existing.map((f) => norm(f.q || f.question));
  const added = [];
  let faqFixes = 0;
  // Replace ONLY off-topic existing answers (same question required); every
  // on-topic existing answer is kept exactly as written.
  const fixed = existing.map((f) => {
    if (!faqOffTopic(f)) return f;
    const want = norm(f.q || f.question);
    const model = (Array.isArray(reply.new_faqs) ? reply.new_faqs : [])
      .find((m) => norm(m && m.q) === want && text(m && m.a).trim());
    if (!model) return f;
    faqFixes++;
    return { q: f.q || f.question, a: text(model.a).replace(/\s+/g, " ").trim() };
  });
  (Array.isArray(reply.new_faqs) ? reply.new_faqs : []).forEach((f) => {
    const q = text(f && f.q).replace(/\s+/g, " ").trim();
    const a = text(f && f.a).replace(/\s+/g, " ").trim();
    if (!q || !a) return;
    if (seenQ.indexOf(norm(q)) !== -1) return;
    seenQ.push(norm(q));
    added.push({ q: q, a: a });
  });
  if (existing.length || added.length) {
    const room = Math.max(0, MAX_FAQS - existing.length);
    next.faqs = fixed.concat(added.slice(0, room));
  }
  return { next: next, added: next.faqs.slice(fixed.length), sections: 1, faqFixes: faqFixes };
}

// Dates the model may add must already appear in the article (no invention).
function mergeDates(guide, reply) {
  const known = [guide.content || "", guide.summary || ""].join(" ");
  const out = [];
  (Array.isArray(reply.new_dates) ? reply.new_dates : []).slice(0, 3).forEach((d) => {
    const s = text(d).replace(/\s+/g, " ").trim();
    if (s.length < 15 || s.length > 200) return;
    const years = s.match(/\b20\d{2}\b/) || [];
    if (years.length && years.some((y) => known.indexOf(y) !== -1)) out.push(s);
  });
  return out;
}

function validate(original, next, mode, addedFaqs, addedSections, faqFixes) {
  const errors = [];
  const w = wordCount(next);
  const f = faqCount(next);

  if (mode === "append") {
    const orig = text(original.content).trim();
    if (orig && text(next.content).indexOf(orig) === -1) errors.push("existing content was modified (append mode must keep it verbatim)");
    const origAnswers = (Array.isArray(original.faqs) ? original.faqs : (original.faq || []))
      .map((x) => text(x.a || x.answer).trim()).filter(Boolean);
    origAnswers.forEach((a) => { if (text(next.content + " " + JSON.stringify(next.faqs)).indexOf(a) === -1) errors.push("existing FAQ answer lost"); });
    if (!addedSections) errors.push("no new sections returned");
    const addedText = text(next.content).slice(text(original.content).length);
    if (SOURCE_PAGE_PATTERNS.some((re) => re.test(addedText))) errors.push("new text still describes the source page");
  } else {
    const missing = checkPreserved(original, next);
    missing.forEach((m) => errors.push("lost " + m));
    if (SOURCE_PAGE_PATTERNS.some((re) => re.test(text(next.content)))) errors.push("rewritten body still describes the source page");
    const before = existingHeadings(original).length;
    const after = existingHeadings(next).length;
    if (after < before - 1) errors.push("structure lost (headings " + before + " -> " + after + ")");
  }

  if (w < TARGET_WORDS) errors.push("word count " + w + " < " + TARGET_WORDS);
  if (f < TARGET_FAQS) errors.push("faq count " + f + " < " + TARGET_FAQS);
  // Liveness check: we expect progress on FAQs whenever there is room for it.
  // An article that already has MAX_FAQS answers needs no new ones.
  const origFaqCount = Array.isArray(original.faqs) ? original.faqs.length
    : (Array.isArray(original.faq) ? original.faq.length : 0);
  if (!addedFaqs && !faqFixes && origFaqCount < MAX_FAQS) errors.push("no new faqs");
  // No FAQ answer may still describe the source page.
  const offTopicFaqs = (next.faqs || []).filter(faqOffTopic);
  if (offTopicFaqs.length) errors.push(offTopicFaqs.length + " faq answer(s) still describe the source page");
  return errors;
}

async function loadSlugRowMap() {
  let dbContent;
  try { dbContent = require("../db-content"); } catch (e) { return {}; }
  try {
    const rows = await dbContent.select("select=id,refined_guide&refined_guide=not.is.null&limit=400");
    const map = {};
    (rows || []).forEach((r) => {
      const s = r.refined_guide && r.refined_guide.slug;
      if (s && !map[s]) map[s] = r.id;
    });
    return map;
  } catch (e) {
    console.log("  WARNING: cannot read Supabase: " + e.message);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Expand one article (up to 2 model attempts)
// ---------------------------------------------------------------------------

async function expandArticle(guide) {
  const mode = hasSourcePageLanguage(guide) ? "rewrite" : "append";
  const wordsBefore = wordCount(guide);
  const faqsBefore = faqCount(guide);
  let lastErrors = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    const p = buildPrompt(guide, mode);
    let user = p.user;
    if (attempt > 1) {
      user += "\n\nIMPORTANT: your previous reply was rejected (" + lastErrors.join("; ") +
        "). Give at least " + TARGET_WORDS + " total words and at least " + TARGET_FAQS +
        " FAQs, and address every problem listed.";
    }
    let raw;
    try { raw = await callDeepSeek(p.system, user); }
    catch (e) { lastErrors = ["model error: " + e.message]; continue; }

    let reply;
    try { reply = extractJson(raw); }
    catch (e) { lastErrors = ["json parse failed: " + e.message]; continue; }

    const merged = mode === "rewrite" ? mergeRewrite(guide, reply) : mergeAppend(guide, reply);
    const next = merged.next;

    const dates = mergeDates(guide, reply);
    if (dates.length) {
      const cur = Array.isArray(next.important_dates) ? next.important_dates.slice() : [];
      const isMissing = !cur.length || cur.every((d) => /not specified/i.test(text(d)));
      next.important_dates = isMissing
        ? dates
        : cur.concat(dates.filter((d) => cur.indexOf(d) === -1));
    }

    const errors = validate(guide, next, mode, merged.added.length, merged.sections, merged.faqFixes || 0);
    if (!errors.length) {
      if (attempt > 1) console.log("   (attempt 1 was rejected: " + lastErrors.join("; ") + ")");
      return {
        ok: true, mode: mode, next: next, attempts: attempt,
        wordsBefore: wordsBefore, wordsAfter: wordCount(next),
        faqsBefore: faqsBefore, faqsAfter: faqCount(next),
        sections: merged.sections, faqsAdded: merged.added.length,
        datesAdded: dates.length,
      };
    }
    lastErrors = errors;
  }
  return { ok: false, mode: mode, wordsBefore: wordsBefore, faqsBefore: faqsBefore, errors: lastErrors };
}

async function main() {
  console.log("==============================================");
  console.log("EXPAND THIN ARTICLES");
  console.log("==============================================");
  console.log("Target : " + TARGET_WORDS + "+ words, " + TARGET_FAQS + "+ FAQs");
  console.log("Model  : " + MODEL + " | key " + (API_KEY ? "set" : "MISSING"));
  console.log("Mode   : " + (DRY_RUN ? "DRY RUN (no writes)" : "LIVE"));
  if (!API_KEY) { console.error("FATAL: DEEPSEEK_API_KEY not set."); process.exit(1); }
  console.log("");

  const store = readStore();
  let targets = store.filter((g) => g && g.slug && g.status === "approved");
  // Select on all three thin-content criteria (Issue 2 + Issue 3): too few
  // words, too few FAQs, or copy that describes the source page.
  targets = targets.filter((g) =>
    wordCount(g) < TARGET_WORDS || faqCount(g) < TARGET_FAQS || hasSourcePageLanguage(g));
  if (SLUG) {
    const wanted = SLUG.split(",").map((s) => s.trim()).filter(Boolean);
    targets = targets.filter((g) => wanted.some((s) => g.slug.indexOf(s) !== -1));
  }
  if (LIMIT > 0) targets = targets.slice(0, LIMIT);

  console.log("Articles matching thin criteria: " + targets.length + "\n");
  if (!targets.length) { console.log("Nothing to do."); return { processed: 0 }; }

  const rowMap = DRY_RUN ? {} : await loadSlugRowMap();
  const results = [];
  let okCount = 0, failCount = 0;

  for (let i = 0; i < targets.length; i++) {
    const original = targets[i];
    console.log("[" + (i + 1) + "/" + targets.length + "] " + original.slug +
      "  (" + wordCount(original) + "w, " + faqCount(original) + " faq)");
    let res;
    try { res = await expandArticle(original); }
    catch (e) { res = { ok: false, mode: "append", errors: ["exception: " + e.message] }; }

    if (!res.ok) {
      failCount++;
      console.log("   REJECTED: " + (res.errors || []).join("; "));
      results.push({ slug: original.slug, ok: false, mode: res.mode, errors: res.errors });
      continue;
    }
    okCount++;
    console.log("   OK [" + res.mode + "] " + res.wordsBefore + " -> " + res.wordsAfter + " words | " +
      res.faqsBefore + " -> " + res.faqsAfter + " faqs | +" + res.sections + " section(s), +" +
      res.faqsAdded + " faq(s), +" + res.datesAdded + " date(s)" +
      (res.attempts > 1 ? " (attempt " + res.attempts + ")" : ""));
    results.push({
      slug: original.slug, ok: true, mode: res.mode,
      words: [res.wordsBefore, res.wordsAfter], faqs: [res.faqsBefore, res.faqsAfter],
      sectionsAdded: res.sections, faqsAdded: res.faqsAdded, datesAdded: res.datesAdded,
    });

    if (DRY_RUN) continue;

    const rows = readStore();
    let hit = false;
    rows.forEach((r) => { if (r.slug === original.slug) { Object.assign(r, res.next); hit = true; } });
    if (hit) writeStore(rows);

    const rowId = rowMap[original.slug];
    if (rowId) {
      try {
        const dbContent = require("../db-content");
        const rec = await dbContent.selectOne("select=id,refined_guide&id=eq." + rowId + "&limit=1");
        if (rec && rec.refined_guide) {
          await dbContent.update(rowId, { refined_guide: Object.assign({}, rec.refined_guide, res.next) });
          console.log("   saved: published-guides.json + Supabase (" + rowId + ")");
        }
      } catch (e) { console.log("   WARNING: Supabase save failed: " + e.message); }
    } else {
      console.log("   saved: published-guides.json (no Supabase row for this slug)");
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    target: { words: TARGET_WORDS, faqs: TARGET_FAQS },
    matched: targets.length,
    expanded: okCount,
    rejected: failCount,
    results: results,
  };
  if (!DRY_RUN) fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log("\n==============================================");
  console.log("SUMMARY");
  console.log("==============================================");
  console.log("Thin articles matched : " + targets.length);
  console.log("Expanded              : " + okCount);
  console.log("Rejected              : " + failCount);
  if (okCount) {
    const exp = results.filter((r) => r.ok);
    console.log("Avg words before/after: " +
      Math.round(exp.reduce((a, r) => a + r.words[0], 0) / exp.length) + " -> " +
      Math.round(exp.reduce((a, r) => a + r.words[1], 0) / exp.length));
    console.log("Avg faqs before/after : " +
      Math.round(exp.reduce((a, r) => a + r.faqs[0], 0) / exp.length) + " -> " +
      Math.round(exp.reduce((a, r) => a + r.faqs[1], 0) / exp.length));
  }
  console.log("==============================================");
  if (!DRY_RUN) console.log("Report: build/data/thin-content-report.json");
  return report;
}

module.exports = { main, expandArticle, wordCount, faqCount, hasSourcePageLanguage, validate };

if (require.main === module) {
  main().catch((e) => { console.error("FATAL:", e && e.message ? e.message : e); process.exit(1); });
}




