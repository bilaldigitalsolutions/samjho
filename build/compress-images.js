// compress-images.js — FIX 3 (site weight).
//
// Article hero images downloaded by admin/ai/pexels-fetcher.js land in
// build/assets/images/articles/ as full-size files (3+ MB each; ~45 MB for
// the 99 published guides). This script:
//   1. converts every .jpg/.jpeg/.png there to WebP (< 100 KB, max width
//      1280) using sharp,
//   2. rewrites hero_image references in build/data/published-guides.json to
//      the new .webp files (buildPublishedGuides renders from this local JSON
//      at build time — nothing is fetched live), and
//   3. deletes the original heavy files so build.js (which copies
//      build/assets/images -> dist/images) ships only WebP.
//
// Idempotent: once originals are gone the next run finds nothing to do, so
// this is safe to execute on every build. build.js calls it BEFORE any page
// is rendered, so hero <img>, og:image and image-dims.js all see .webp.
"use strict";
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const IMAGES_DIR = path.join(__dirname, "assets", "images", "articles");
const STORE_PATH = path.join(__dirname, "data", "published-guides.json");
const MAX_BYTES = 100 * 1024; // 100 KB per image target
const MAX_WIDTH = 1280; // heroes render well below this
const QUALITY_LADDER = [72, 60, 50, 40];

function fmt(bytes) {
  return (bytes / 1024).toFixed(1) + " KB";
}

async function toWebp(srcPath) {
  const input = fs.readFileSync(srcPath);
  let best = null;
  // Widths x quality ladder — keep going until the file fits under MAX_BYTES.
  for (const w of [1280, 1024, 896]) {
    for (const q of QUALITY_LADDER) {
      const buf = await sharp(input)
        .rotate()
        .resize(w, null, { withoutEnlargement: true })
        .webp({ quality: q, effort: 6 })
        .toBuffer();
      if (!best || buf.length < best.length) best = buf;
      if (buf.length <= MAX_BYTES) return buf;
    }
  }
  return best; // over target but smallest attempt — still far below the original
}

async function compressArticleImages() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.log("[images] no article image directory — skipped");
    return;
  }
  const files = fs.readdirSync(IMAGES_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  if (!files.length) {
    console.log("[images] article heroes already WebP — nothing to convert");
    return;
  }

  let converted = 0;
  let kept = 0;
  let before = 0;
  let after = 0;
  const replacements = [];

  for (const file of files) {
    const isWebp = /\.webp$/i.test(file);
    const srcPath = path.join(IMAGES_DIR, file);
    const webpName = isWebp ? file : file.replace(/\.(jpe?g|png)$/i, ".webp");
    const webpPath = path.join(IMAGES_DIR, webpName);
    let srcSize;
    try {
      srcSize = fs.statSync(srcPath).size;
    } catch (e) {
      continue;
    }
    // Already-converted WebP within target: never re-encode (avoids generation
    // loss across repeated builds). Only oversized WebPs are re-compressed.
    if (isWebp && srcSize <= MAX_BYTES) continue;
    try {
      const webpBuf = await toWebp(srcPath);
      if (webpBuf.length < srcSize) {
        fs.writeFileSync(webpPath, webpBuf);
        if (!isWebp) {
          // JPEG/PNG originals: remove and rewrite the guide references.
          fs.unlinkSync(srcPath);
          replacements.push(["/images/articles/" + file, "/images/articles/" + webpName]);
        }
        // .webp inputs are re-compressed in place (references already point here).
        converted++;
        before += srcSize;
        after += webpBuf.length;
        console.log("  [images] " + file + ": " + fmt(srcSize) + " -> " + fmt(webpBuf.length) + " WebP");
      } else {
        kept++;
        console.log("  [images] " + file + ": kept original (" + fmt(srcSize) + " <= webp " + fmt(webpBuf.length) + ")");
      }
    } catch (err) {
      kept++;
      console.log("  [images] " + file + ": conversion failed (" + err.message + ") — kept original");
    }
  }

  // Rewrite hero_image references so every guide points at the .webp file.
  if (replacements.length && fs.existsSync(STORE_PATH)) {
    let raw = fs.readFileSync(STORE_PATH, "utf8");
    let changed = 0;
    for (const pair of replacements) {
      const from = pair[0];
      const to = pair[1];
      if (raw.indexOf(from) !== -1) {
        raw = raw.split(from).join(to);
        changed++;
      }
    }
    if (changed) {
      fs.writeFileSync(STORE_PATH, raw, "utf8");
      console.log("[images] published-guides.json: " + changed + " reference(s) rewritten to .webp");
    }
  }

  console.log(
    "[images] " + converted + " converted, " + kept + " kept — " +
    fmt(before) + " -> " + fmt(after) + " (saved " + fmt(before - after) + ")"
  );
}

module.exports = { compressArticleImages };