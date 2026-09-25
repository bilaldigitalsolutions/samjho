#!/usr/bin/env node
// Samjho - DGFT Fetcher (Business category)
// Scrapes trade notifications, circulars from dgft.gov.in
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

function parseDgftListing(html) {
  if (!html || !html.trim()) return [];
  var items = [];
  // DGFT lists notifications/circulars in table rows with links
  var re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var text = m[2].replace(/<[^>]+>/g, "").trim();
    var href = m[1];
    // Filter for relevant content (notifications, circulars, trade notices)
    if (text.length > 20 && text.length < 250 && href.indexOf("#") === -1 && href.indexOf("javascript") === -1) {
      var lower = text.toLowerCase();
      if (lower.indexOf("notification") > -1 || lower.indexOf("circular") > -1 || lower.indexOf("trade notice") > -1 || lower.indexOf("public notice") > -1 || lower.indexOf("policy") > -1 || lower.indexOf("amendment") > -1) {
        var fullUrl = href.indexOf("http") === 0 ? href : "https://www.dgft.gov.in" + (href.startsWith("/") ? "" : "/CP/") + href;
        items.push({ title: text, url: fullUrl });
      }
    }
  }
  // Dedup by title
  var seen = {};
  return items.filter(function (i) {
    if (seen[i.title]) return false;
    seen[i.title] = true;
    return true;
  });
}

function fetchDgft(fetchFn, options) {
  options = options || {};
  var limit = options.limit || 10;
  var fetch = fetchFn || httpGet;
  return fetch("https://www.dgft.gov.in/CP/").then(function (html) {
    var items = parseDgftListing(html);
    var results = items.slice(0, limit).map(function (item) {
      return {
        title: item.title,
        source_name: "Directorate General of Foreign Trade (DGFT)",
        source_url: item.url,
        raw_content: item.title + "\n\nSource: Directorate General of Foreign Trade (DGFT), Ministry of Commerce & Industry.",
        raw_html: "",
        source_published_date: "",
        primary_category: "Business",
        categorization_status: "categorized",
        content_type: "Press Release",
        fetch_status: "success",
        admin_notes: "Fetched from DGFT main page.",
      };
    });
    return { ok: results.length > 0, results: results, failures: [] };
  }).catch(function (err) {
    return { ok: false, message: err.message, results: [], failures: [{ code: "FETCH_FAILED", message: err.message }] };
  });
}

if (typeof module === "object" && module.exports) {
  module.exports = { fetchDgft: fetchDgft, parseDgftListing: parseDgftListing };
}
