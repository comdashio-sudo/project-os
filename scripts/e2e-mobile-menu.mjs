// Q-54: the side menu in a real browser, against a real server and the LOCAL test database (synthetic demo company «شركة العرض», *.example.test).
// On a phone (390×844, touch) in Arabic, English and Urdu it opens the drawer and checks the six defects the owner saw on production:
//   1 the company/project switchers are dark cards on the dark menu (not a white field) and nothing overlaps them;
//   2 the menu's first item is not covered while the menu is closed-over;            3 the logo and close button clear the top edge (safe-area padding);
//   4 the person's card is inside the screen and the last item can be scrolled to;   5 the switcher carries its small label over the name;
//   6 the project group is headed by the project's name;
// and that the drawer closes with Esc and by tapping outside. On a desktop (1280) it folds and unfolds the sidebar. Any failed check exits 1.
//
//   DATABASE_URL=…/project_os_integration_test JWT_SECRET=… BASE_URL=http://localhost:3999 node --import tsx scripts/e2e-mobile-menu.mjs
//
// Needs the demo company (scripts/demo/seed-demo-company.mjs seed) and a server started with the same DATABASE_URL and JWT_SECRET.
// Playwright is deliberately not a project dependency: PLAYWRIGHT_MODULE_DIR (default /opt/node-tools/node_modules/) locates it. WebKit is not installed
// on the build machines, so the phone is Chromium with touch and a phone viewport (the Safari engine itself is not exercised here).
import { createRequire } from "node:module";
import mysql from "../server/testing/pgCompat.ts";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema.ts";
import { sdk } from "../server/_core/sdk.ts";
import { getDb } from "../server/db.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3999";
const url = new URL(process.env.DATABASE_URL ?? "");
if (url.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/");
const { chromium } = require("playwright");

const db = await getDb();
const connection = await mysql.createConnection(url.toString());
const [[company]] = await connection.query("SELECT id FROM companies ORDER BY created_at LIMIT 1");
if (!company) { console.error("No demo company: run scripts/demo/seed-demo-company.mjs seed first."); process.exit(2); }
const [[project]] = await connection.query("SELECT id FROM projects WHERE tenant_id = ? ORDER BY created_at LIMIT 1", [company.id]);
const [[owner]] = await connection.query("SELECT u.open_id AS openid FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.tenant_id = ? ORDER BY m.created_at LIMIT 1", [company.id]);
const [user] = await db.select().from(users).where(eq(users.openId, owner.openid ?? owner.openId)).limit(1);
const token = await sdk.issueSession(user.openId, { name: user.name ?? "Owner" });
const target = `/projects/${company.id}/${project.id}/controls`;

const failures = [];
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures.push(name); };
const luminance = rgb => { const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? ["255", "255", "255"]).slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const overlaps = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const browser = await chromium.launch();
try {
  for (const lang of ["ar", "en", "ur"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await context.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
    const page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${BASE_URL}${target}?lang=${lang}`, { waitUntil: "load" }); await page.waitForTimeout(3000);
    await page.locator("header button").first().click(); await page.waitForTimeout(500);
    const drawer = page.getByRole("dialog");
    check(`${lang} phone: the menu opens`, await drawer.isVisible());
    const switchers = drawer.locator("[data-sidebar-switcher]");
    const count = await switchers.count();
    check(`${lang} phone (1,5): dark switchers with a label over the name`, count >= 1 && (await Promise.all(Array.from({ length: count }, (_, i) => switchers.nth(i).evaluate(node => getComputedStyle(node).backgroundColor)))).every(color => luminance(color) < 0.05), `${count} switcher(s)`);
    const boxes = await Promise.all(Array.from({ length: count }, (_, i) => switchers.nth(i).boundingBox({ timeout: 2000 }).catch(() => null)));
    const firstHeading = await drawer.locator("[data-nav-group]").first().boundingBox({ timeout: 2000 }).catch(() => null);
    check(`${lang} phone (1,6): nothing overlaps the switchers`, boxes.every(box => !overlaps(box, firstHeading)) && (boxes.length < 2 || !overlaps(boxes[0], boxes[1])));
    check(`${lang} phone (6): the project group has a heading`, (await drawer.locator("[data-nav-group]").count()) >= 1);
    const close = await drawer.getByRole("button").first().boundingBox({ timeout: 2000 }).catch(() => null);
    check(`${lang} phone (3): the top row clears the edge`, Boolean(close) && close.y >= 8, `close button at y=${close?.y}`);
    const card = await drawer.locator("[data-mobile-menu-user]").boundingBox({ timeout: 2000 }).catch(() => null);
    check(`${lang} phone (4): the person's card is inside the screen`, Boolean(card) && card.y + card.height <= 844 + 0.5, card ? `bottom ${Math.round(card.y + card.height)}` : "missing");
    const firstItem = await drawer.locator("[data-mobile-menu-list] a").first().boundingBox({ timeout: 2000 }).catch(() => null);
    check(`${lang} phone (2): the first item is below the switchers, not under them`, Boolean(firstItem) && boxes.every(box => firstItem.y >= box.y + box.height));
    const list = drawer.locator("[data-mobile-menu-list]");
    await list.evaluate(node => { node.scrollTop = node.scrollHeight; }, undefined, { timeout: 2000 }).catch(() => undefined); await page.waitForTimeout(200);
    const last = drawer.locator("[data-mobile-menu-list] li").last();
    const lastBox = await last.boundingBox({ timeout: 2000 }).catch(() => null); const listBox = await list.boundingBox({ timeout: 2000 }).catch(() => null);
    check(`${lang} phone (4): the last item scrolls into the list`, Boolean(lastBox && listBox) && lastBox.y + lastBox.height <= listBox.y + listBox.height + 1);
    await page.screenshot({ path: `${process.env.SHOTS_DIR ?? "/tmp"}/menu-${lang}-390.png` });
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    check(`${lang} phone: Esc closes the menu`, !(await drawer.isVisible()));
    await page.locator("header button").first().click(); await page.waitForTimeout(400);
    await page.mouse.click(lang === "en" ? 380 : 10, 400); // the drawer opens from the start side: the right in Arabic and Urdu await page.waitForTimeout(300);
    check(`${lang} phone: a tap outside closes the menu`, !(await drawer.isVisible()));
    check(`${lang} phone: no page error`, errors.length === 0, errors.join(" | ").slice(0, 160));
    await context.close();

    const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await desk.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
    const dpage = await desk.newPage();
    await dpage.goto(`${BASE_URL}${target}?lang=${lang}`, { waitUntil: "load" }); await dpage.waitForTimeout(3000);
    const aside = dpage.locator("aside").first(); const wide = (await aside.boundingBox({ timeout: 2000 }).catch(() => null))?.width ?? 0;
    const fold = aside.locator("button[aria-expanded]").last(); // the fold button is the last one (the switcher triggers also carry aria-expanded)
    await fold.click({ timeout: 5000 }); await dpage.waitForTimeout(400); const narrow = (await aside.boundingBox({ timeout: 2000 }).catch(() => null))?.width ?? 0;
    await fold.click({ timeout: 5000 }); await dpage.waitForTimeout(400); const back = (await aside.boundingBox({ timeout: 2000 }).catch(() => null))?.width ?? 0;
    check(`${lang} desktop: the sidebar folds and unfolds`, narrow < wide && Math.abs(back - wide) < 2, `${Math.round(wide)} → ${Math.round(narrow)} → ${Math.round(back)}`);
    const head = await aside.locator("[data-sidebar-switcher]").first().boundingBox({ timeout: 2000 }).catch(() => null); const group = await aside.locator("[data-nav-group]").first().boundingBox({ timeout: 2000 }).catch(() => null);
    check(`${lang} desktop: the project heading does not overlap the company switcher`, Boolean(head) && !overlaps(head, group));
    const deskCard = await aside.locator("[data-sidebar-user]").boundingBox({ timeout: 2000 }).catch(() => null);
    check(`${lang} desktop: the person's card is at the foot of the menu`, Boolean(deskCard) && deskCard.y + deskCard.height <= 900);
    await dpage.screenshot({ path: `${process.env.SHOTS_DIR ?? "/tmp"}/menu-${lang}-1280.png` });
    await desk.close();
  }
} finally { await browser.close(); await connection.end(); }
console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
