// optimize-images.js — Convert images to WebP and generate responsive sizes
// Run as part of build: node build/optimize-images.js
"use strict";
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ASSETS_DIR = path.join(__dirname, "..", "dist", "assets");
const LOGO_DIR = path.join(ASSETS_DIR, "logo");
const FAVICON_DIR = path.join(ASSETS_DIR, "favicon");

// Images to process: [sourceDir, sourceFile, webpName, sizes for srcset]
const IMAGES = [
  { dir: ASSETS_DIR, src: "hero-illustration-new.png", name: "hero-illustration-new", sizes: [400, 800] },
  { dir: ASSETS_DIR, src: "featured-kisan.png", name: "featured-kisan", sizes: [300, 600] },
  { dir: ASSETS_DIR, src: "featured-pan.png", name: "featured-pan", sizes: [300, 600] },
  { dir: ASSETS_DIR, src: "featured-udyam.png", name: "featured-udyam", sizes: [300, 600] },
  { dir: LOGO_DIR, src: "logo-full.png", name: "logo-full", sizes: [200, 400] },
  { dir: LOGO_DIR, src: "logo-icon.png", name: "logo-icon", sizes: [40, 80] },
  { dir: FAVICON_DIR, src: "favicon-32x32.png", name: "favicon-32x32", sizes: [32, 64] },
];

async function optimizeImage(img) {
  const srcPath = path.join(img.dir, img.src);
  if (!fs.existsSync(srcPath)) {
    console.log(`  SKIP: ${img.src} not found`);
    return;
  }

  const srcBuf = fs.readFileSync(srcPath);
  const srcSize = srcBuf.length;

  // Convert to WebP at quality 80
  const webpPath = path.join(img.dir, `${img.name}.webp`);
  const webpBuf = await sharp(srcBuf).webp({ quality: 80 }).toBuffer();
  fs.writeFileSync(webpPath, webpBuf);

  // Generate responsive sizes as WebP
  for (const size of img.sizes) {
    const sizePath = path.join(img.dir, `${img.name}-${size}w.webp`);
    try {
      const resized = await sharp(srcBuf)
        .resize(size, null, { withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      fs.writeFileSync(sizePath, resized);
    } catch (e) {
      // Skip if image is smaller than target size
    }
  }

  // Also recompress the original PNG so the fallback shipped in dist/ is
  // small too (FIX 3 site weight): palette quantisation for illustrations,
  // lossless re-encode as the conservative fallback — keep whichever is
  // smallest and only replace when it actually shrinks the file.
  const pngOptPath = path.join(img.dir, img.src);
  try {
    const candidates = [];
    try { candidates.push(await sharp(srcBuf).png({ compressionLevel: 9, palette: true, quality: 92 }).toBuffer()); } catch (e) {}
    try { candidates.push(await sharp(srcBuf).png({ compressionLevel: 9 }).toBuffer()); } catch (e) {}
    const best = candidates.filter((b) => b.length < srcSize).sort((a, b) => a.length - b.length)[0];
    if (best) fs.writeFileSync(pngOptPath, best);
  } catch (e) {}

  const saved = srcSize - webpBuf.length;
  const pct = Math.round((saved / srcSize) * 100);
  console.log(`  ${img.src}: ${srcSize}B -> ${webpBuf.length}B WebP (${pct}% saved)`);
}

async function main() {
  console.log("=== Image Optimization ===");
  let totalSaved = 0;

  for (const img of IMAGES) {
    const srcPath = path.join(img.dir, img.src);
    if (!fs.existsSync(srcPath)) continue;
    const before = fs.statSync(srcPath).size;
    await optimizeImage(img);
    const webpPath = path.join(img.dir, `${img.name}.webp`);
    if (fs.existsSync(webpPath)) {
      totalSaved += before - fs.statSync(webpPath).size;
    }
  }

  console.log(`\nTotal savings: ${Math.round(totalSaved / 1024)} KiB`);
  console.log("Image optimization complete!");
}

main().catch((err) => {
  console.error("Image optimization failed:", err);
  process.exit(1);
});
