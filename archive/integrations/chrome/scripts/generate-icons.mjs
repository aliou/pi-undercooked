import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_SVG = path.join(ROOT, "public", "images", "pi-dev-logo.svg");
const OUT_DIR = path.join(ROOT, "public", "images");

const EXTENSION_ICON_SIZES = [16, 48, 128];
const ACTION_ICON_SIZES = [16, 32];

const COLORS = {
  light: "#2563eb",
  dark: "#60a5fa",
};

function withColor(svgBuffer, color) {
  const svg = svgBuffer
    .toString("utf8")
    .replace(/fill="#fff"/gi, `fill="${color}"`)
    .replace(/fill="#ffffff"/gi, `fill="${color}"`);
  return Buffer.from(svg, "utf8");
}

function createDevBadge(size) {
  const badgeWidth = Math.round(size * 0.7);
  const badgeHeight = Math.round(size * 0.34);
  const x = size - badgeWidth - Math.round(size * 0.04);
  const y = size - badgeHeight - Math.round(size * 0.04);
  const radius = Math.max(2, Math.round(size * 0.08));
  const fontSize = Math.max(6, Math.round(size * 0.17));
  const textY = y + Math.round(badgeHeight * 0.7);

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect x="${x}" y="${y}" width="${badgeWidth}" height="${badgeHeight}" rx="${radius}" fill="#dc2626" />
      <text x="${x + badgeWidth / 2}" y="${textY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff">DEV</text>
    </svg>`,
    "utf8",
  );
}

async function renderPng(svgBuffer, size, outPath, withDevBadge = false) {
  const pipeline = sharp(svgBuffer, { density: 512 }).resize(size, size, {
    fit: "contain",
  });

  if (withDevBadge) {
    pipeline.composite([{ input: createDevBadge(size) }]);
  }

  await pipeline
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outPath);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const rawSvg = await fs.readFile(SOURCE_SVG);

  const lightSvg = withColor(rawSvg, COLORS.light);
  const darkSvg = withColor(rawSvg, COLORS.dark);

  await Promise.all([
    ...EXTENSION_ICON_SIZES.flatMap((size) => [
      renderPng(lightSvg, size, path.join(OUT_DIR, `icon-${size}.png`), false),
      renderPng(lightSvg, size, path.join(OUT_DIR, `icon-dev-${size}.png`), true),
    ]),
    ...ACTION_ICON_SIZES.flatMap((size) => [
      renderPng(lightSvg, size, path.join(OUT_DIR, `action-light-${size}.png`), false),
      renderPng(darkSvg, size, path.join(OUT_DIR, `action-dark-${size}.png`), false),
      renderPng(
        lightSvg,
        size,
        path.join(OUT_DIR, `action-dev-light-${size}.png`),
        true,
      ),
      renderPng(
        darkSvg,
        size,
        path.join(OUT_DIR, `action-dev-dark-${size}.png`),
        true,
      ),
    ]),
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
