// DeepSeek Provider Main Implementation
// Server-side Node.js module ONLY

'use strict';

var providerEnums = require('./provider-enums.js');
var apiRequest = require('./api-request.js');
var apiErrorHandler = require('./api-error-handler.js');
var helpers = require('./helpers.js');

function buildDeepSeekPayload(raw, categorization, model) {
  var rawText = helpers.text(raw.raw_content);
  var sourceName = helpers.text(raw.source_name || '');
  var sourceUrl = helpers.text(raw.source_url || '');
  var sourcePublishedDate = helpers.text(raw.source_published_date || '');
  
  var rawDate = sourcePublishedDate && sourcePublishedDate.trim() ? sourcePublishedDate.trim() : 'NOT PROVIDED IN SOURCE';
  
  var cat = categorization || (raw && raw.categorization) || null;
  var topCategory = cat ? helpers.text(cat.category) : (raw.category || 'government');
  var subCategory = cat ? helpers.text(cat.sub_category) : '';
  var userGroup = cat ? helpers.text(cat.user_group) : '';
  var contentType = cat ? helpers.text(cat.content_type) : '';
  
  // --- SYSTEM MESSAGE: persona + writing rules ---
  var systemMsg = 'You are a friendly content writer for Samjho India, an Indian government information website.\n';
  systemMsg += 'Your job: take a PIB press release and rewrite it as a simple, human article that ordinary Indians can understand.\n\n';
  systemMsg += 'WRITING STYLE: simple English, short sentences (max 15-20 words), active voice, use "you" for the reader.\n';
  systemMsg += 'BUREAUCRATIC WORDS TO AVOID: emphasized->said, judicious use->smart use, inaugurated->launched, commenced->started, utilize->use, facilitate->help, noteworthy->important, subsequently->after that, however->but, furthermore->also, in order to->to, prior to->before, in the event that->if\n\n';
  systemMsg += 'OUTPUT: ONLY valid JSON. No markdown, no text before or after the JSON.';

  // --- USER MESSAGE ---
  var prompt = 'SOURCE METADATA (preserve exactly):\n';
  prompt += '  Source Name: ' + sourceName + '\n';
  prompt += '  Source URL: ' + sourceUrl + '\n';
  prompt += '  Source Published Date: ' + rawDate + '\n';
  prompt += '  Content Type: ' + (contentType || 'Not specified') + '\n';
  prompt += '  Category: ' + topCategory + '\n\n';
  prompt += 'OFFICIAL PIB CONTENT:\n---BEGIN RAW---\n' + rawText + '\n---END RAW---\n\n';
  // --- Content type detection + structure ---
  prompt += 'STEP 1 — DETECT CONTENT TYPE from the RAW text:\n';
  prompt += '  NEWS = inauguration, congratulations, meetings, events, milestones\n';
  prompt += '  SCHEME = yojana, benefits, eligibility, application process\n';
  prompt += '  NOTIFICATION = order, circular, rule change, deadline\n\n';

  prompt += 'STEP 2 — WRITE USING THIS STRUCTURE:\n\n';
  prompt += 'IF NEWS:\n';
  prompt += '  summary: 2-3 sentences. What happened, who, when.\n';
  prompt += '  content: "What Happened" (1 paragraph) + "Why It Matters" (1-2 paragraphs) + "Key Points" (3-5 short bullets).\n';
  prompt += '  eligibility, benefits, required_documents, application_process, common_mistakes: use exactly: ' + helpers.NOT_SPECIFIED + '\n\n';

  prompt += 'IF SCHEME:\n';
  prompt += '  summary: 2-3 sentences. What the scheme is, who benefits.\n';
  prompt += '  content: "What Happened" + "Who Is Eligible" + "Benefits" + "How to Apply" + "Important Dates".\n';
  prompt += '  eligibility, benefits, required_documents, application_process: fill from source.\n\n';

  prompt += 'IF NOTIFICATION:\n';
  prompt += '  summary: 2-3 sentences. What changed, who is affected.\n';
  prompt += '  content: "What Happened" + "What Changes" + "What You Need to Do" + "Deadline".\n';
  prompt += '  eligibility, benefits, required_documents, application_process: use exactly: ' + helpers.NOT_SPECIFIED + '\n\n';

  // --- CRITICAL WRITING RULES ---
  prompt += 'CRITICAL WRITING RULES:\n';
  prompt += '1. LANGUAGE: Simple, conversational. Short sentences. No bureaucratic words.\n';
  prompt += '2. NO COPYING: NEVER copy from RAW. Paraphrase EVERYTHING in your own words.\n';
  prompt += '3. FACTS: Use EXACT numbers from source. Do NOT round or change.\n';
  prompt += '4. HUMAN TOUCH: Use "you". Add relatable context. Give practical advice.\n';
  prompt += '5. NO DUMPS: Rewrite each bullet point in simple words. No raw text dumps.\n';
  prompt += '6. SHORT: Max 4-5 sentences per paragraph. One sentence per bullet point.\n';
  prompt += '7. If type is NEWS, do NOT add Eligibility/Benefits/How to Apply.\n\n';

  // --- HALLUCINATION GUARD ---
  prompt += 'HALLUCINATION GUARD: NEVER invent facts. If RAW does NOT contain info, use exactly: ' + helpers.NOT_SPECIFIED + '\n\n';

  // --- OUTPUT FORMAT ---
  prompt += 'OUTPUT (ONLY this JSON, no markdown):\n';
  prompt += JSON.stringify({
    title: "string", slug: "string", category: topCategory,
    summary: "string", content: "string",
    eligibility: [helpers.NOT_SPECIFIED], benefits: [helpers.NOT_SPECIFIED],
    required_documents: [helpers.NOT_SPECIFIED], application_process: [helpers.NOT_SPECIFIED],
    important_dates: [helpers.NOT_SPECIFIED], common_mistakes: [helpers.NOT_SPECIFIED],
    faqs: [{ q: "string", a: "string" }],
    source_ids: [sourceUrl], status: "draft", last_updated: helpers.today()
  }, null, 2) + '\n';

  return {
    model: model,
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: prompt }
    ],
    temperature: 0.4,
    max_tokens: 8192,
    stream: false
  };
}

module.exports = {
  buildDeepSeekPayload: buildDeepSeekPayload
};
