#!/usr/bin/env node
// Samjho - UIDAI Fetcher (Documents category)
// Scrapes Aadhaar updates, circulars, press releases from uidai.gov.in
"use strict";
var https = require("https");

function httpGet(url, depth) {
  depth = depth || 0;
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, function (res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        var loc = res.headers.location;
        var next = loc.indexOf("http") === 0 ? loc : new URL(loc, url).href;
        httpGet(next, depth + 1).then(resolve, reject); return;
      }
      var data = ""; res.on("data", function (c) { data += c; });
      res.on("end", function () { resolve(data); });
    }).on("error", reject);
  });
}

function parseUidaiUpdates(html) {
  if (!html || !html.trim()) return [];
  var items = [];
  // UIDAI has update cards with titles and dates
  // Look for content sections with announcements/updates
  var re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var text = m[2].replace(/<[^>]+>/g, "").trim();
    var href = m[1];
    if (text.length > 15 && text.length < 250 && href.indexOf("#") === -1 && href.indexOf("javascript") === -1) {
      var lower = text.toLowerCase();
      if (lower.indexOf("aadhaar") > -1 || lower.indexOf("uidai") > -1 || lower.indexOf("update") > -1 || lower.indexOf("notification") > -1 || lower.indexOf("circular") > -1 || lower.indexOf("press") > -1 || lower.indexOf("memorandum") > -1 || lower.indexOf("biometric") > -1 || lower.indexOf("enrolment") > -1) {
        var fullUrl = href.indexOf("http") === 0 ? href : "https://uidai.gov.in" + (href.startsWith("/") ? "" : "/") + href;
        items.push({ title: text, url: fullUrl });
      }
    }
  }
  var seen = {};
  return items.filter(function (i) {
    if (seen[i.title]) return false;
    seen[i.title] = true;
    return true;
  });
}

function fetchUidai(fetchFn, options) {
  options = options || {};
  var limit = options.limit || 10;
  var fetch = fetchFn || httpGet;
  return fetch("https://uidai.gov.in/").then(function (html) {
    var items = parseUidaiUpdates(html);
    var results = items.slice(0, limit).map(function (item) {
      return {
        title: item.title,
        source_name: "Unique Identification Authority of India (UIDAI)",
        source_url: item.url,
        raw_content: item.title + "\n\nSource: UIDAI (uidai.gov.in), Ministry of Electronics & IT.",
        raw_html: "",
        source_published_date: "",
        primary_category: "Documents",
        categorization_status: "categorized",
        content_type: "Press Release",
        fetch_status: "success",
        admin_notes: "Fetched from UIDAI main page.",
      };
    });
    return { ok: results.length > 0, results: results, failures: [] };
  }).catch(function (err) {
    return { ok: false, message: err.message, results: [], failures: [{ code: "FETCH_FAILED", message: err.message }] };
  });
}

if (typeof module === "object" && module.exports) {
  module.exports = { fetchUidai: fetchUidai, parseUidaiUpdates: parseUidaiUpdates };
}
