#!/usr/bin/env node
// Samjho — Pexels Image Fetcher
// Searches Pexels for images, downloads to dist/images/articles/
// Requires: PEXELS_API_KEY environment variable
"use strict";
var https = require("https");
var fs = require("fs");
var path = require("path");
var PEXELS_API_KEY = process.env.PEXELS_API_KEY || "";
var PEXELS_BASE = "https://api.pexels.com/v1/search";
var IMAGES_DIR = path.join(__dirname, "..", "..", "dist", "images", "articles");

function httpsGet(url, headers) {
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: headers || {} }, function (res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        httpsGet(res.headers.location, headers).then(resolve, reject); return;
      }
      var chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () { resolve(Buffer.concat(chunks)); });
    }).on("error", reject);
  });
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
  return httpsGet(url, { Authorization: PEXELS_API_KEY }).then(function (buf) {
    var data = JSON.parse(buf.toString("utf8"));
    if (!data || !data.photos || !data.photos.length) return { ok: false, message: "No images for: " + query, photos: [] };
    return { ok: true, photos: data.photos.map(function (p) {
      return { id: p.id, url: p.src.large2x || p.src.large || p.src.medium, photographer: p.photographer, photographer_url: p.photographer_url, alt: p.alt || query };
    }) };
  }).catch(function (err) { return { ok: false, message: "Pexels error: " + err.message, photos: [] }; });
}

function downloadImage(imageUrl, filename) {
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
  var destPath = path.join(IMAGES_DIR, filename);
  if (fs.existsSync(destPath)) return Promise.resolve({ ok: true, path: destPath, cached: true });
  return new Promise(function (resolve, reject) {
    https.get(imageUrl, function (res) {
      if (res.statusCode === 301 || res.statusCode === 302) { downloadImage(res.headers.location, filename).then(resolve, reject); return; }
      if (res.statusCode !== 200) { reject(new Error("HTTP " + res.statusCode)); return; }
      var chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () { var buf = Buffer.concat(chunks); fs.writeFileSync(destPath, buf); resolve({ ok: true, path: destPath, cached: false, size: buf.length }); });
    }).on("error", reject);
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
      return { ok: true, imageUrl: "/images/articles/" + filename, photographer: photo.photographer, photographerUrl: photo.photographer_url, alt: photo.alt || title, cached: dl.cached };
    });
  });
}

if (typeof module === "object" && module.exports) {
  module.exports = { extractKeywords: extractKeywords, searchImages: searchImages, downloadImage: downloadImage, searchAndDownload: searchAndDownload, IMAGES_DIR: IMAGES_DIR };
}
