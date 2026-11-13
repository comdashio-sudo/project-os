// D-33 (G-100): the phone's field entry opens from a cold start with no network, after one visit. Local only (a built server and the test database).
//
//   BASE_URL=http://127.0.0.1:3200 SESSION_FILE=<token file> TENANT_ID=<id> PROJECT_ID=<id> node tests/ui/offlineColdStart.mjs
//
// 1. Visit /m/<tenant>/<project> online, wait until client/public/sw.js controls the page.
// 2. Cut the network (the browser context goes offline) and reload: the field entry must show its title and the offline line.
// 3. What the worker kept: no /api/ URL may be in its cache (company data never goes there).
// Negative control: the same steps with service workers blocked must NOT show the screen offline — proving the worker is what opens it.
// Exit 0 when all hold; 1 with the reason otherwise. Prints no secret.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/")("playwright");
const base = process.env.BASE_URL ?? "http://127.0.0.1:3200";
const token = readFileSync(process.env.SESSION_FILE, "utf8").trim();
const path = `/m/${process.env.TENANT_ID}/${process.env.PROJECT_ID}`;
const TITLE = "إدخال سريع من الموقع";
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium" });

async function run(serviceWorkers) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers });
  await context.addInitScript(() => { try { localStorage.setItem("project-os-language", "ar"); } catch { /* storage off */ } });
  await context.addCookies([{ name: "app_session_id", value: token, url: base }]);
  const page = await context.newPage();
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await page.getByText(TITLE).first().waitFor({ timeout: 15000 });
  if (serviceWorkers === "allow") {
    await page.evaluate(() => navigator.serviceWorker.ready);
    if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) { await page.reload({ waitUntil: "networkidle" }); }
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 15000 });
  }
  await context.setOffline(true);
  let shown = false; let error = null;
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
    shown = await page.getByText(TITLE).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
  } catch (caught) { error = String(caught.message).split("\n")[0]; }
  const kept = serviceWorkers === "allow" ? await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat()).catch(() => []) : [];
  await context.close();
  return { shown, error, kept };
}

const withWorker = await run("allow");
const withoutWorker = await run("block");
await browser.close();
const apiKept = withWorker.kept.filter(pathname => pathname.startsWith("/api/") || pathname === "/healthz");
const result = { offlineColdStartShowsFieldEntry: withWorker.shown, keptFiles: withWorker.kept.length, apiResponsesKept: apiKept.length, negativeControlWithoutWorkerShows: withoutWorker.shown };
console.log(JSON.stringify(result));
if (!withWorker.shown) { console.error(`the field entry did not open offline: ${withWorker.error ?? "title not shown"}`); process.exit(1); }
if (apiKept.length) { console.error(`company data in the worker's cache: ${apiKept.join(", ")}`); process.exit(1); }
if (withoutWorker.shown) { console.error("negative control failed: the screen opened offline without the worker, so this run proves nothing"); process.exit(1); }
process.exit(0);
