#!/usr/bin/env node
// Samjho — Pexels Image Fetcher
// Searches Pexels for images, downloads them, and serves them at
// /images/articles/<slug>.jpg
// Requires: PEXELS_API_KEY environment variable (loaded from .env if needed)
//
// NOTE ON STORAGE LOCATION
// Images are stored in build/assets/images/articles/ — NOT in dist/.
// build/build.js wipes the whole dist/ folder on every run
// (fs.rmSync(OUT, {recursive:true})), so anything downloaded straight into
// dist/ would be deleted before deploy. build.js copies this folder into
// dist/images/articles/ at build time.
"use strict";
var https = require("https");
var fs = require("fs");
var path = require("path");

// Load .env when running as a CLI/require from a script that has not loaded
// it (deploy-published.js, manual runs). Silent no-op if dotenv is missing.
try {
  if (!process.env.PEXELS_API_KEY) {
    require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });
  }
} catch (e) { /* dotenv optional — key may already be in the environment */ }

var PEXELS_API_KEY = process.env.PEXELS_API_KEY || "";
var PEXELS_BASE = "https://api.pexels.com/v1/search";
var IMAGES_DIR = path.join(__dirname, "..", "..", "build", "assets", "images", "articles");
var PUBLIC_DIR = "/images/articles";

function httpsGet(url, headers, redirects) {
  redirects = redirects || 0;
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: headers || {} }, function (res) {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        res.resume();
        if (redirects >= 5) { reject(new Error("Too many redirects")); return; }
        resolve(httpsGet(res.headers.location, headers, redirects + 1)); return;
      }
      var chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
      });
    }).on("error", reject);
  });
}

function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// Retry only transient failures (429 / 5xx / non-JSON upstream errors).
function withRetry(fn, attempts) {
  attempts = attempts || 3;
  var lastErr = null;
  function run(n) {
    return fn().catch(function (err) {
      lastErr = err;
      if (n <= 1 || !err || !err.retryable) throw err;
      return delay(500 * (4 - n)).then(function () { return run(n - 1); });
    });
  }
  return run(attempts).catch(function (err) { throw err || lastErr; });
}

function extractKeywords(title, category) {
  if (!title) return "india government";
  var stopWords = { "the":1,"a":1,"an":1,"is":1,"are":1,"was":1,"in":1,"on":1,"at":1,"to":1,"for":1,"of":1,"with":1,"by":1,"from":1,"and":1,"or":1,"but":1,"not":1,"has":1,"have":1,"will":1,"can":1,"this":1,"that":1,"it":1,"be":1,"do":1,"what":1,"how":1,"why":1,"when":1,"where":1,"who":1,"guide":1,"apply":1,"online":1,"free":1,"check":1,"full":1,"form":1,"meaning":1,"2026":1,"2025":1,"2024":1,"you":1,"your":1,"we":1,"new":1,"just":1,"also":1,"all":1 };
  var words = title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(function (w) { return w.length > 2 && !stopWords[w]; });
  var keywords = words.slice(0, 5).join(" ");
  var catMap = { "government":"india government", "money":"india finance bank", "business":"india business office", "education":"india education university", "documents":"india identity card" };
  if (category && catMap[category.toLowerCase()]) keywords += " " + catMap[category.toLowerCase()];
  return keywords.trim() || "india government";
}

function searchImages(query, count) {
  count = count || 3;
  if (!PEXELS_API_KEY) return Promise.resolve({ ok: false, message: "PEXELS_API_KEY not set", photos: [] });
  var url = PEXELS_BASE + "?query=" + encodeURIComponent(query) + "&per_page=" + count + "&orientation=landscape";
  return withRetry(function () {
    return httpsGet(url, { Authorization: PEXELS_API_KEY }).then(function (res) {
      var text = res.body.toString("utf8");
      var data;
      try { data = JSON.parse(text); }
      catch (e) {
        // Pexels occasionally returns a plain-text upstream error; retry those.
        var nonJson = new Error("Pexels returned non-JSON (HTTP " + res.statusCode + "): " + text.slice(0, 80));
        nonJson.retryable = /upstream|rate limit|temporar|unavailable|overload/i.test(text) || res.statusCode >= 500;
        throw nonJson;
      }
      if (res.statusCode === 429 || res.statusCode >= 500) {
        var retryable = new Error("Pexels HTTP " + res.statusCode + " (transient)");
        retryable.retryable = true;
        throw retryable;
      }
      if (res.statusCode !== 200) {
        var fatal = new Error("Pexels HTTP " + res.statusCode + (data && data.error ? ": " + data.error : ""));
        fatal.retryable = false;
        throw fatal;
      }
      if (!data || !data.photos || !data.photos.length) return { ok: false, message: "No images for: " + query, photos: [] };
      return { ok: true, photos: data.photos.map(function (p) {
        return { id: p.id, url: p.src.large2x || p.src.large || p.src.medium, photographer: p.photographer, photographer_url: p.photographer_url, alt: p.alt || query };
      }) };
    });
  }).catch(function (err) { return { ok: false, message: "Pexels error: " + err.message, photos: [] }; });
}

function downloadImage(imageUrl, filename) {
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
  var destPath = path.join(IMAGES_DIR, filename);
  if (fs.existsSync(destPath)) return Promise.resolve({ ok: true, path: destPath, cached: true });
  return withRetry(function () {
    return httpsGet(imageUrl, {}).then(function (res) {
      if (res.statusCode !== 200) {
        var err = new Error("HTTP " + res.statusCode + " for image");
        err.retryable = res.statusCode === 429 || res.statusCode >= 500;
        throw err;
      }
      if (!res.body.length) {
        var empty = new Error("Empty image body");
        empty.retryable = true;
        throw empty;
      }
      fs.writeFileSync(destPath, res.body);
      return { ok: true, path: destPath, cached: false, size: res.body.length };
    });
  });
}

function searchAndDownload(title, slug, category) {
  var keywords = extractKeywords(title, category);
  return searchImages(keywords, 3).then(function (result) {
    if (!result.ok || !result.photos.length) return { ok: false, message: result.message, imageUrl: null };
    var photo = result.photos[0];
    var filename = (slug || "article") + ".jpg";
    return downloadImage(photo.url, filename).then(function (dl) {
      if (!dl.ok) return { ok: false, message: "Download failed", imageUrl: null };
      return { ok: true, imageUrl: PUBLIC_DIR + "/" + filename, photographer: photo.photographer, photographerUrl: photo.photographer_url, alt: photo.alt || title, cached: dl.cached };
    });
  });
}

// Report the key status without leaking it (used by pipeline diagnostics).
function status() {
  return { keySet: !!PEXELS_API_KEY, keyLength: PEXELS_API_KEY.length, imagesDir: IMAGES_DIR };
}

if (typeof module === "object" && module.exports) {
  module.exports = { extractKeywords: extractKeywords, searchImages: searchImages, downloadImage: downloadImage, searchAndDownload: searchAndDownload, status: status, IMAGES_DIR: IMAGES_DIR, PUBLIC_DIR: PUBLIC_DIR };
}
