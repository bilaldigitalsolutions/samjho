#!/usr/bin/env node
// Samjho - Multi-Source Content Fetcher
// Loops through registered sources, fetches, dedups, inserts to Supabase.
// Usage: node scripts/fetch-all-sources.js [--source=X] [--limit=N]
// Requires: SUPABASE_SERVICE_ROLE_KEY env var
"use strict";
var path = require("path");
var ROOT = path.join(__dirname, "..");
var registry = require(path.join(ROOT, "admin", "sources", "registry.js"));
var rssFetcher = require(path.join(ROOT, "admin", "sources", "rss-fetcher.js"));
var pibFetcher;
try { pibFetcher = require(path.join(ROOT, "admin", "sources", "pib-fetcher.js")); } catch (e) { pibFetcher = null; }
var rbiFetcher;
try { rbiFetcher = require(path.join(ROOT, "admin", "sources", "rbi-fetcher.js")); } catch (e) { rbiFetcher = null; }
var dgftFetcher;
try { dgftFetcher = require(path.join(ROOT, "admin", "sources", "dgft-fetcher.js")); } catch (e) { dgftFetcher = null; }
var startupFetcher;
try { startupFetcher = require(path.join(ROOT, "admin", "sources", "startupindia-fetcher.js")); } catch (e) { startupFetcher = null; }
var dbContent;
try { dbContent = require(path.join(ROOT, "build", "db-content.js")); } catch (e) {
  console.error("FATAL: Set SUPABASE_SERVICE_ROLE_KEY."); process.exit(1);
}
var https = require("https"), http = require("http");
var args = process.argv.slice(2);
var sourceArg = args.find(function (a) { return a.indexOf("--source=") === 0; });
var limitArg = args.find(function (a) { return a.indexOf("--limit=") === 0; });
var SINGLE_SOURCE = sourceArg ? sourceArg.split("=")[1] : null;
var LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : 5;

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

function fetchSource(src, limit) {
  if (src.id === "pib" && pibFetcher) {
    return pibFetcher.fetchPibReleases(httpGet, { limit: limit, source: src });
  }
  if (src.id === "rbi" && rbiFetcher) {
    return rbiFetcher.fetchRbi(httpGet, { limit: limit });
  }
  if (src.id === "dgft" && dgftFetcher) {
    return dgftFetcher.fetchDgft(httpGet, { limit: limit });
  }
  if (src.id === "startupindia" && startupFetcher) {
    return startupFetcher.fetchStartupIndia(httpGet, { limit: limit });
  }
  if (src.rss_url) {
    return rssFetcher.fetchRssFeed(httpGet, { url: src.rss_url, limit: limit,
      source_name: src.source_name, source_url: src.source_url, category: src.category });
  }
  var url = src.feed_url || src.source_url;
  return httpGet(url).then(function (html) {
    var results = [], re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi, m;
    while ((m = re.exec(html)) !== null && results.length < limit) {
      var text = m[2].replace(/<[^>]+>/g, "").trim();
      if (text.length > 15 && text.length < 200) {
        var fullUrl = m[1].indexOf("http") === 0 ? m[1] : new URL(m[1], src.source_url).href;
        results.push({ title: text, source_name: src.source_name, source_url: fullUrl,
          raw_content: text, raw_html: "", source_published_date: "",
          primary_category: src.category, categorization_status: "categorized",
          content_type: "Press Release", fetch_status: "success",
          admin_notes: "Fetched from " + src.source_name + " (HTML)." });
      }
    }
    return { ok: results.length > 0, results: results, failures: [] };
  }).catch(function (e) { return { ok: false, message: e.message, results: [], failures: [{ code: "FETCH_FAILED", message: e.message }] }; });
}

async function getExistingUrls() {
  try {
    var items = await dbContent.select("select=source_url&source_url=not.is.null&limit=2000");
    return items.map(function (i) { return i.source_url; }).filter(Boolean);
  } catch (e) { console.error("  WARNING: Could not load existing URLs:", e.message); return []; }
}

async function main() {
  console.log("=== SAMJHO MULTI-SOURCE FETCHER ===");
  console.log("Time: " + new Date().toISOString());
  console.log("Mode: " + (SINGLE_SOURCE ? "single (" + SINGLE_SOURCE + ")" : "all") + " | Limit: " + LIMIT + "/source\n");
  var sources = SINGLE_SOURCE
    ? registry.getActiveSources().filter(function (s) { return s.id === SINGLE_SOURCE; })
    : registry.getActiveSources();
  if (!sources.length) { console.error("No sources found."); process.exit(1); }
  console.log("Sources: " + sources.map(function (s) { return s.id; }).join(", ") + "\n");
  var existingUrls = await getExistingUrls();
  console.log("Existing URLs in DB: " + existingUrls.length + "\n");
  var totals = {}, grandTotal = 0;
  for (var i = 0; i < sources.length; i++) {
    var src = sources[i];
    var label = "[" + src.id.toUpperCase() + "]";
    try {
      var result = await fetchSource(src, LIMIT);
      var inserted = 0, skipped = 0;
      if (result.results && result.results.length) {
        for (var j = 0; j < result.results.length; j++) {
          var item = result.results[j];
          if (existingUrls.indexOf(item.source_url) !== -1) { skipped++; continue; }
          try {
            await dbContent.insert(item);
            existingUrls.push(item.source_url);
            inserted++;
          } catch (e) { /* skip dup/err */ }
        }
      }
      totals[src.category] = (totals[src.category] || 0) + inserted;
      grandTotal += inserted;
      var failCount = result.failures ? result.failures.length : 0;
      console.log(label + " " + src.source_name.substring(0, 40) + " — " + inserted + " new, " + skipped + " dup, " + failCount + " fail");
    } catch (e) { console.log(label + " ERROR: " + e.message); }
  }
  console.log("\n=== SUMMARY ===");
  console.log("Total new: " + grandTotal);
  Object.keys(totals).forEach(function (cat) { console.log("  " + cat + ": " + totals[cat]); });
  console.log("=== DONE ===");
}

main().catch(function (e) { console.error("FATAL:", e.message); process.exit(1); });

