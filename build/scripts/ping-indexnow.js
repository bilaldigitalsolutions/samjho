#!/usr/bin/env node
/**
 * Ping IndexNow (Bing, Yandex, Naver) with every URL in dist/sitemap.xml.
 *
 * Run this from the build/ folder AFTER deploying dist/, so search engines can
 * crawl new or updated pages within minutes instead of waiting for a scheduled
 * crawl. IndexNow needs no account and no API-key registration — ownership is
 * proved by the key file that build.js writes to the site root
 * (dist/<key>.txt -> https://<domain>/<key>.txt).
 *
 * Usage (from the build/ folder):
 *   node scripts/ping-indexnow.js            submit every sitemap URL
 *   node scripts/ping-indexnow.js --dry-run  print the payload, send nothing
 *   node scripts/ping-indexnow.js --key=<32-char-hex>  override configured key
 *
 * Requires Node 18+ (built-in fetch) and the domain already deployed.
 */

const fs = require("fs");
const path = require("path");

const site = require("../data/site");

const ROOT = path.join(__dirname, "..", "..");
const DIST = path.join(ROOT, "dist");
const SITEMAP = path.join(DIST, "sitemap.xml");
const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_REQUEST = 10000; // IndexNow hard limit per POST
const KEY_PATTERN = /^[a-zA-Z0-9-]{8,128}$/;

const HELP = `IndexNow ping — submit dist/sitemap.xml URLs to Bing, Yandex, Naver.

  node scripts/ping-indexnow.js            submit every sitemap URL
  node scripts/ping-indexnow.js --dry-run  print the payload, send nothing
  node scripts/ping-indexnow.js --key=KEY  override data/site.js indexNow.key
  node scripts/ping-indexnow.js --help     show this help

Run "node build.js" first (creates dist/sitemap.xml and dist/<key>.txt), then
deploy dist/ before pinging.`;

const STATUS_NOTES = {
  200: "OK — URLs accepted",
  202: "Accepted — key is being validated (expected on the very first ping)",
  400: "Bad request — malformed payload or invalid URL list",
  403: "Forbidden — key file not reachable at keyLocation (deploy dist/ first)",
  422: "Unprocessable — URLs do not belong to this host, or key does not match",
  429: "Too many requests — you are pinging too often (see IndexNow guidance)",
};

function fail(message) {
  console.error(`\nIndexNow: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { dryRun: false, key: "" };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--key=")) args.key = arg.slice("--key=".length).trim();
    else if (arg === "--help" || arg === "-h") {
      console.log(HELP);
      process.exit(0);
    } else {
      fail(`unknown argument "${arg}" — try --help`);
    }
  }
  return args;
}

function readSitemapUrls() {
  if (!fs.existsSync(SITEMAP)) {
    fail(`no sitemap at ${SITEMAP} — run "node build.js" in build/ first.`);
  }
  const xml = fs.readFileSync(SITEMAP, "utf8");
  const urls = [];
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    const url = match[1].trim();
    if (!urls.includes(url)) urls.push(url);
  }
  if (!urls.length) fail(`no <loc> entries found in ${SITEMAP}.`);
  return urls;
}

function resolveKey(override) {
  const configured = site.indexNow && site.indexNow.key;
  const key = override || configured || "";
  if (!KEY_PATTERN.test(key)) {
    fail(`invalid key "${key}" — set indexNow.key in data/site.js (8-128 alphanumerics or dashes).`);
  }
  const keyFile = path.join(DIST, `${key}.txt`);
  if (!fs.existsSync(keyFile)) {
    fail(`key file missing at dist/${key}.txt — run "node build.js" so it is copied to the site root.`);
  }
  if (fs.readFileSync(keyFile, "utf8").trim() !== key) {
    fail(`dist/${key}.txt does not contain the configured key.`);
  }
  return key;
}

function chunk(list, size) {
  const batches = [];
  for (let i = 0; i < list.length; i += size) batches.push(list.slice(i, i + size));
  return batches;
}

async function submit(payload) {
  const startedAt = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  return { res, ms: Date.now() - startedAt };
}

async function main() {
  if (typeof fetch !== "function") {
    fail(`Node 18+ is required (built-in fetch). Current version: ${process.version}`);
  }

  const args = parseArgs(process.argv.slice(2));
  const urls = readSitemapUrls();
  const key = resolveKey(args.key);
  const host = new URL(site.domain).hostname;
  const keyLocation = `${site.domain}/${key}.txt`;
  const batches = chunk(urls, MAX_URLS_PER_REQUEST);

  console.log(`IndexNow host:       ${host}`);
  console.log(`IndexNow key file:   ${keyLocation}`);
  console.log(`IndexNow sitemap:    ${SITEMAP}`);
  console.log(`IndexNow URLs found: ${urls.length} (${batches.length} request(s))`);

  if (args.dryRun) {
    console.log(`\n[dry run] payload for ${ENDPOINT}:`);
    console.log(JSON.stringify({ host, key, keyLocation, urlList: urls }, null, 2));
    console.log(`\n[dry run] nothing was sent.`);
    return;
  }

  let submitted = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const label =
      batches.length > 1
        ? `batch ${i + 1}/${batches.length} (${batch.length} URLs)`
        : `${batch.length} URLs`;
    try {
      const { res, ms } = await submit({ host, key, keyLocation, urlList: batch });
      const note = STATUS_NOTES[res.status] || "unexpected status";
      if (res.ok) {
        submitted += batch.length;
        console.log(`OK   ${label} — HTTP ${res.status} ${note} (${ms} ms)`);
      } else {
        const detail = (await res.text()).trim();
        console.error(`FAIL ${label} — HTTP ${res.status} ${note} (${ms} ms)${detail ? ` :: ${detail}` : ""}`);
        process.exitCode = 1;
      }
    } catch (err) {
      console.error(`FAIL ${label} — request failed: ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log(`\nIndexNow done: ${submitted}/${urls.length} URLs submitted.`);
  if (submitted === 0) {
    console.error(`Check that ${keyLocation} returns the key (deploy dist/ first), then retry.`);
  }
  console.log("Reminder: re-run this after every deploy so new pages are indexed fast.");
}

main().catch((err) => fail(err.message));