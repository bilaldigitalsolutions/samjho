#!/usr/bin/env node
// Samjho - RBI Press Release Fetcher
// Fetches press release titles, dates, and PDF links from RBI listing page.
// RBI detail pages are PDFs, so raw_content = title + date + source info.
"use strict";
var https = require("https");
var http = require("http");

function httpGet(url, depth) {
  depth = depth || 0;
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  var mod = url.indexOf("https") === 0 ? https : http;
  return new Promise(function (resolve, reject) {
    mod.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, function (res) {
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

function parseRbiListing(html) {
  if (!html || !html.trim()) return [];
  var results = [];
  // Pattern: <td class="tableheader"><b>Date</b></td> followed by <a class='link2' href=...>Title</a>
  var dateRe = /<td[^>]*class=["']?tableheader["']?[^>]*><b>([\s\S]*?)<\/b>/gi;
  var currentDate = "";
  var blocks = html.split(/<tr>/i);

  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];
    // Check for date header
    var dm = block.match(/<td[^>]*class=["']?tableheader["']?[^>]*><b>([\s\S]*?)<\/b>/i);
    if (dm) {
      currentDate = dm[1].replace(/<[^>]+>/g, "").trim();
    }
    // Check for press release link
    var lm = block.match(/<a[^>]+class=["']?link2["']?[^>]+href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a/i);
    if (lm) {
      var title = lm[2].replace(/<[^>]+>/g, "").trim();
      var href = lm[1];
      if (title.length > 10) {
        var fullUrl = href.indexOf("http") === 0 ? href : "https://www.rbi.org.in/scripts/" + href;
        results.push({ title: title, url: fullUrl, date: currentDate });
      }
    }
  }
  return results;
}

function fetchRbi(fetchFn, options) {
  options = options || {};
  var limit = options.limit || 10;
  var fetch = fetchFn || httpGet;
  var url = "https://www.rbi.org.in/scripts/BS_PressReleaseDisplay.aspx";

  return fetch(url).then(function (html) {
    var items = parseRbiListing(html);
    var results = items.slice(0, limit).map(function (item) {
      var rawParts = [item.title];
      if (item.date) rawParts.push("Published: " + item.date);
      rawParts.push("Source: Reserve Bank of India (RBI)");
      rawParts.push("URL: " + item.url);
      return {
        title: item.title,
        source_name: "Reserve Bank of India (RBI)",
        source_url: item.url,
        raw_content: rawParts.join("\n\n"),
        raw_html: "",
        source_published_date: item.date || "",
        primary_category: "Money",
        categorization_status: "categorized",
        content_type: "Press Release",
        fetch_status: "success",
        admin_notes: "Fetched from RBI press releases page.",
      };
    });
    return { ok: results.length > 0, results: results, failures: [] };
  }).catch(function (err) {
    return { ok: false, message: err.message, results: [], failures: [{ code: "FETCH_FAILED", message: err.message }] };
  });
}

if (typeof module === "object" && module.exports) {
  module.exports = { fetchRbi: fetchRbi, parseRbiListing: parseRbiListing };
}
