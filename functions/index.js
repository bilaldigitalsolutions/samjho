// =============================================================================
// Samjho — MICRO 14 — Firebase Cloud Function (thin HTTPS wrapper)
// =============================================================================
// This file contains NO DeepSeek logic. It only:
//   1. configures the server-side key from Firebase config/secrets (never sent
//      to the browser), and
//   2. forwards the request body to the EXISTING Micro 13 bridge
//      (./refine-handler.js -> ./lib/ai/server-bridge.js -> DeepSeek).
//
// Key configuration (choose one, server-side only — NEVER in client code):
//   Firebase Functions v1:  firebase functions:config:set deepseek.api_key="..."
//   Firebase Functions v2:  firebase functions:secrets:set DEEPSEEK_API_KEY
//   Any runtime:            DEEPSEEK_API_KEY environment variable
//
// Deploy (requires access to the project in .firebaserc — see README):
//   firebase deploy --only functions,hosting
// =============================================================================

"use strict";

const functions = require("firebase-functions");
const { handleRefineRequest } = require("./refine-handler.js");

// Lift the Firebase-configured key into the environment expected by the
// existing Micro 13 modules (they read process.env.DEEPSEEK_API_KEY).
function loadConfiguredKey() {
  if (process.env.DEEPSEEK_API_KEY) return; // explicit env/secrets wins
  try {
    const cfg = functions.config();
    if (cfg && cfg.deepseek && cfg.deepseek.api_key) {
      process.env.DEEPSEEK_API_KEY = cfg.deepseek.api_key;
    }
  } catch (e) {
    // v2 runtimes deliver secrets directly via env — nothing to do here.
  }
}

// CORS: the admin panel calls this function through the Firebase Hosting
// rewrite (/api/refineDeepseek → same origin), so no CORS is needed by
// default. Cross-origin admin deployments can whitelist origins explicitly
// via the ADMIN_ALLOWED_ORIGINS env var (comma-separated). Never "*"-by-default.
function applyCors(req, res) {
  const allowed = String(process.env.ADMIN_ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.get("Origin");
  if (origin && (allowed.indexOf(origin) !== -1 || allowed.indexOf("*") !== -1)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
}

exports.refineDeepseek = functions.https.onRequest((req, res) => {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({
      ok: false,
      code: "METHOD_NOT_ALLOWED",
      message: "Use POST with a JSON body ({ raw, categorization }). RAW unchanged; nothing created.",
      guide: null
    });
    return;
  }

  loadConfiguredKey();

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }

  handleRefineRequest(body)
    .then((h) => { res.status(h.httpStatus).json(h.result); })
    .catch((err) => {
      // Last-resort safety net: clear error, no fake draft, RAW untouched.
      res.status(500).json({
        ok: false,
        code: "FUNCTION_ERROR",
        message: "Refinement failed: " + (err && err.message ? err.message : String(err)) +
          ". RAW unchanged; nothing created.",
        guide: null
      });
    });
});