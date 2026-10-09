"use strict";
// SiteScope FIX 3 — image intrinsic dimensions for CLS.
// Pure-JS PNG/JPEG header readers so the build can emit width/height on
// every <img> without external dependencies. Resolves public paths
// (/assets/..., /images/...) back to their build-source files.
const fs = require("fs");
const path = require("path");

const BUILD_ROOT = __dirname; // build/

function readPng(buf) {
  // 8-byte signature, IHDR chunk: width = bytes 16-19, height = 20-23 (BE).
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readJpeg(buf) {
  // Walk JPEG markers to the first SOF frame header.
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xda) return null; // start of scan — no SOF found
    const len = buf.readUInt16BE(i + 2);
    // SOF0-SOF15, excluding DHT(C4)/JPG(C8)/DAC(CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function sourcePathFor(publicPath) {
  const clean = String(publicPath || "").split("?")[0].split("#")[0];
  // Article heroes live in build/assets/images (copied to dist/images).
  if (clean.indexOf("/images/") === 0) return path.join(BUILD_ROOT, "assets", clean);
  return path.join(BUILD_ROOT, clean); // /assets/...
}

// WebP (VP8 / VP8L / VP8X) header reader — FIX 3 converted article heroes
// from JPEG/PNG to WebP, so width/height must still be recoverable.
function readWebp(buf) {
  if (buf.length < 30) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    // Extended: 24-bit LE canvas width/height minus one at offsets 24 and 27.
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  if (chunk === "VP8 ") {
    // Lossy: keyframe start code 0x9d 0x01 0x2a at 23, 14-bit dims at 26/28.
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    // Lossless: signature 0x2f at 20, then (w-1) 14 bits + (h-1) 14 bits.
    if (buf[20] !== 0x2f) return null;
    const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
    return {
      width: 1 + (b0 | ((b1 & 0x3f) << 8)),
      height: 1 + (((b1 & 0xc0) >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)),
    };
  }
  return null;
}

function getImageDimensions(publicPath) {
  try {
    const file = sourcePathFor(publicPath);
    if (!fs.existsSync(file)) return null;
    const buf = fs.readFileSync(file);
    // Detect by magic bytes, not extension — some article images are PNGs
    // stored with a .jpg filename, and article heroes are now WebP.
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) return readPng(buf);
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) return readJpeg(buf);
    if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return readWebp(buf);
    const ext = path.extname(file).toLowerCase();
    if (ext === ".png") return readPng(buf);
    if (ext === ".jpg" || ext === ".jpeg") return readJpeg(buf);
    if (ext === ".webp") return readWebp(buf);
    return null;
  } catch (e) {
    return null;
  }
}

// ' width="1920" height="1080"' or '' when dimensions are unknown.
function dimAttrs(publicPath) {
  const d = getImageDimensions(publicPath);
  return d && d.width > 0 && d.height > 0
    ? ' width="' + d.width + '" height="' + d.height + '"'
    : "";
}

module.exports = { getImageDimensions: getImageDimensions, dimAttrs: dimAttrs };
