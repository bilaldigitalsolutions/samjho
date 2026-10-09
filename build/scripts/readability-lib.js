#!/usr/bin/env node
// =============================================================================
// READABILITY LIBRARY — shared text metrics + SAFE simplification helpers.
// =============================================================================
// Used by:
//   build/scripts/check-quality.js        (Content Quality Checker)
//   build/scripts/refine-readability.js   (re-refine pass: Supabase + local)
//   build/scripts/run-pipeline.js         (readability gate + step)
//
// Rules (TASK: improve content readability):
//   1. Sentence length   : target max 15 words, hard flag above 20 words.
//   2. Paragraph length  : target max 3-4 lines (~55 words) per paragraph.
//   3. Simple words      : "utilize" -> "use", "facilitate" -> "help".
//   4. Outbound links    : 2-3 authoritative links per article
//                          (owning ministry / official portal / PIB release).
//   5. Statistical data  : keep real numbers, percentages and dates; add the
//                          real source date when the record has one. NOTHING
//                          IS INVENTED — no new facts, no new numbers.
//
// MEANING IS NEVER CHANGED. The enhancer only:
//   * splits long sentences at real clause boundaries,
//   * splits long paragraphs at sentence boundaries,
//   * swaps complex words for simple synonyms using the fixed maps below,
//   * adds authoritative outbound links + real dates already in the record.
//
// HINGLISH: existing Hinglish words (yojana, paisa, kagaz, mahine, ...) are
// left untouched and are never counted as "complex words".
// =============================================================================
"use strict";

// ---------------------------------------------------------------------------
// 1. Vocabulary — fixed 1:1 complex -> simple maps (safe synonyms only)
// ---------------------------------------------------------------------------

var COMPLEX_WORDS = {
  "utilize": "use", "utilizes": "uses", "utilized": "used", "utilizing": "using",
  "utilise": "use", "utilises": "uses", "utilised": "used", "utilising": "using",
  "utilization": "use", "utilisation": "use",
  "facilitate": "help", "facilitates": "helps", "facilitated": "helped",
  "facilitating": "helping", "facilitation": "help",
  "approximately": "about", "additionally": "also", "subsequently": "later",
  "subsequent": "later", "commence": "start", "commences": "starts",
  "commenced": "started", "commencement": "start",
  "initiate": "start", "initiates": "starts", "initiated": "started",
  "initiating": "starting", "terminate": "end", "terminates": "ends",
  "terminated": "ended", "termination": "end",
  "obtain": "get", "obtains": "gets", "obtained": "got", "obtaining": "getting",
  "ascertain": "find out", "ascertained": "found out",
  "assistance": "help",
  "sufficient": "enough", "insufficient": "not enough",
  "numerous": "many", "regarding": "about",
  "pertaining": "relating", "therefore": "so", "consequently": "so",
  "nevertheless": "still", "furthermore": "also", "moreover": "also",
  "however": "but",
  "expedite": "speed up", "expedited": "sped up",
  "disseminate": "share", "disseminated": "shared", "stipulated": "stated",
  "stipulates": "states", "requisite": "needed", "mandated": "required",
  "mandatory": "required", "optimal": "best", "optimize": "improve",
  "optimise": "improve", "methodology": "method", "substantial": "large",
  "commensurate": "matching",
  "alleviate": "ease", "mitigate": "reduce", "mitigation": "reduction",
  "prohibit": "ban", "prohibited": "banned", "prohibits": "bans",
  "augment": "increase", "augmented": "increased",
  "emphasized": "stressed", "emphasised": "stressed",
  "demonstrate": "show", "demonstrates": "shows", "demonstrated": "showed",
  "adequate": "enough", "inadequate": "not enough", "eliminate": "remove",
  "eliminated": "removed", "remuneration": "pay", "consolidate": "merge",
  "consolidated": "merged", "modalities": "ways", "expeditiously": "quickly",
  "promulgated": "issued", "envisaged": "planned", "undertake": "take up",
  "undertaken": "taken up", "accorded": "given",
};

// Multi-word phrases -> simpler phrases. Applied before the word map.
var COMPLEX_PHRASES = {
  "in order to": "to",
  "prior to": "before",
  "pursuant to": "under",
  "with regard to": "about",
  "with respect to": "about",
  "in accordance with": "as per",
  "due to the fact that": "because",
  "at this point in time": "now",
  "a number of": "several",
  "in the event that": "if",
  "on account of": "because of",
  "in the absence of": "without",
  "in addition to": "besides",
  "a majority of": "most",
  "not later than": "by",
  "is required to": "must",
  "are required to": "must",
  "shall be": "must be",
  "shall not": "must not",
  "in the case of": "for",
  "for the purpose of": "to",
  "in view of the fact that": "because",
  "take into consideration": "consider",
  "take into account": "consider",
  "put in place": "set up",
  "on the basis of": "based on",
  "in the near future": "soon",
  "at the earliest": "soon",
  "is applicable to": "applies to",
  "are applicable to": "apply to",
  "in a timely manner": "on time",
  "with a view to": "to",
  "does not exceed": "is below",
  "in excess of": "more than",
  "the vast majority of": "most",
  "is of the opinion that": "thinks that",
  "as per the provisions of": "under",
  "it is pertinent to note that": "note that",
  "it may be noted that": "note that",
};

// Hinglish / Indic-loan words: never simplified, never counted as complex.
var HINGLISH_WORDS = [
  "yojana", "paisa", "paise", "kagaz", "kagazat", "mahine", "mahina",
  "aavedan", "praman", "patra", "sarkari", "sarkar", "khata", "khate",
  "jama", "milega", "karna", "karein", "karen", "hoga", "hain", "hai",
  "nahi", "zaroori", "jaankari", "labh", "bharat", "rozgar", "kisan",
  "shiksha", "swasthya", "vittiya", "arthik",
];
var HINGLISH_SET = {};
HINGLISH_WORDS.forEach(function (w) { HINGLISH_SET[w] = true; });

// Abbreviations that must never be treated as a sentence end.
var ABBREVIATIONS = [
  "Shri", "Smt", "Dr", "Mr", "Mrs", "Ms", "Prof", "Hon", "No", "Nos", "vs",
  "etc", "i.e", "e.g", "Sr", "Jr", "St", "Ltd", "Pvt", "Inc", "Co", "Govt",
  "Dept", "Min", "Sec", "Art", "Fig", "Vol", "Ed", "Est", "approx", "Sept",
  "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug",
  "PIB", "RBI", "EPFO", "UAN", "PAN", "KYC", "CKYC", "OTP", "ECR", "PPO",
  "MSME", "GST", "SEBI", "DGFT", "DPIIT", "AICTE", "IMEI", "CEO", "SC",
  "OBC", "EWS", "IAS", "IPS", "km", "Kg", "Rs", "Phase", "FY",
];

var GUARD = "\u0001"; // placeholder that survives sentence splitting

// Words that can start a full clause — keeps sentence splits safe.
var CLAUSE_STARTERS = {
  it: 1, he: 1, she: 1, they: 1, we: 1, you: 1, i: 1, there: 1, this: 1,
  that: 1, these: 1, those: 1, the: 1, his: 1, her: 1, their: 1, its: 1,
  our: 1, such: 1, many: 1, some: 1, most: 1, all: 1, both: 1, each: 1,
  every: 1, another: 1, other: 1, others: 1, several: 1, people: 1,
  citizens: 1, government: 1, india: 1, banks: 1, employers: 1,
  employees: 1, members: 1, applicants: 1, users: 1, students: 1,
  farmers: 1, authorities: 1, officials: 1, experts: 1, once: 1, first: 1,
  anyone: 1, one: 1, two: 1, three: 1, only: 1, also: 1,
};

var VERB_HINTS = /\b(is|are|was|were|will|would|can|could|should|may|might|must|has|have|had|do|does|did|gets|get|gives|give|helps|help|needs|need|wants|want|uses|use|means|makes|make|takes|take|comes|come|goes|go|says|said|shows|show|becomes|became)\b/i;

// ---------------------------------------------------------------------------
// 2. Text utilities
// ---------------------------------------------------------------------------

function text(v) { return String(v == null ? "" : v); }
function round1(n) { return Math.round(n * 10) / 10; }
function pct(part, whole) { return whole > 0 ? part / whole : 0; }

function words(s) {
  return text(s).replace(/[^A-Za-z0-9\u0900-\u097f%₹.\-,'/]/g, " ")
    .split(/\s+/).filter(function (w) { return w.length > 0; });
}
function wordCount(s) { return words(s).length; }

// Approximate English syllable count (standard heuristic).
function countSyllables(word) {
  var w = text(word).toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  var groups = w.match(/[aeiouy]{1,2}/g);
  return groups && groups.length > 0 ? groups.length : 1;
}

// Split prose into sentences. Protects abbreviations, initials
// ("C. P. Radhakrishnan") and decimals ("2.4 per cent").
function splitSentences(blob) {
  var t = text(blob).replace(/\s+/g, " ").trim();
  if (!t) return [];
  var guarded = t
    .replace(/(\d)\.(?=\d)/g, "$1" + GUARD)   // 2.4 -> 2<guard>4
    .replace(/\b([A-Z])\./g, "$1" + GUARD);   // C. P. -> C<guard> P<guard>
  var ordered = ABBREVIATIONS.slice().sort(function (a, b) { return b.length - a.length; });
  for (var i = 0; i < ordered.length; i++) {
    var re = new RegExp("\\b(" + ordered[i] + ")\\.", "g");
    guarded = guarded.replace(re, "$1" + GUARD);
  }
  var parts = guarded.split(/(?<=[.!?])["\u201d\u2019']?\s+/);
  var out = [];
  for (var k = 0; k < parts.length; k++) {
    var s = parts[k].replace(/\u0001/g, ".").trim();
    if (s) out.push(s);
  }
  return out;
}

// Markdown prose -> blocks separated by blank lines.
function splitBlocks(md) {
  return text(md).replace(/\r\n?/g, "\n").split(/\n\s*\n/);
}

function isHeading(line) { return /^\s{0,3}#{1,6}\s+/.test(line); }
function isBullet(line) { return /^\s*(?:[-*•]|\d+\.)\s+/.test(line); }
function isTableRow(line) { return /^\s*\|/.test(line); }

// Strip markdown noise so metrics measure real prose.
function plainText(md) {
  return text(md)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// 3. Metrics
// ---------------------------------------------------------------------------

// Real data points already present in the text: numbers, %, money, dates.
var RE_STATS = new RegExp(
  "(\\b\\d+(?:\\.\\d+)?\\s*(?:per cent|percent|%|crore|lakh|billion|million|trillion|" +
  "thousand|hours?|days?|months?|years?|working days)\\b)" +
  "|(\\u20b9\\s?\\d[\\d,]*(?:\\.\\d+)?)" +
  "|(\\b\\d[\\d,]{2,}\\b)" +
  "|(\\b(?:January|February|March|April|May|June|July|August|September|October|November|December)" +
  "\\s+\\d{1,2}(?:,)?\\s*\\d{4}\\b)" +
  "|(\\b\\d{1,2}\\s+(?:January|February|March|April|May|June|July|August|September|October|" +
  "November|December)\\s+\\d{4}\\b)", "gi");

function countStats(plain) {
  var m = text(plain).match(RE_STATS);
  return m ? m.length : 0;
}

// Complex word = 3+ syllables, not a proper noun, not Hinglish, not an acronym.
function isComplexWord(w) {
  var lower = text(w).toLowerCase().replace(/[^a-z]/g, "");
  if (lower.length < 7) return false;
  if (HINGLISH_SET[lower]) return false;
  if (lower === lower.toUpperCase() && w.length > 1) return false; // acronym
  return countSyllables(lower) >= 3;
}

// Break markdown into measurable units: sentences, prose paragraphs, lists.
function textUnits(md) {
  var sentences = [];
  var paragraphs = [];
  var headings = 0;
  var bullets = 0;
  var numbered = 0;
  var blocks = splitBlocks(md);
  for (var i = 0; i < blocks.length; i++) {
    var lines = blocks[i].split("\n").map(function (l) { return l.trim(); })
      .filter(function (l) { return l; });
    if (!lines.length) continue;
    if (lines.length && isHeading(lines[0])) { headings++; lines.shift(); }
    var prose = [];
    for (var j = 0; j < lines.length; j++) {
      var line = lines[j];
      if (isHeading(line)) { headings++; continue; }
      if (isTableRow(line)) continue;
      var isList = isBullet(line);
      var item = line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, "")
        .replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim();
      if (!item) continue;
      if (isList) { if (/^\s*\d+\./.test(line)) numbered++; else bullets++; }
      else prose.push(item);
      var parts = splitSentences(item);
      for (var k = 0; k < parts.length; k++) sentences.push(parts[k]);
    }
    if (prose.length) {
      var blob = prose.join(" ");
      if (wordCount(blob) >= 8) paragraphs.push(blob);
    }
  }
  return { sentences: sentences, paragraphs: paragraphs, headings: headings, bullets: bullets, numbered: numbered };
}

// Analyse one text blob and return raw metrics.
function analyzeText(md) {
  var units = textUnits(md);
  var sentences = units.sentences;
  var sentWordCounts = sentences.map(wordCount);
  var totalSentWords = sentWordCounts.reduce(function (a, b) { return a + b; }, 0);
  var wl = words(sentences.join(" "));
  var syll = wl.reduce(function (a, w) { return a + countSyllables(w); }, 0);
  var paraWordCounts = units.paragraphs.map(wordCount);

  var sentencesOver15 = sentWordCounts.filter(function (n) { return n > 15; }).length;
  var sentencesOver20 = sentWordCounts.filter(function (n) { return n > 20; }).length;
  var complexCount = wl.filter(isComplexWord).length;

  var asl = sentences.length ? totalSentWords / sentences.length : 0;
  var asw = wl.length ? syll / wl.length : 0;
  // Flesch Reading Ease (standard coefficients).
  var flesch = wl.length && sentences.length
    ? 206.835 - 1.015 * asl - 84.6 * asw : 0;

  return {
    wordCount: wl.length,
    sentenceCount: sentences.length,
    sentenceWordCounts: sentWordCounts,
    longestSentence: sentWordCounts.length ? Math.max.apply(null, sentWordCounts) : 0,
    avgSentenceWords: round1(asl),
    sentencesOver15: sentencesOver15,
    sentencesOver15Pct: pct(sentencesOver15, sentences.length),
    sentencesOver20: sentencesOver20,
    sentencesOver20Pct: pct(sentencesOver20, sentences.length),
    paragraphCount: units.paragraphs.length,
    avgParagraphWords: paraWordCounts.length
      ? round1(paraWordCounts.reduce(function (a, b) { return a + b; }, 0) / paraWordCounts.length) : 0,
    maxParagraphWords: paraWordCounts.length ? Math.max.apply(null, paraWordCounts) : 0,
    paragraphsOver60: paraWordCounts.filter(function (n) { return n > 60; }).length,
    headings: units.headings,
    bullets: units.bullets,
    numbered: units.numbered,
    complexWords: complexCount,
    complexWordPct: pct(complexCount, wl.length),
    syllablesPerWord: round1(asw),
    fleschReadingEase: Math.round(flesch),
    statsCount: countStats(plainText(md)),
  };
}

// ---------------------------------------------------------------------------
// 4. Scoring (Readability /100, Structure /100, Overall /100)
// ---------------------------------------------------------------------------

// Linear band: full marks at `good`, zero at `bad`. `higher` inverts direction.
function band(value, good, bad, max, higher) {
  var v = higher ? -value : value;
  var g = higher ? -good : good;
  var b = higher ? -bad : bad;
  if (v <= g) return max;
  if (v >= b) return 0;
  return max * (1 - (v - g) / (b - g));
}

// Resolve the guide's outbound authoritative links (same rule as the template).
function guideSources(guide) {
  var raw = guide.officialReferences || guide.sources || guide.source_ids || [];
  try {
    var mg = require("../templates/master-guide");
    if (mg && typeof mg.normalizeSourceList === "function") return mg.normalizeSourceList(raw);
  } catch (e) { /* build the list locally below */ }
  var list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return list.map(function (s) {
    if (typeof s === "string") return { label: s, href: s };
    if (s && typeof s === "object") return { label: s.label || s.source_name, href: s.href || s.source_url };
    return null;
  }).filter(function (s) { return s && s.href; });
}

function guideFaqs(guide) {
  var f = guide.faqs || guide.faq || [];
  return Array.isArray(f) ? f : [];
}

// Combine every reader-facing text field into one measured blob.
function guideText(guide) {
  var parts = [];
  if (guide.whyMatters) parts.push(text(guide.whyMatters));
  if (guide.content) parts.push(text(guide.content));
  if (guide.summary) parts.push(text(guide.summary));
  var f = guideFaqs(guide);
  for (var i = 0; i < f.length; i++) {
    if (f[i] && (f[i].q || f[i].question)) parts.push(text(f[i].q || f[i].question));
    if (f[i] && (f[i].a || f[i].answer)) parts.push(text(f[i].a || f[i].answer));
  }
  if (Array.isArray(guide.common_mistakes)) parts.push(guide.common_mistakes.join(" "));
  if (Array.isArray(guide.benefits)) parts.push(guide.benefits.join(" "));
  return parts.filter(Boolean).join("\n\n");
}

// Readability = sentence length 35 + long-sentence share 20 + Flesch 30 +
//               complex-word share 15.
function readabilityScore(m) {
  var s = 0;
  s += band(m.avgSentenceWords, 15, 30, 35);
  s += band(m.sentencesOver20Pct, 0.10, 0.50, 20);
  s += band(m.fleschReadingEase, 60, 20, 30, true);
  s += band(m.complexWordPct, 0.08, 0.25, 15);
  return Math.max(0, Math.min(100, Math.round(s)));
}

// Structure = paragraph size 25 + headings 15 + lists 15 + outbound links 20 +
//             real data/dates 15 + FAQs 10.
function structureScore(m, guide) {
  var links = guideSources(guide).length;
  var faqs = guideFaqs(guide).length;
  var s = 0;
  s += band(m.avgParagraphWords, 55, 120, 25);
  s += m.headings >= 3 ? 15 : m.headings >= 1 ? 8 : 0;
  var lists = m.bullets + m.numbered;
  s += lists >= 6 ? 15 : lists >= 3 ? 11 : lists >= 1 ? 6 : 0;
  s += links >= 3 ? 20 : links === 2 ? 15 : links === 1 ? 8 : 0;
  s += m.statsCount >= 3 ? 15 : m.statsCount >= 1 ? 8 : 0;
  s += faqs >= 3 ? 10 : faqs >= 1 ? 5 : 0;
  return Math.max(0, Math.min(100, Math.round(s)));
}

// Full report for one guide (article). Used by the checker and the refiner.
function analyzeGuide(guide) {
  var m = analyzeText(guideText(guide));
  var readability = readabilityScore(m);
  var structure = structureScore(m, guide);
  var overall = Math.round(0.6 * readability + 0.4 * structure);
  var issues = [];
  if (m.avgSentenceWords > 15) issues.push("Long sentences: average " + m.avgSentenceWords + " words (target 15)");
  if (m.sentencesOver20 > 0) issues.push(m.sentencesOver20 + " sentence(s) over 20 words");
  if (m.paragraphsOver60 > 0) issues.push(m.paragraphsOver60 + " paragraph(s) over 60 words (target 3-4 lines)");
  if (m.complexWordPct > 0.08) issues.push("Complex words: " + Math.round(m.complexWordPct * 100) + "% (target under 8%)");
  var links = guideSources(guide);
  if (links.length < 2) issues.push("Only " + links.length + " outbound authoritative link(s) (target 2-3)");
  if (m.statsCount === 0) issues.push("No numbers, percentages or dates in the text");
  if ((m.bullets + m.numbered) === 0) issues.push("No bullet or numbered lists");

  return {
    slug: guide.slug || "",
    title: guide.title || "",
    readability: readability,
    structure: structure,
    overall: overall,
    metrics: m,
    links: links,
    faqCount: guideFaqs(guide).length,
    issues: issues,
    grade: overall >= 70 ? "GOOD" : overall >= 55 ? "MEDIUM" : "LOW",
  };
}

// ---------------------------------------------------------------------------
// 5. Simple words (meaning-preserving)
// ---------------------------------------------------------------------------

function matchCase(sample, replacement) {
  if (sample === sample.toUpperCase() && /[A-Z]/.test(sample)) return replacement.toUpperCase();
  if (/^[A-Z]/.test(sample)) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

// Apply the fixed maps to one unquoted segment.
function simplifySegment(seg) {
  var out = seg;
  Object.keys(COMPLEX_PHRASES).forEach(function (phrase) {
    var re = new RegExp("\\b" + phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
    out = out.replace(re, function (m) { return matchCase(m, COMPLEX_PHRASES[phrase]); });
  });
  Object.keys(COMPLEX_WORDS).forEach(function (word) {
    var re = new RegExp("\\b" + word + "\\b", "gi");
    out = out.replace(re, function (m) { return matchCase(m, COMPLEX_WORDS[word]); });
  });
  return out;
}

// Quoted matter is a direct statement of an official — never rewritten.
function simplifyWords(input) {
  var src = text(input);
  if (!src) return src;
  var parts = src.split(/(["\u201c\u201d][^"\u201c\u201d]*["\u201c\u201d])/);
  for (var i = 0; i < parts.length; i++) {
    if (i % 2 === 0) parts[i] = simplifySegment(parts[i]);
  }
  return parts.join("");
}

// ---------------------------------------------------------------------------
// 6. Shorten sentences (max 15 words, split at real clause boundaries)
// ---------------------------------------------------------------------------

// Only splits that cannot damage the grammar. Semicolons always separate
// independent clauses; the conjunction markers are allowed only when the
// right-hand side opens with a pronoun/demonstrative (a real new clause).
var SPLIT_MARKERS = [
  { md: "; ", pronoun: false },
  { md: ", and ", pronoun: true },
  { md: ", but ", pronoun: true },
  { md: ", so ", pronoun: true },
  { md: " and ", pronoun: true },
  { md: " but ", pronoun: true },
];

var PRONOUN_STARTERS = {
  it: 1, he: 1, she: 1, they: 1, we: 1, you: 1, i: 1, this: 1,
  these: 1, those: 1, there: 1, him: 1, them: 1, us: 1, me: 1,
};

// The right-hand side must be able to stand on its own as a sentence.
function isRealClause(part, requirePronoun) {
  var w = words(part);
  if (w.length < 6) return false;
  var first = text(w[0]).toLowerCase().replace(/[^a-z]/g, "");
  if (requirePronoun) return !!PRONOUN_STARTERS[first];
  return !!CLAUSE_STARTERS[first] || VERB_HINTS.test(part);
}

// Split one over-long sentence into <= maxWords sentences. Returns an array.
function splitLongSentence(sentence, maxWords) {
  maxWords = maxWords || 15;
  var s = text(sentence).trim();
  if (words(s).length <= maxWords) return [s];

  for (var i = 0; i < SPLIT_MARKERS.length; i++) {
    var marker = SPLIT_MARKERS[i];
    var at = s.indexOf(marker.md);
    while (at !== -1) {
      var left = s.slice(0, at).trim();
      var right = s.slice(at + marker.md.length).trim();
      var leftWords = words(left).length;
      if (leftWords >= 5 && leftWords <= words(s).length - 6 && isRealClause(right, marker.pronoun)) {
        var leftPart = /[.!?]$/.test(left) ? left : left + ".";
        var rightPart = right.charAt(0).toUpperCase() + right.slice(1);
        if (!/[.!?]$/.test(rightPart)) rightPart = rightPart + ".";
        return splitLongSentence(leftPart, maxWords).concat(splitLongSentence(rightPart, maxWords));
      }
      at = s.indexOf(marker.md, at + 1);
    }
  }
  return [s];
}

// Rewrite a prose blob so every sentence stays under maxWords where possible.
function shortenSentences(blob, maxWords) {
  var sentences = splitSentences(blob);
  var out = [];
  for (var i = 0; i < sentences.length; i++) {
    var pieces = splitLongSentence(sentences[i], maxWords);
    for (var k = 0; k < pieces.length; k++) out.push(pieces[k]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 7. Paragraphs, lists and inline links
// ---------------------------------------------------------------------------

// Detect "list-like" prose: a sentence that announces a list of 3+ items.
function bulletizeBlob(blob) {
  var s = text(blob).trim();
  if (!s) return null;
  if (!/\b(include|includes|including|following|namely|such as|are:|is:)\b/i.test(s)) return null;
  var split = s.indexOf(":");
  var tail = split !== -1 ? s.slice(split + 1).trim() : "";
  if (!tail) return null;
  var items = tail.split(/;|,\s+(?=[A-Z0-9]|\band\b)/).map(function (x) { return x.trim().replace(/^(and|or)\s+/i, ""); })
    .filter(function (x) { return wordCount(x) >= 3; });
  if (items.length < 3) return null;
  if (items.length > 8) return null;
  var head = s.slice(0, split + 1);
  var lines = ["**" + head.replace(/[:\s]+$/, "") + "**", ""];
  for (var i = 0; i < items.length; i++) {
    lines.push("- " + items[i].replace(/[.;]\s*$/, ""));
  }
  return lines.join("\n");
}

// Split a long prose paragraph into chunks of <= maxSentences sentences and
// <= maxWords words. Never splits mid-sentence.
function splitProseParagraph(blob, maxSentences, maxWords) {
  maxSentences = maxSentences || 3;
  maxWords = maxWords || 55;
  var sentences = splitSentences(blob);
  if (sentences.length <= 1) return text(blob).trim();
  var chunks = [];
  var cur = [];
  var curWords = 0;
  for (var i = 0; i < sentences.length; i++) {
    var w = wordCount(sentences[i]);
    if (cur.length > 0 && (cur.length >= maxSentences || curWords + w > maxWords)) {
      chunks.push(cur.join(" "));
      cur = [];
      curWords = 0;
    }
    cur.push(sentences[i]);
    curWords += w;
  }
  if (cur.length) chunks.push(cur.join(" "));
  return chunks.join("\n\n");
}

// Turn plain "cersai.org.in" style mentions into real outbound markdown links.
// Only absolute-looking public domains are linked; e-mail and existing links
// are left alone.
var RE_BARE_DOMAIN = /\b((?:[a-z0-9-]+\.)+(?:gov\.in|nic\.in|org\.in|co\.in|ac\.in|gov|nic|org|com|net|in))(\b\/[^\s,;)]*)?/gi;

function linkifyDomains(md) {
  var src = text(md);
  if (!src) return src;
  var out = src.split("\n").map(function (line) {
    // Keep existing markdown links and e-mails untouched.
    return line.replace(RE_BARE_DOMAIN, function (match, host, path, offset, whole) {
      if (!host) return match;
      var lower = host.toLowerCase();
      if (!/(gov\.in|nic\.in|org\.in|co\.in|ac\.in|\.gov|\.nic|\.org|\.com|\.net|\.in)$/.test(lower)) return match;
      var before = whole.slice(0, offset);
      if (/[\[(]$/.test(before) || /@$/.test(before)) return match;
      // Skip a domain that is already part of an existing markdown link.
      var openBracket = before.lastIndexOf("](");
      if (openBracket !== -1 && before.indexOf(")", openBracket) === -1) return match;
      var url = "https://" + host + (path || "");
      return "[" + host + (path || "") + "](" + url + ")";
    });
  }).join("\n");
  return out;
}

// ---------------------------------------------------------------------------
// 8. Authoritative outbound links (2-3 per article)
// ---------------------------------------------------------------------------
// Every entry is an official Government of India portal, regulator or PIB.
// Nothing is invented: these are the owning bodies of the topic.

var AUTHORITY_TOPICS = [
  { id: "agriculture", re: /\b(agricultur\w*|farmers?|rabi|kharif|crops?|fertili[sz]\w*|pm-?kisan|msp|mandi|rainfed|watershed|krishi)\b/i, links: [
    { label: "PM-KISAN — Official Portal", href: "https://pmkisan.gov.in/", description: "Check beneficiary status, instalments and official PM-KISAN information." },
    { label: "Ministry of Agriculture & Farmers Welfare", href: "https://agriwelfare.gov.in/", description: "Official schemes, notices and farmer services." },
  ]},
  { id: "water", re: /\b(jal shakti|water|rivers?|reservoirs?|groundwater|irrigation|rainwater|ganga)\b/i, links: [
    { label: "Ministry of Jal Shakti", href: "https://jalshakti.gov.in/", description: "Official water resources policy, programmes and releases." },
    { label: "Central Ground Water Board", href: "https://cgwb.gov.in/", description: "Groundwater data and state-wise reports." },
  ]},
  { id: "environment", re: /\b(environment|forest|wildlife|rhinos?|climate|biodiversity|pollution|moefcc|conservation)\b/i, links: [
    { label: "Ministry of Environment, Forest and Climate Change", href: "https://moef.gov.in/", description: "Official notifications, conservation programmes and reports." },
    { label: "Wildlife Institute of India", href: "https://wii.gov.in/", description: "Government research body for wildlife and conservation." },
  ]},
  { id: "epfo", re: /\b(epfo|epf|provident fund|uan|pension|eps|citizen'?s charter|cbt)\b/i, links: [
    { label: "EPFO — Employees' Provident Fund Organisation", href: "https://www.epfindia.gov.in/", description: "Official EPFO services, circulars and grievance links." },
    { label: "EPFO Member Portal (UAN)", href: "https://unifiedportal-mem.epfindia.gov.in/memberinterface/", description: "Passbook, KYC and claim status for members." },
  ]},
  { id: "rbi", re: /\b(rbi|reserve bank|monetary penalt\w*|repo|money market|treasury bills?|wma limit|reserve money|vrrr|ckyc|kyc|cersai)\b/i, links: [
    { label: "Reserve Bank of India", href: "https://www.rbi.org.in/", description: "Official press releases, notifications and monetary policy." },
    { label: "RBI Notifications", href: "https://www.rbi.org.in/Scripts/NotificationUser.aspx", description: "Master directions and circulars for banks and NBFCs." },
  ]},
  { id: "identity", re: /\b(aadhaar|uidai|identity|e-?kyc|demographic)\b/i, links: [
    { label: "UIDAI — Unique Identification Authority of India", href: "https://uidai.gov.in/", description: "Official Aadhaar services, updates and e-KYC information." },
    { label: "myAadhaar Portal", href: "https://myaadhaar.uidai.gov.in/", description: "Download, update and lock/unlock your Aadhaar." },
  ]},
  { id: "sebi", re: /\b(sebi|public shareholding|defaulter|remittance advice|recovery certificate|appeal no)\b/i, links: [
    { label: "SEBI — Securities and Exchange Board of India", href: "https://www.sebi.gov.in/", description: "Official orders, appeals and investor information." },
    { label: "SEBI Investor Website", href: "https://investor.sebi.gov.in/", description: "Investor education, complaints and market basics." },
  ]},
  { id: "dgft", re: /\b(dgft|import|export|scomet|trade notice|foreign trade|iec\b|pan validation)\b/i, links: [
    { label: "DGFT — Directorate General of Foreign Trade", href: "https://www.dgft.gov.in/", description: "Official trade notices, FTP notifications and IEC services." },
    { label: "Foreign Trade Policy", href: "https://www.dgft.gov.in/CP/?opt=foreign-trade-policy", description: "Current Foreign Trade Policy and amendments." },
  ]},
  { id: "tax", re: /\b(income tax|e-?pan|pan card|tds|exemptions?|ckyc|kyc|cersai)\b/i, links: [
    { label: "Income Tax e-Filing Portal", href: "https://www.incometax.gov.in/", description: "Official e-PAN, PAN services, returns and refunds." },
    { label: "CERSAI — CKYC Registry", href: "https://www.cersai.org.in/", description: "Official Central KYC registry and CKYC status check." },
  ]},
  { id: "health", re: /\b(ayushman|health|hospitals?|vaccines?|immuni[sz]\w*|pmjay|pandemic)\b/i, links: [
    { label: "National Health Authority (PM-JAY)", href: "https://nha.gov.in/", description: "Official Ayushman Bharat and PM-JAY beneficiary information." },
    { label: "Ministry of Health and Family Welfare", href: "https://mohfw.gov.in/", description: "Official health programmes, advisories and releases." },
  ]},

  { id: "ayush", re: /\b(ayurveda|ayush|yoga|unani|homeopathy|siddha)\b/i, links: [
    { label: "Ministry of AYUSH", href: "https://ayush.gov.in/", description: "Official AYUSH programmes, Ayurveda Day and research." },
    { label: "AYUSH Research Portal", href: "https://ayushresearch.gov.in/", description: "Government research repository for AYUSH systems." },
  ]},
  { id: "telecom", re: /\b(imei|telecom|mobile|sim|trai|sancharsaathi|handset)\b/i, links: [
    { label: "Sanchar Saathi (Department of Telecom)", href: "https://sancharsaathi.gov.in/", description: "Official portal to check IMEI, report a lost phone and block devices." },
    { label: "Department of Telecommunications", href: "https://www.dot.gov.in/", description: "Official telecom policy, notifications and licence rules." },
  ]},
  { id: "education", re: /\b(aicte|students?|universit\w*|colleges?|scholarships?|exams?|education|web portal|login)\b/i, links: [
    { label: "AICTE — All India Council for Technical Education", href: "https://www.aicte-india.org/", description: "Official approvals, scholarships and student portals." },
    { label: "Ministry of Education", href: "https://www.education.gov.in/", description: "Official education schemes and notifications." },
  ]},
  { id: "msme", re: /\b(msme|udyam|micro, small|start-?ups?|dpiit)\b/i, links: [
    { label: "Udyam Registration Portal (Ministry of MSME)", href: "https://udyamregistration.gov.in/", description: "Free official MSME registration and certificate download." },
    { label: "Startup India (DPIIT)", href: "https://www.startupindia.gov.in/", description: "Official DPIIT recognition, benefits and applications." },
  ]},
  { id: "governance", re: /\b(swachhata|darpg|cleanliness|records?\b|governance|mission karmayogi|dopt|karmayogi)\b/i, links: [
    { label: "DARPG — Administrative Reforms & Public Grievances", href: "https://darpg.gov.in/", description: "Official Swachhata campaign and governance programmes." },
    { label: "iGOT Karmayogi (DoPT)", href: "https://igotkarmayogi.gov.in/", description: "Official Mission Karmayogi learning platform." },
  ]},
  { id: "sports", re: /\b(cricket|asian games|medals?|athletes?|sports|weightlifting|hockey|olympic)\b/i, links: [
    { label: "Ministry of Youth Affairs and Sports", href: "https://sports.gov.in/", description: "Official sports schemes, awards and team announcements." },
    { label: "Sports Authority of India", href: "https://sportsauthorityofindia.nic.in/", description: "Government body for athlete training and support." },
  ]},
  { id: "pmo", re: /\b(prime minister|pm modi|narendra modi|pmo|vice-?president|tributes?|jayanti|greetings|mann ki baat|birth anniversary)\b/i, links: [
    { label: "PMO India — Prime Minister's Office", href: "https://www.pmindia.gov.in/", description: "Official speeches, tributes and government announcements." },
    { label: "National Portal of India", href: "https://www.india.gov.in/", description: "Single window for all central government services." },
  ]},
  { id: "mygov", re: /\b(mygov|quiz|contest|feedback|pledge|survey|competition|winners?)\b/i, links: [
    { label: "MyGov India", href: "https://www.mygov.in/", description: "Official citizen engagement platform for quizzes and contests." },
    { label: "MyGov — Active Contests", href: "https://www.mygov.in/active-contests/", description: "Current government quizzes, polls and competitions." },
  ]},
  { id: "jobs", re: /\b(recruitment|vacanc\w*|rozgar|appointment letters?|employment|jobs?)\b/i, links: [
    { label: "National Career Service", href: "https://www.ncs.gov.in/", description: "Official government job and career portal." },
    { label: "DoPT — Department of Personnel & Training", href: "https://dopt.gov.in/", description: "Official recruitment rules and notifications." },
  ]},
  { id: "tourism", re: /\b(tourism|tourists?|travel|policing)\b/i, links: [
    { label: "Ministry of Tourism", href: "https://tourism.gov.in/", description: "Official tourism schemes, advisories and statistics." },
    { label: "Incredible India", href: "https://www.incredibleindia.gov.in/", description: "Official Government of India tourism portal." },
  ]},
  { id: "science", re: /\b(science|vigyan|research|snbncbs|isro|drdo)\b/i, links: [
    { label: "Department of Science and Technology", href: "https://dst.gov.in/", description: "Official science programmes, fellowships and releases." },
    { label: "PIB — Science & Technology Releases", href: "https://pib.gov.in/", description: "Official science and technology press releases." },
  ]},
];

var GENERIC_LINKS = [
  { label: "Press Information Bureau (PIB)", href: "https://pib.gov.in/", description: "Official press releases of the Government of India." },
  { label: "National Portal of India", href: "https://www.india.gov.in/", description: "Single window for all central government services." },
  { label: "MyGov India", href: "https://www.mygov.in/", description: "Official citizen engagement platform." },
];

function topicHaystack(guide) {
  return [
    guide.title, guide.summary, guide.category, guide.source_name, guide.ministry,
    guide.content, Array.isArray(guide.keywords) ? guide.keywords.join(" ") : "",
  ].filter(Boolean).join(" \n ");
}

// Rank the topic registry for one guide (best match first).
// Matches in the TITLE / summary carry 5x the weight of matches inside the
// body, so a subject keyword in the headline beats an incidental word in the
// prose. Body hits are capped so one repeated word cannot dominate.
function topicScore(guide, topic) {
  var re = new RegExp(topic.re.source, "gi");
  function hits(s) { var m = String(s || "").match(re); return m ? m.length : 0; }
  var head = [guide.title, guide.summary, guide.category, guide.source_name,
    guide.ministry, Array.isArray(guide.keywords) ? guide.keywords.join(" ") : ""]
    .filter(Boolean).join(" ");
  var body = [guide.content, guide.shortAnswer, guide.whyMatters].filter(Boolean).join(" \n ");
  return hits(head) * 5 + Math.min(hits(body), 6);
}

function pickTopics(guide) {
  if (!topicHaystack(guide)) return [];
  return AUTHORITY_TOPICS
    .map(function (t) { return { topic: t, score: topicScore(guide, t) }; })
    .filter(function (x) { return x.score > 0; })
    .sort(function (a, b) { return b.score - a.score; })
    .map(function (x) { return x.topic; });
}

// Real source URL already on the record (never invented).
// source_ids is the canonical field the publish pipeline fills from
// content_items.source_url, so it wins over the free-form source_url.
function originSource(guide) {
  var candidates = [];
  var ids = guide.source_ids || [];
  if (Array.isArray(ids)) {
    for (var i = 0; i < ids.length; i++) {
      if (typeof ids[i] === "string") candidates.push(ids[i]);
      else if (ids[i] && ids[i].href) candidates.push(ids[i].href);
    }
  }
  if (guide.source_url) candidates.push(String(guide.source_url));
  var first = "";
  for (var k = 0; k < candidates.length; k++) {
    var u = text(candidates[k]).trim();
    if (!/^https?:\/\//i.test(u)) continue;
    if (!first) first = u;
    if (/\.(gov\.in|nic\.in|gov|nic)(\/|$)/i.test(u)) return u;
  }
  return first;
}

function sourceLabelFor(url, guide) {
  if (/pib\.gov\.in/i.test(url)) return "PIB — Original Press Release";
  if (/rbi\.org\.in/i.test(url)) return "RBI — Original Release";
  if (/sebi\.gov\.in/i.test(url)) return "SEBI — Original Order / Release";
  if (/epfindia\.gov\.in/i.test(url)) return "EPFO — Original Release";
  if (/dgft\.gov\.in/i.test(url)) return "DGFT — Original Notice";
  if (/pmindia\.gov\.in/i.test(url)) return "PMO India — Original Release";
  var name = guide.source_name || guide.ministry || "";
  return name ? name + " — Original Release" : "Official Release (source of this page)";
}

// 2-3 authoritative outbound links: the article's own release + the owning
// ministry/portal for its topic. National portals are only used to top up.
function suggestOfficialReferences(guide, opts) {
  opts = opts || {};
  var max = opts.max || 3;
  var out = [];
  var seen = {};
  function push(link) {
    if (!link || !link.href) return;
    var key = String(link.href).replace(/\/+$/, "").toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push({ label: link.label, href: link.href, description: link.description || "" });
  }

  // 1. The article's own official source (PIB release / order / portal).
  var origin = originSource(guide);
  if (origin) {
    push({
      label: sourceLabelFor(origin, guide),
      href: origin,
      description: "The official release this page is based on. Always verify current details here.",
    });
  }

  // 2. Topics for the subject, strongest match first. A topic scoring less
  //    than half of the best topic is treated as an incidental keyword hit.
  var ranked = pickTopics(guide);
  if (ranked.length) {
    var scores = {};
    ranked.forEach(function (t) { scores[t.id] = topicScore(guide, t); });
    var best = scores[ranked[0].id];
    var keep = ranked.filter(function (t) {
      return best <= 1 || scores[t.id] >= best * 0.5;
    });
    if (!keep.length) keep = ranked.slice(0, 1);
    for (var i = 0; i < keep.length && out.length < max; i++) {
      var links = keep[i].links;
      for (var k = 0; k < links.length && out.length < max; k++) push(links[k]);
    }
  }

  // 3. Top up with well-known national portals when the subject is thin.
  for (var g = 0; g < GENERIC_LINKS.length && out.length < max; g++) push(GENERIC_LINKS[g]);
  return out.slice(0, max);
}

// Human-readable real date for the source (or the page's last update).
function sourceDateLine(guide) {
  var iso = text(guide.source_published_date || guide.last_updated || "").trim();
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  var months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  var month = months[parseInt(m[2], 10) - 1];
  if (!month) return "";
  return parseInt(m[3], 10) + " " + month + " " + m[1];
}

// ---------------------------------------------------------------------------
// 9. Guide (article) enhancement
// ---------------------------------------------------------------------------

var DEFAULT_OPTS = {
  maxSentenceWords: 15,
  maxSentences: 3,
  maxParagraphWords: 55,
  addLinks: true,
  maxLinks: 3,
  addDates: true,
};

// One prose block -> simple words, short sentences, short paragraphs, links.
function enhanceProseBlock(blob, opts) {
  var simplified = simplifyWords(blob);
  var bulleted = bulletizeBlob(simplified);
  if (bulleted) {
    var bLines = bulleted.split("\n");
    var bOut = [];
    for (var b = 0; b < bLines.length; b++) {
      if (isBullet(bLines[b])) {
        var item = bLines[b].replace(/^\s*(?:[-*•]|\d+\.)\s+/, "");
        item = shortenSentences(simplifyWords(item), opts.maxSentenceWords).join(" ");
        bOut.push("- " + linkifyDomains(item));
      } else {
        bOut.push(simplifyWords(bLines[b]));
      }
    }
    return bOut.join("\n");
  }
  var sentences = shortenSentences(simplified, opts.maxSentenceWords);
  var chunk = linkifyDomains(sentences.join(" "));
  return splitProseParagraph(chunk, opts.maxSentences, opts.maxParagraphWords);
}

function enhanceBulletLine(line, opts) {
  var m = /^(\s*(?:[-*•]|\d+\.)\s+)(.*)$/.exec(line);
  if (!m) return simplifyWords(line);
  var marker = m[1];
  var item = shortenSentences(simplifyWords(m[2]), opts.maxSentenceWords).join(" ");
  return marker + linkifyDomains(item);
}

var BOLD_ONLY_LINE = /^\*\*[^*]+\*\*:?$/;

// A few articles were stored as raw HTML instead of markdown, which rendered
// as literal tags. Convert them before anything else so headings/lists work.
function looksLikeHtml(md) {
  return /<(h[1-6]|p|ul|ol|li|br|div|span|strong|b|em|blockquote)\b[^>]*>/i.test(text(md));
}

function htmlToMarkdown(html) {
  var s = text(html).replace(/\r\n?/g, "\n");
  s = s.replace(/<h([1-6])[^>]*>/gi, function (m, lvl) {
    var n = Math.min(3, parseInt(lvl, 10) || 2);
    return "\n\n" + new Array(n + 1).join("#") + " ";
  });
  s = s.replace(/<\/h[1-6]>/gi, "\n\n");
  s = s.replace(/<li[^>]*>/gi, "\n- ");
  s = s.replace(/<\/(ul|ol)>/gi, "\n\n");
  s = s.replace(/<p[^>]*>/gi, "\n\n");
  s = s.replace(/<\/p>/gi, "\n\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<(strong|b)>/gi, "**").replace(/<\/(strong|b)>/gi, "**");
  s = s.replace(/<(em|i)>/gi, "*").replace(/<\/(em|i)>/gi, "*");
  s = s.replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    function (m, href, label) { return "[" + label.trim() + "](" + href + ")"; });
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
  return s;
}

// Rewrite a markdown article body without changing its meaning.
// Structure is preserved: headings, bold labels, bullets and numbered steps
// keep their own lines; only prose is re-flowed into short paragraphs.
function enhanceContent(md, options) {
  var opts = Object.assign({}, DEFAULT_OPTS, options || {});
  var src = text(md);
  if (!src.trim()) return src;
  if (looksLikeHtml(src)) src = htmlToMarkdown(src);
  var blocks = splitBlocks(src);
  var out = [];
  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i].replace(/^\s+|\s+$/g, "");
    if (!block) continue;
    var lines = block.split("\n").map(function (l) { return l.trim(); })
      .filter(function (l) { return l; });
    // Leading headings / bold labels stay exactly where they are.
    var pre = [];
    while (lines.length && (isHeading(lines[0]) || BOLD_ONLY_LINE.test(lines[0]))) pre.push(lines.shift());
    if (!lines.length) { out.push(pre.join("\n")); continue; }

    var body;
    if (lines.some(isBullet)) {
      var parts = [];
      for (var j = 0; j < lines.length; j++) {
        parts.push(isBullet(lines[j]) ? enhanceBulletLine(lines[j], opts)
          : enhanceProseBlock(lines[j], opts));
      }
      body = parts.join("\n");
    } else {
      body = enhanceProseBlock(lines.join(" "), opts);
    }
    out.push(pre.length ? pre.join("\n") + "\n" + body : body);
  }
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Summary: simple words, short sentences, and a real dated source citation.
function enhanceSummary(summary, guide, opts) {
  var s = text(summary).trim();
  if (!s) return s;
  s = shortenSentences(simplifyWords(s), opts.maxSentenceWords).join(" ");
  if (!opts.addDates) return s;
  var line = sourceDateLine(guide);
  if (!line) return s;
  if (/\b(19|20)\d{2}\b/.test(s)) return s;      // already dated
  if (s.length > 260) return s;                   // keep meta description short
  var who = guide.source_name || guide.ministry || "the official source";
  if (s.toLowerCase().indexOf(text(who).toLowerCase()) !== -1) return s;
  return s + " (Source: " + who + ", " + line + ".)";
}

function enhanceFaq(faq, opts) {
  var out = Object.assign({}, faq);
  var q = out.q || out.question;
  if (q) out[out.q ? "q" : "question"] = shortenSentences(simplifyWords(q), opts.maxSentenceWords).join(" ");
  var a = out.a || out.answer;
  if (a) out[out.a ? "a" : "answer"] = shortenSentences(simplifyWords(a), opts.maxSentenceWords).join(" ");
  return out;
}

// Real-date line for the "Important Dates" section, when the source has one.
function enhanceDates(guide, opts) {
  if (!opts.addDates) return null;
  var current = guide.important_dates;
  var isMissing = !current || current.length === 0 ||
    (Array.isArray(current) && current.every(function (d) {
      return /not specified in the official source/i.test(text(d));
    }));
  if (!isMissing) return null;
  var line = sourceDateLine(guide);
  if (!line) return null;
  var who = guide.source_name || guide.ministry || "the official source";
  return [line + " \u2014 " + who + " released this information."];
}

// Keep source_url aligned with the canonical source_ids entry (the publish
// pipeline fills source_ids from content_items.source_url).
function canonicalizeSourceUrls(guide) {
  var ids = Array.isArray(guide.source_ids) ? guide.source_ids : [];
  var first = "";
  for (var i = 0; i < ids.length; i++) {
    if (typeof ids[i] === "string" && /^https?:\/\//i.test(ids[i])) { first = ids[i].trim(); break; }
  }
  if (!first) return guide;
  var norm = function (u) { return String(u || "").trim().replace(/\/+$/, ""); };
  if (norm(guide.source_url) === norm(first)) return guide;
  var g = Object.assign({}, guide);
  g.source_url = first;
  return g;
}

// Full article enhancement. Returns a NEW guide object + before/after report.
function enhanceGuide(guide, options) {
  var opts = Object.assign({}, DEFAULT_OPTS, options || {});
  var before = analyzeGuide(guide);
  var g = canonicalizeSourceUrls(guide);
  var changes = [];

  if (typeof g.content === "string" && g.content.trim()) {
    var newContent = enhanceContent(g.content, opts);
    if (newContent !== g.content) {
      g.content = newContent;
      changes.push("content: short sentences, small paragraphs, simpler words");
    }
  }
  if (typeof g.whyMatters === "string" && g.whyMatters.trim()) {
    var newWhy = enhanceContent(g.whyMatters, opts);
    if (newWhy !== g.whyMatters) { g.whyMatters = newWhy; changes.push("whyMatters: simplified"); }
  }
  if (typeof g.summary === "string" && g.summary.trim()) {
    var oldSummary = g.summary;
    var newSummary = enhanceSummary(oldSummary, g, opts);
    if (newSummary !== oldSummary) {
      g.summary = newSummary;
      changes.push(newSummary.length > oldSummary.length ? "summary: simplified + source date cited" : "summary: simplified");
    }
  }
  var faqs = guideFaqs(g);
  if (faqs.length) {
    var newFaqs = faqs.map(function (f) { return enhanceFaq(f, opts); });
    if (JSON.stringify(newFaqs) !== JSON.stringify(faqs)) { g.faqs = newFaqs; changes.push("faqs: simplified"); }
  }

  var existingLinks = guideSources(g);
  if (g.source_url !== guide.source_url) changes.push("source_url: realigned with source_ids (correct release URL)");
  if (opts.addLinks && (opts.refreshLinks || existingLinks.length < opts.maxLinks)) {
    var refs = suggestOfficialReferences(g, { max: opts.maxLinks });
    if (opts.refreshLinks || refs.length > existingLinks.length) {
      g.officialReferences = refs;
      changes.push("officialReferences: " + refs.length + " authoritative outbound links");
    }
  }

  var dates = enhanceDates(g, opts);
  if (dates) { g.important_dates = dates; changes.push("important_dates: real source date added"); }

  var after = analyzeGuide(g);
  // Safety net: never ship a "simplified" body that scores WORSE than the
  // original. The meaning is unchanged either way, but we keep the better read.
  if (after.readability < before.readability) {
    if (typeof guide.content === "string") g.content = guide.content;
    if (typeof guide.whyMatters === "string") g.whyMatters = guide.whyMatters;
    changes.push("content: kept original wording (no readability gain)");
    after = analyzeGuide(g);
  }

  return {
    guide: g,
    changes: changes,
    before: before,
    after: after,
    linksAdded: Math.max(0, after.links.length - before.links.length),
  };
}

module.exports = {
  // vocabulary + metrics
  COMPLEX_WORDS: COMPLEX_WORDS,
  COMPLEX_PHRASES: COMPLEX_PHRASES,
  HINGLISH_WORDS: HINGLISH_WORDS,
  AUTHORITY_TOPICS: AUTHORITY_TOPICS,
  DEFAULT_OPTS: DEFAULT_OPTS,
  countSyllables: countSyllables,
  splitSentences: splitSentences,
  wordCount: wordCount,
  plainText: plainText,
  analyzeText: analyzeText,
  analyzeGuide: analyzeGuide,
  readabilityScore: readabilityScore,
  structureScore: structureScore,
  guideSources: guideSources,
  guideFaqs: guideFaqs,
  // simple words
  simplifyWords: simplifyWords,
  // sentences + paragraphs
  shortenSentences: shortenSentences,
  splitLongSentence: splitLongSentence,
  splitProseParagraph: splitProseParagraph,
  bulletizeBlob: bulletizeBlob,
  linkifyDomains: linkifyDomains,
  // links + dates
  originSource: originSource,
  sourceDateLine: sourceDateLine,
  sourceLabelFor: sourceLabelFor,
  suggestOfficialReferences: suggestOfficialReferences,
  pickTopics: pickTopics,
  // article level
  enhanceContent: enhanceContent,
  enhanceGuide: enhanceGuide,
  canonicalizeSourceUrls: canonicalizeSourceUrls,
};











