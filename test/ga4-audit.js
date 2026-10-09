// GA4 + cookie consent audit over dist/.
"use strict";
const fs = require("fs");
const path = require("path");

const DIST = path.join(__dirname, "..", "dist");
let fail = 0;
function check(label, cond, detail) {
  console.log((cond ? "  PASS: " : "  FAIL: ") + label + (cond || !detail ? "" : " -> " + detail));
  if (!cond) fail++;
}
function read(rel) { return fs.readFileSync(path.join(DIST, rel), "utf8"); }

// ------------------------------------------------------------------ homepage
console.log("=== 1. homepage (GA loader + consent banner + footer UTMs) ===");
const home = read("index.html");
check("static gtag.js <script src> removed from head", !/<script[^>]+src="https:\/\/www\.googletagmanager\.com\/gtag\/js/.test(home));
check("consent default = denied", /gtag\("consent", "default"/.test(home) && home.indexOf("analytics_storage: \"denied\"") !== -1);
check("consent-gated loader __loadGA4", home.indexOf("window.__loadGA4") !== -1);
check("GA4 ID unchanged (G-QH2QZWDHMM)", home.indexOf("G-QH2QZWDHMM") !== -1);
check("gtag.js loaded async after consent", /s\.async = true;\s*\n\s*s\.src = "https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-QH2QZWDHMM"/.test(home));
check("loader honours stored grant on load", home.indexOf('localStorage.getItem("cookie_consent") === "granted"') !== -1);
check("cookie banner markup", home.indexOf('id="cookieConsent"') !== -1 && home.indexOf("cookieConsentAccept") !== -1 && home.indexOf("cookieConsentReject") !== -1);
check("banner hidden until choice", /id="cookieConsent"[^>]* hidden/.test(home));
check("banner stores choice in localStorage", home.indexOf('localStorage.setItem(key, v)') !== -1);
check("Accept calls __loadGA4", /v === "granted" && window\.__loadGA4/.test(home));
const footerUtms = [
  ["youtube", "utm_source=youtube&utm_medium=social"],
  ["facebook", "utm_source=facebook&utm_medium=social"],
  ["twitter", "utm_source=twitter&utm_medium=social"],
  ["linkedin", "utm_source=linkedin&utm_medium=social"],
  ["instagram", "utm_source=instagram&utm_medium=social"],
];
footerUtms.forEach(([name, q]) => check("footer " + name + " link UTM", home.indexOf(q) !== -1));

// ------------------------------------------------------------- article page
console.log("\n=== 2. article page (share link UTMs) ===");
const art = read(path.join("guides", "india-international-water-week-2026", "index.html"));
check("whatsapp share UTM (encoded)", art.indexOf("utm_source%3Dwhatsapp%26utm_medium%3Dshare") !== -1);
check("twitter share UTM (encoded)", art.indexOf("utm_source%3Dtwitter%26utm_medium%3Dsocial") !== -1);
check("linkedin share UTM (encoded)", art.indexOf("utm_source%3Dlinkedin%26utm_medium%3Dsocial") !== -1);
check("wa.me share link present", art.indexOf("https://wa.me/?text=") !== -1);
check("banner on article page too", art.indexOf('id="cookieConsent"') !== -1);

// -------------------------------------------------------------- main.js events
console.log("\n=== 3. conversion events (main.js) ===");
const main = read(path.join("assets", "js", "main.js"));
["subscribe_click", "whatsapp_click", "share_click", "calculator_use", "scroll_75"].forEach((ev) =>
  check("event: " + ev, main.indexOf('"' + ev + '"') !== -1));
check("events gated on consent (__ga4Loaded)", main.indexOf("window.__ga4Loaded") !== -1);
check("calculator path-scoped", main.indexOf("/^\\/calculators\\/.+/") !== -1);

// -------------------------------------------------------------- no regressions
console.log("\n=== 4. no regressions ===");
const art2 = read(path.join("guides", "what-is-gst", "index.html"));
check("article still has title/schemas", art2.indexOf("<title>") !== -1 && art2.indexOf("FAQPage") !== -1);
check("consent script is on every page", art2.indexOf("window.__loadGA4") !== -1 && home.indexOf("window.__loadGA4") !== -1);

console.log("\n=== " + (fail === 0 ? "GA4 AUDIT PASS" : "GA4 AUDIT FAIL (" + fail + ")") + " ===");
process.exit(fail ? 1 : 0);