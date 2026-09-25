// =============================================================================
// Samjho — MICRO 15A — Supabase Edge Function: refine-deepseek
// =============================================================================
// Target architecture:
//   Admin UI -> Supabase Edge Function -> DeepSeek API
//
// This is a thin HTTPS wrapper (same role as functions/index.js for Firebase).
// It validates the request, then delegates to the EXISTING server bridge logic.
//
// DEEPSEEK_API_KEY is read ONLY from Supabase Edge Function secrets (server-side).
// It is NEVER exposed to the browser/client.
//
// Deploy (later, NOT now):
//   supabase functions deploy refine-deepseek
//   supabase secrets set DEEPSEEK_API_KEY="sk-..."
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { refineWithDeepSeek } from "./_shared/server-bridge.ts";

// =============================================================================
// CORS — static headers that work for all admin origins.
// The anon key is public by design; the function validates the JWT server-side.
// =============================================================================

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: Record<string, unknown>): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  return new Response(JSON.stringify(body), { status, headers });
}

serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    const headers = new Headers();
    for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return json(405, {
      ok: false, code: "METHOD_NOT_ALLOWED",
      message: "Use POST with a JSON body ({ raw, categorization }). RAW unchanged; nothing created.",
      guide: null,
    });
  }

  // Parse body
  let body: Record<string, unknown> | null = null;
  try {
    body = await req.json();
  } catch {
    return json(400, {
      ok: false, code: "INVALID_REQUEST",
      message: "Request body must be valid JSON with 'raw' and 'categorization'. RAW unchanged; nothing created.",
      guide: null,
    });
  }

  if (!body || typeof body !== "object") {
    return json(400, {
      ok: false, code: "INVALID_REQUEST",
      message: "Request body must be a JSON object with 'raw' and 'categorization'. RAW unchanged; nothing created.",
      guide: null,
    });
  }

  // Extract raw + categorization (same pattern as functions/refine-handler.js)
  const raw = body.raw as Record<string, unknown> | undefined;
  const cat = body.categorization as Record<string, unknown> | undefined;

  if (!raw || typeof raw !== "object") {
    return json(400, {
      ok: false, code: "INVALID_REQUEST",
      message: "Missing 'raw' object with the official announcement content. RAW unchanged; nothing created.",
      guide: null,
    });
  }

  if (!cat || typeof cat !== "object") {
    return json(400, {
      ok: false, code: "MANUAL_CATEGORIZATION_REQUIRED",
      message: "Missing 'categorization'. Categorize the RAW item first. RAW unchanged; nothing created.",
      guide: null,
    });
  }

  // Attach categorization to raw (same as refine-handler.js)
  const rawWithCat = Object.assign({}, raw, { categorization: cat });

  try {
    const result = await refineWithDeepSeek(rawWithCat, { timeoutMs: 30000 });
    const httpStatus = result.ok ? 200 : 400;
    return json(httpStatus, result);
  } catch (err) {
    return json(500, {
      ok: false, code: "FUNCTION_ERROR",
      message: "Refinement failed: " + (err instanceof Error ? err.message : String(err)) + ". RAW unchanged; nothing created.",
      guide: null,
    });
  }
});
