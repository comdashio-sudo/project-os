// Q-18: what a person sees from the moment a page is opened until it has settled, on a slow network (Fast 3G), frame by frame.
// Local only (a built server and the test database), like the other tests/ui scripts.
//
//   BASE_URL=http://127.0.0.1:3200 SESSION_FILE=<token file> PATHS=/projects/<t>,/projects/<t>/<p>/controls OUT_DIR=<dir> node tests/ui/loadingFrames.mjs
//
// For each path, at 390 and 1280 wide, in Arabic: a screenshot every 250 ms for up to SECONDS (default 12) after navigation starts, until the network is idle.
// Each frame is measured:
//   blank  — a frame of one flat colour (fewer than 1% of pixels differ from its dominant colour): white, or the bare page background with nothing on it.
//            The owner's «white screen» is this, whatever the exact shade.
//   green  — share of pixels in the aqua/green family (high green and blue, low red: the brand aqua #2ED3C6 and its tints). ≥ 2% is a "green frame".
//   CLS    — layout shift summed by the browser over the load (PerformanceObserver "layout-shift", without input).
//   first content — the first frame that is neither blank white nor the bare background (more than 3% of pixels differ from the frame's dominant colour).
// Exit 1 when any blank frame, any green frame, or CLS ≥ 0.05 is found; 0 otherwise. Prints no secret.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const { PNG } = createRequire(import.meta.url)("pngjs"); // a dependency of the project (through exceljs/jszip tooling), not of Playwright
const base = process.env.BASE_URL ?? "http://127.0.0.1:3200";
const token = readFileSync(process.env.SESSION_FILE, "utf8").trim();
const paths = (process.env.PATHS ?? "/").split(",").map(item => item.trim()).filter(Boolean);
const outDir = process.env.OUT_DIR ?? "loading-frames";
const seconds = Number(process.env.SECONDS ?? 12);
const FAST_3G = { offline: false, latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024) / 8 * 0.9, uploadThroughput: (750 * 1024) / 8 * 0.9 };

export function measureFrame(buffer) {
  const png = PNG.sync.read(buffer); const total = png.width * png.height; let white = 0; let green = 0; const counts = new Map();
  for (let index = 0; index < png.data.length; index += 4 * 3) { // every third pixel is plenty for shares
    const r = png.data[index]; const g = png.data[index + 1]; const b = png.data[index + 2];
    if (r === 255 && g === 255 && b === 255) white += 1;
    if (g > 140 && b > 120 && g - r > 60 && Math.abs(g - b) < 70) green += 1;
    const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3); counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sampled = Math.ceil(total / 3); const dominant = Math.max(...counts.values());
  return { white: white / sampled, green: green / sampled, nonBackground: 1 - dominant / sampled };
}

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const report = [];
for (const path of paths) {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      try { localStorage.setItem("project-os-language", "ar"); } catch { /* storage off */ }
      window.__cls = 0; try { new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value; }).observe({ type: "layout-shift", buffered: true }); } catch { /* unsupported */ }
    });
    await context.addCookies([{ name: "app_session_id", value: token, url: base }]);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page); await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", FAST_3G);
    const label = `${String(paths.indexOf(path) + 1).padStart(2, "0")}-${path.split("/").filter(part => part && !/^[0-9a-f-]{36}$/i.test(part)).join("_") || "home"}-${width}`; const dir = join(outDir, label); mkdirSync(dir, { recursive: true });
    const started = Date.now(); let idle = false;
    const navigation = page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: seconds * 1000 }).then(() => { idle = true; }, () => { idle = true; });
    const frames = [];
    while (Date.now() - started < seconds * 1000) {
      const at = Date.now() - started;
      const shot = await page.screenshot({ timeout: 2000 }).catch(() => null);
      if (shot) { const measured = measureFrame(shot); frames.push({ at, ...measured }); writeFileSync(join(dir, `${String(at).padStart(5, "0")}ms.png`), shot); }
      if (idle && frames.length && frames.at(-1).at > 500) break;
      const wait = 250 - ((Date.now() - started) - at); if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    }
    await navigation;
    const cls = await page.evaluate(() => window.__cls ?? 0).catch(() => 0);
    const blank = frames.filter(frame => frame.nonBackground < 0.01);
    const greenFrames = frames.filter(frame => frame.green >= 0.02);
    const firstContent = frames.find(frame => frame.nonBackground >= 0.01);
    report.push({ path, width, frames: frames.length, blankFrames: blank.map(frame => frame.at), greenFrames: greenFrames.map(frame => `${frame.at}ms ${(frame.green * 100).toFixed(1)}%`), cls: Number(cls.toFixed(4)), firstContentMs: firstContent?.at ?? null, settledMs: frames.at(-1)?.at ?? null });
    await context.close();
  }
}
await browser.close();
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
const failed = report.filter(row => row.blankFrames.length || row.greenFrames.length || row.cls >= 0.05);
console.log(failed.length ? `FAIL on ${failed.length} of ${report.length} loads` : `ok: ${report.length} loads, no blank frame, no green frame, CLS < 0.05`);
process.exit(failed.length ? 1 : 0);
