import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { eq } from "drizzle-orm";
import { users } from "/home/user/project-os/drizzle/schema.ts";
import { sdk } from "/home/user/project-os/server/_core/sdk.ts";
import { getDb } from "/home/user/project-os/server/db.ts";
const [T, P, OUT] = process.argv.slice(2);
const db = await getDb();
const [user] = await db!.select().from(users).where(eq(users.email, "owner@example.test"));
const token = await sdk.issueSession(user.openId, { name: user.name ?? "Owner" });
const browser = await chromium.launch();
const BASE = "http://localhost:3999";
for (const pg of ["controls", "stalled"]) for (const lang of ["ar", "en", "ur"]) for (const w of [390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, ...(w === 390 ? { hasTouch: true, isMobile: true } : {}) });
  await ctx.addCookies([{ name: "app_session_id", value: token, url: BASE }]);
  const page = await ctx.newPage(); const errs: string[] = []; page.on("pageerror", e => errs.push(e.message.slice(0, 100)));
  await page.goto(`${BASE}/projects/${T}/${P}/${pg}?lang=${lang}`, { waitUntil: "load" }); await page.waitForTimeout(4000);
  const hero = await page.locator('[data-testid="project-hero"]').count();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.screenshot({ path: `${OUT}/${pg}-${lang}-${w}.png` });
  console.log(pg, lang, w, "hero", hero, "hscroll", overflow, "errors", errs.length, await page.locator('[data-testid="project-hero-actual"]').textContent().catch(() => null));
  await ctx.close();
}
await browser.close(); process.exit(0);
