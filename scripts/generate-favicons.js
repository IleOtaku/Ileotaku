// Generates every favicon/app-icon size from public/icon.png (the manga-eye source art) using
// sharp. Run with: node scripts/generate-favicons.js
//
// public/favicon.ico is written as a real (if minimal) ICO container — a single embedded PNG
// wrapped in an ICONDIR + ICONDIRENTRY header, rather than a plain renamed .png file. Modern
// browsers and OSes (Vista+) accept a PNG-payload ICO natively, and this avoids shipping a file
// with a .ico extension that isn't actually valid ICO structure.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "public", "icon.png");
const ICONS_DIR = path.join(ROOT, "public", "icons");

// [outputPath relative to public/, size in px]
const PNG_TARGETS = [
  ["favicon-16x16.png", 16],
  ["favicon-32x32.png", 32],
  ["icons/icon-32.png", 32], // not in the PWA manifest's own list — generated so
  // components/layout/Navbar.tsx and Footer.tsx (which reference this exact path at a small
  // display size) have a real file to point at, alongside the manifest-driven sizes below.
  ["icons/icon-72.png", 72],
  ["icons/icon-96.png", 96],
  ["icons/icon-128.png", 128],
  ["icons/icon-144.png", 144],
  ["icons/icon-152.png", 152],
  ["icons/icon-192.png", 192],
  ["icons/icon-384.png", 384],
  ["icons/icon-512.png", 512],
];

/** Wraps a single PNG buffer in a minimal one-image ICO container (ICONDIR + one
 * ICONDIRENTRY + the PNG bytes verbatim — ICO's "PNG payload" mode, supported since Windows
 * Vista and by every modern browser). */
function pngToIco(pngBuffer, size) {
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + entrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(entrySize);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // color palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8); // image data size
  entry.writeUInt32LE(dataOffset, 12); // image data offset

  return Buffer.concat([header, entry, pngBuffer]);
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source image not found: ${SOURCE}`);
    process.exit(1);
  }
  fs.mkdirSync(ICONS_DIR, { recursive: true });

  for (const [relOut, size] of PNG_TARGETS) {
    const outPath = path.join(ROOT, "public", relOut);
    await sharp(SOURCE).resize(size, size).png().toFile(outPath);
    console.log(`✓ ${relOut} (${size}x${size})`);
  }

  // ICO has no reliable transparency support across every consumer (some older/embedded ICO
  // renderers show it as solid black instead of see-through), so — unlike every PNG target
  // above, which keeps the source's real alpha channel — the ICO gets the source's transparent
  // background flattened onto our own bg color first. #0c0a07 matches tailwind.config.ts's
  // `bg` token, i.e. the site's actual navbar/body background, so a favicon rendered against
  // that fill still reads as "no visible box" in practice.
  const icoPng = await sharp(SOURCE).resize(32, 32).flatten({ background: "#0c0a07" }).png().toBuffer();
  fs.writeFileSync(path.join(ROOT, "public", "favicon.ico"), pngToIco(icoPng, 32));
  console.log("✓ favicon.ico (32x32, PNG-in-ICO, flattened onto #0c0a07)");

  console.log("\nAll favicon/app-icon sizes generated from public/icon.png.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
