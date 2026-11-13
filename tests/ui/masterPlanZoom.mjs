// Q-20: the master plan's zoom toolbar in a real browser, on the demonstration drawing (docs/demo/master-plan-demo.dxf: 25 blocks, 500 villas).
// Local only (a built server and the test database with the demo company), like the other tests/ui scripts.
//
//   BASE_URL=http://127.0.0.1:3200 SESSION_FILE=<token file> TENANT_ID=<id> PROJECT_ID=<id> OUT_DIR=<dir> node tests/ui/masterPlanZoom.mjs
//
// At 390 and 1280 wide, in Arabic: upload the drawing, then −/+ (25% steps), the slider, 100%, fit, Ctrl + wheel, double click; the villa details appear
// from 150% and only the number below it; one zoom step with 500 villas takes under 100 ms to the next frame; screenshots at 50%, 100% and 200%.
// Exit 1 with the failed checks; 0 when all hold. Prints no secret.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/")("playwright");
const base = process.env.BASE_URL ?? "http://127.0.0.1:3200";
const token = readFileSync(process.env.SESSION_FILE, "utf8").trim();
const outDir = process.env.OUT_DIR ?? "master-plan-zoom"; mkdirSync(outDir, { recursive: true });
const url = `${base}/projects/${process.env.TENANT_ID}/${process.env.PROJECT_ID}/controls#manager-assurance`;
const checks = []; const check = (name, ok, detail = "") => { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium" });
for (const width of [390, 1280]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  // a new browser context starts with empty storage, so the first load is at 100%; the reload below must find the kept view, so nothing is cleared here
  await context.addInitScript(() => { try { localStorage.setItem("project-os-language", "ar"); } catch { /* storage off */ } });
  await context.addCookies([{ name: "app_session_id", value: token, url: base }]);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  const input = page.locator('input[type="file"][accept*=".dxf"]').first();
  await input.setInputFiles("docs/demo/master-plan-demo.dxf");
  const toolbar = page.getByRole("toolbar").filter({ has: page.locator("[data-zoom-percent]") }).first();
  await toolbar.waitFor({ timeout: 30000 });
  const percent = async () => (await toolbar.locator("[data-zoom-percent]").innerText()).trim();
  const map = page.locator("svg[role=img][viewBox]").filter({ has: page.locator("polygon") }).first();
  await map.scrollIntoViewIfNeeded();
  const button = name => toolbar.getByRole("button", { name, exact: true });
  // a fresh upload links nothing on its own here (the demo drawing's labels are not unit codes), so three villas are linked by a tap, the way a planner does
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole("list", { name: /^غير مربوط:/ }).getByRole("button").first().click();
    await page.getByRole("button", { name: "ربط بنقرة" }).click();
    await map.locator("polygon").nth(index * 7).click({ force: true });
  }
  check(`${width}: starts at 100%`, (await percent()) === "100%", await percent());
  const small = await toolbar.locator("button, input").evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height < 44).length);
  check(`${width}: every toolbar control is at least 44px tall`, small === 0, `${small} smaller`);
  await button("تكبير").click(); check(`${width}: + gives 125%`, (await percent()) === "125%", await percent());
  await button("تصغير").click(); await button("تصغير").click(); check(`${width}: − twice gives 75%`, (await percent()) === "75%", await percent());
  await toolbar.getByRole("slider").fill("50"); check(`${width}: the slider sets 50%`, (await percent()) === "50%", await percent());
  await map.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(outDir, `zoom-50-${width}.png`) });
  await button("100%").click(); check(`${width}: 100% returns to 100%`, (await percent()) === "100%", await percent());
  const numberOnly = await map.locator("[data-villa-detail]").count();
  check(`${width}: at 100% the villas show their number only`, numberOnly === 0, `${numberOnly} detailed`);
  await map.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(outDir, `zoom-100-${width}.png`) });
  // one zoom step with 500 villas: time from the click to the next painted frame
  const stepMs = await page.evaluate(async () => { const plus = Array.from(document.querySelectorAll("[role=toolbar] button")).find(node => node.getAttribute("aria-label") === "تكبير"); const started = performance.now(); plus.click(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return performance.now() - started; });
  check(`${width}: one zoom step with 500 villas paints within 100 ms`, stepMs < 100, `${stepMs.toFixed(1)} ms`);
  await toolbar.getByRole("slider").fill("200"); check(`${width}: the slider sets 200%`, (await percent()) === "200%", await percent());
  const detailed = await map.locator("[data-villa-detail]").count();
  check(`${width}: at 200% the villas show number, current activity and progress`, detailed > 0, `${detailed} villas`);
  await map.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(outDir, `zoom-200-${width}.png`) });
  await button("ملاءمة الشاشة").click(); check(`${width}: fit returns to 100%`, (await percent()) === "100%", await percent());
  // choosing a block (after an activity, which is when the filter is offered) brings that block into view, close enough to read the villas
  await page.getByLabel("التلوين حسب").click(); await page.getByRole("option").nth(1).click();
  await page.getByLabel("البلوك", { exact: true }).click(); await page.getByRole("option").nth(1).click();
  const blockPercent = Number.parseInt(await percent());
  check(`${width}: choosing a block zooms to it`, blockPercent > 150, `${blockPercent}%`);
  check(`${width}: in the block view the linked villas show their details`, (await map.locator("[data-villa-detail]").count()) > 0, `${await map.locator("[data-villa-detail]").count()} villas`);
  await map.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(outDir, `zoom-block-${width}.png`) });
  await button("ملاءمة الشاشة").click();
  await map.scrollIntoViewIfNeeded();
  const box = await map.boundingBox();
  if (width === 1280 && box) {
    // the middle of the map, clear of the sticky toolbar above it
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down("Control"); await page.mouse.wheel(0, -200); await page.keyboard.up("Control");
    const afterWheel = await percent(); check(`${width}: Ctrl + wheel zooms in`, Number.parseInt(afterWheel) > 100, afterWheel);
    await button("ملاءمة الشاشة").click();
    await page.mouse.wheel(0, -200); check(`${width}: a plain wheel does not zoom`, (await percent()) === "100%", await percent());
    // the plain wheel scrolled the page, so the map is found again before the double click
    await map.scrollIntoViewIfNeeded(); const again = await map.boundingBox();
    await page.mouse.dblclick(again.x + again.width / 2, again.y + again.height / 2); check(`${width}: double click zooms in`, (await percent()) === "150%", await percent());
  }
  // the view is kept for this person and project: reload and find the same zoom
  await toolbar.getByRole("slider").fill("300");
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('input[type="file"][accept*=".dxf"]').first().setInputFiles("docs/demo/master-plan-demo.dxf");
  await toolbar.waitFor({ timeout: 30000 });
  check(`${width}: the zoom is kept after a reload`, (await percent()) === "300%", await percent());
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${width}: no horizontal scroll`, overflow <= 0, `${overflow}px`);
  await context.close();
}
await browser.close();
const failed = checks.filter(item => !item.ok);
console.log(JSON.stringify({ checks: checks.length, failed: failed.length }));
process.exit(failed.length ? 1 : 0);
