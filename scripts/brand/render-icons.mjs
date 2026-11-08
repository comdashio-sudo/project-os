// Render the PNG and ICO brand icons from the SVG sources in client/public/brand (D-37).
//   node scripts/brand/render-icons.mjs
// favicon-16/32/48 and appicon-192/512 come from icon-primary.svg (the direction A symbol alone, transparent corners);
// appicon-maskable-512 from icon-maskable.svg (full-bleed primary, symbol inside the 80% safe zone);
// favicon.ico packs the 16/32/48 PNGs. Chromium draws the SVG, so the PNGs match what the browser shows.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// Playwright is a tool on the machine, not a project dependency (same convention as scripts/capture-screenshots.mjs).
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/");
const { chromium } = require("playwright");

const dir = path.resolve(import.meta.dirname, "../../client/public/brand");
const jobs = [
  ["icon-primary.svg", "favicon-16.png", 16],
  ["icon-primary.svg", "favicon-32.png", 32],
  ["icon-primary.svg", "favicon-48.png", 48],
  ["icon-primary.svg", "appicon-192.png", 192],
  ["icon-primary.svg", "appicon-512.png", 512],
  ["icon-maskable.svg", "appicon-maskable-512.png", 512],
];

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [source, target, size] of jobs) {
    const svg = readFileSync(path.join(dir, source), "utf8").replace(/width="[^"]+" height="[^"]+"/, `width="${size}" height="${size}"`);
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
    writeFileSync(path.join(dir, target), await page.locator("svg").screenshot({ omitBackground: true }));
  }
} finally {
  await browser.close();
}

// ICO with embedded PNG entries (supported by every current browser).
const sizes = [16, 32, 48];
const images = sizes.map(size => readFileSync(path.join(dir, `favicon-${size}.png`)));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((png, i) => {
  const at = 6 + 16 * i;
  header.writeUInt8(sizes[i], at);
  header.writeUInt8(sizes[i], at + 1);
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(png.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += png.length;
});
writeFileSync(path.join(dir, "favicon.ico"), Buffer.concat([header, ...images]));
console.log(`rendered ${jobs.length} PNGs and favicon.ico into client/public/brand`);
