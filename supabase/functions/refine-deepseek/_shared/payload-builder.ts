// Samjho — MICRO 15A — Payload Builder (Deno port)
// SOURCE OF TRUTH: admin/ai/deepseek/payload-builder.js
import { text, NOT_SPECIFIED } from "./provider-enums.ts";
import { today } from "./helpers.ts";

export function buildDeepSeekPayload(raw: Record<string, unknown>, cat: Record<string, string> | null, model: string) {
  const src = {
    name: text(raw.source_name || ""), url: text(raw.source_url || ""),
    date: text(raw.source_published_date || "").trim() || "NOT PROVIDED IN SOURCE",
    type: cat ? text(cat.content_type) : "", category: cat ? text(cat.category) : String(raw.category || "government"),
    sub: cat ? text(cat.sub_category) : "", group: cat ? text(cat.user_group) : "",
  };
  const NL = "\n";
  const systemMsg =
    'You are a friendly content writer for Samjho India, an Indian government information website.' + NL +
    'Your job: take a PIB press release and rewrite it as a simple, human article that ordinary Indians can understand.' + NL + NL +
    'WRITING STYLE: simple English, short sentences (max 15-20 words), active voice, use "you" for the reader.' + NL +
    'BUREAUCRATIC WORDS TO AVOID: emphasized->said, judicious use->smart use, inaugurated->launched, commenced->started, utilize->use, facilitate->help, noteworthy->important, subsequently->after that, however->but, furthermore->also, in order to->to, prior to->before, in the event that->if' + NL + NL +
    'OUTPUT: ONLY valid JSON. No markdown, no text before or after the JSON.';
  return { model, messages: [{ role: "system", content: systemMsg }, { role: "user", content: buildPrompt(text(raw.raw_content), src) }], temperature: 0.4, max_tokens: 8192, stream: false };
}

function buildPrompt(rawText: string, s: { name: string; url: string; date: string; type: string; category: string; sub: string; group: string }) {
  const N = NOT_SPECIFIED;
  const NL = "\n";
  let p = 'SOURCE METADATA (preserve exactly):' + NL;
  p += '  Source Name: ' + s.name + NL + '  Source URL: ' + s.url + NL + '  Source Published Date: ' + s.date + NL;
  p += '  Content Type: ' + (s.type || 'Not specified') + NL + '  Category: ' + s.category + NL + NL;
  p += 'OFFICIAL PIB CONTENT:' + NL + '---BEGIN RAW---' + NL + rawText + NL + '---END RAW---' + NL + NL;

  p += 'STEP 1 \u2014 DETECT CONTENT TYPE from the RAW text:' + NL;
  p += '  NEWS = inauguration, congratulations, meetings, events, milestones' + NL;
  p += '  SCHEME = yojana, benefits, eligibility, application process' + NL;
  p += '  NOTIFICATION = order, circular, rule change, deadline' + NL + NL;

  p += 'STEP 2 \u2014 WRITE USING THIS STRUCTURE:' + NL + NL;
  p += 'IF NEWS:' + NL;
  p += '  summary: 2-3 sentences. What happened, who, when.' + NL;
  p += '  content: "What Happened" (1 paragraph) + "Why It Matters" (1-2 paragraphs) + "Key Points" (3-5 short bullets).' + NL;
  p += '  eligibility, benefits, required_documents, application_process, common_mistakes: use exactly: ' + N + NL + NL;

  p += 'IF SCHEME:' + NL;
  p += '  summary: 2-3 sentences. What the scheme is, who benefits.' + NL;
  p += '  content: "What Happened" + "Who Is Eligible" + "Benefits" + "How to Apply" + "Important Dates".' + NL;
  p += '  eligibility, benefits, required_documents, application_process: fill from source.' + NL + NL;

  p += 'IF NOTIFICATION:' + NL;
  p += '  summary: 2-3 sentences. What changed, who is affected.' + NL;
  p += '  content: "What Happened" + "What Changes" + "What You Need to Do" + "Deadline".' + NL;
  p += '  eligibility, benefits, required_documents, application_process: use exactly: ' + N + NL + NL;

  p += 'CRITICAL WRITING RULES:' + NL;
  p += '1. LANGUAGE: Simple, conversational. Short sentences. No bureaucratic words.' + NL;
  p += '2. NO COPYING: NEVER copy from RAW. Paraphrase EVERYTHING in your own words.' + NL;
  p += '3. FACTS: Use EXACT numbers from source. Do NOT round or change.' + NL;
  p += '4. HUMAN TOUCH: Use "you". Add relatable context. Give practical advice.' + NL;
  p += '5. NO DUMPS: Rewrite each bullet point in simple words. No raw text dumps.' + NL;
  p += '6. SHORT: Max 4-5 sentences per paragraph. One sentence per bullet point.' + NL;
  p += '7. If type is NEWS, do NOT add Eligibility/Benefits/How to Apply.' + NL + NL;

  p += 'HALLUCINATION GUARD: NEVER invent facts. If RAW does NOT contain info, use exactly: ' + N + NL + NL;

  p += 'OUTPUT (ONLY this JSON, no markdown):' + NL;
  p += JSON.stringify({ title: "string", slug: "string", category: s.category, summary: "string", content: "string",
    eligibility: [N], benefits: [N], required_documents: [N], application_process: [N],
    important_dates: [N], common_mistakes: [N], faqs: [{ q: "string", a: "string" }],
    source_ids: [s.url], status: "draft", last_updated: today() }, null, 2) + NL;
  return p;
}
