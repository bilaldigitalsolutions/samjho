#!/usr/bin/env node
// Samjho - Generic RSS Feed Fetcher (SEBI, MyGov, etc.)
"use strict";
var https = require("https");
var http = require("http");

function decodeEntities(s) {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
}
function pickTag(block, names) {
  for (var i = 0; i < names.length; i++) {
    var re = new RegExp("<" + names[i] + "[^>]*>([\\s\\S]*?)</\\s*" + names[i] + "\\s*>", "i");
    var m = block.match(re);
    if (m) return decodeEntities(m[1]).trim();
  }
  return "";
}
function pickLink(block) {
  var m = block.match(/<link[^>]*>([\s\S]*?)<\/link\s*>/i);
  if (m && decodeEntities(m[1]).trim()) return decodeEntities(m[1]).trim();
  var h = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (h) return decodeEntities(h[1]).trim();
  var g = block.match(/<guid[^>]*>([\s\S]*?)<\/guid\s*>/i);
  if (g && /^https?:\/\//i.test(decodeEntities(g[1]).trim())) return decodeEntities(g[1]).trim();
  return "";
}
function parseFeedXml(xml) {
  if (!xml || !xml.trim()) return { ok: false, message: "Empty feed body", items: [] };
  var blocks = [], re = /<(item|entry)[\s>][\s\S]*?<\/\1\s*>/gi, m;
  while ((m = re.exec(xml)) !== null) blocks.push(m[0]);
  if (!blocks.length) return { ok: false, message: "No feed items found", items: [] };
  var items = blocks.map(function (b) {
    return { title: pickTag(b, ["title"]), link: pickLink(b),
      date: pickTag(b, ["pubDate", "published", "updated"]),
      description: pickTag(b, ["description", "summary", "content"]) };
  }).filter(function (item) { return item.title && item.link; });
  return { ok: items.length > 0, items: items };
}
function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
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
function fetchRssFeed(fetchFn, options) {
  options = options || {};
  var url = options.url || "";
  var limit = options.limit || 10;
  var sourceName = options.source_name || "";
  var category = options.category || "needs_manual_categorization";
  var existingUrls = options.existingUrls || [];
  if (!url) return Promise.resolve({ ok: false, message: "No feed URL", results: [], failures: [] });
  var fetch = fetchFn || httpGet;
  return fetch(url).then(function (xml) {
    var parsed = parseFeedXml(xml);
    if (!parsed.ok) return { ok: false, message: parsed.message, results: [], failures: [{ code: "PARSE_FAILED", message: parsed.message, url: url }] };
    var items = parsed.items.slice(0, limit);
    var results = [], failures = [], urlSet = {};
    existingUrls.forEach(function (u) { urlSet[u] = true; });
    items.forEach(function (item) {
      if (urlSet[item.link]) { failures.push({ code: "DUPLICATE", message: "Skipped (dup)", url: item.link }); return; }
      urlSet[item.link] = true;
      var rawParts = [item.title];
      if (item.description) rawParts.push(stripHtml(item.description));
      results.push({ title: item.title, source_name: sourceName, source_url: item.link,
        raw_content: rawParts.join("\n\n"), raw_html: item.description || "",
        source_published_date: item.date || "", primary_category: category,
        categorization_status: "categorized", content_type: "Press Release",
        fetch_status: "success", admin_notes: "Fetched from " + sourceName + " (RSS)." });
    });
    return { ok: results.length > 0, results: results, failures: failures };
  }).catch(function (err) {
    var msg = "Feed fetch failed: " + (err && err.message ? err.message : String(err));
    return { ok: false, message: msg, results: [], failures: [{ code: "FETCH_FAILED", message: msg, url: url }] };
  });
}
if (typeof module === "object" && module.exports) {
  module.exports = { fetchRssFeed: fetchRssFeed, parseFeedXml: parseFeedXml, httpGet: httpGet };
}
