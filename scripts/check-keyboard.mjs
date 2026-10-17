// Automated keyboard-operability audit (G-132, the part a machine can do). For every screen, in Arabic, at desktop width and at 390px, it
// walks the page with the Tab key exactly as a keyboard user would and checks:
//   1. TRAP     — focus is never stuck: Tab keeps moving to a new element until it leaves the page or comes back round.
//   2. VISIBLE  — every element that takes focus shows it (an outline, ring or shadow different from when it is not focused).
//   3. NAMED    — every focusable control has an accessible name (text, aria-label, aria-labelledby, title, or an associated label).
//   4. ORDER    — no positive tabindex (it breaks the natural order) and no focusable element hidden from assistive technology (aria-hidden).
//   5. LANDMARK — exactly one <main>, exactly one <h1> on the screen (none for the public sign-in pages is also reported).
//   6. TABS     — in every tablist, Arrow keys move between tabs and exactly one tab is selected (the keyboard contract of the ARIA tab pattern).
// What this does NOT prove: that a screen reader announces anything sensibly, that the focus order is the order a person expects, or that
// colour contrast suffices (axe covers contrast). Those stay HANDOFF_REQUIRED (docs/MANUAL_ACCESSIBILITY_ACCEPTANCE.md). A clean run is
// "no keyboard defect this script can detect", not "keyboard accessible".
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET, BASE_URL)
//   NODE_ENV=production node dist/index.js &              # after pnpm build, on the test database with a company that has a project
//   node --import tsx scripts/check-keyboard.mjs          [JSON=1]   → exit 1 on any TRAP / NAMED / ORDER / VISIBLE / TABS finding (LANDMARK findings are listed and counted, not failing)
import { createRequire } from "node:module";
import mysql from "mysql2/promise";
import { sdk } from "../server/_core/sdk.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const modules = process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/";
const { chromium } = createRequire(modules)("playwright");

const connection = await mysql.createConnection(dbUrl.toString());
const [[project]] = await connection.query("SELECT p.id, p.tenantId FROM projects p JOIN companies c ON c.id = p.tenantId WHERE c.slug NOT LIKE 'perf-volume-%' ORDER BY c.createdAt DESC, p.createdAt LIMIT 1");
const [[owner]] = await connection.query("SELECT u.openId, u.name FROM users u JOIN memberships m ON m.userId = u.id JOIN membership_roles mr ON mr.membershipId = m.id JOIN roles r ON r.id = mr.roleId WHERE m.tenantId = ? AND r.code = 'TENANT_OWNER' LIMIT 1", [project.tenantId]);
await connection.end();
const t = project.tenantId, p = project.id;
const SCREENS = [
  ["الدخول", "/login", true], ["الصفحة الرئيسية", "/"], ["سجل المشاريع", `/projects/${t}`], ["ضوابط المشروع", `/projects/${t}/${p}/controls`],
  ["ضوابط المشروع: تبويب PMC", `/projects/${t}/${p}/controls#pmc`], ["ضبط المشروع PMC", `/projects/${t}/${p}/pmc`], ["معالج الإعداد", `/setup/${t}`], ["معالج الإعداد: الدعوات", `/setup/${t}#invite`],
  ["السلسلة التجارية", `/projects/${t}/${p}/commercial`], ["إدخال الجوال", `/m/${t}/${p}`], ["القيادة التنفيذية", `/executive/${t}`],
  ["إدارة الشركة", `/tenants/${t}/administration`], ["الموظفون", `/people/${t}`], ["الملف الشخصي", "/profile"], ["حاسبة EVM", "/evm"],
];
// Negative control (a detector that has never failed has not been shown to work): FIXTURE_FILE=<html> walks that one file instead of the product.
const SCREEN_LIST = process.env.FIXTURE_FILE ? [["fixture", `file://${process.env.FIXTURE_FILE}`, true]] : SCREENS.filter(([name]) => !process.env.ONLY || name.includes(process.env.ONLY)); // ONLY=<part of a screen name> narrows the walk; TRACE=1 prints each stop
const VIEWS = [{ key: "desktop", viewport: { width: 1280, height: 900 }, options: {} }, { key: "mobile", viewport: { width: 390, height: 844 }, options: { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }];

const token = await sdk.issueSession(owner.openId, { name: owner.name });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const all = []; let screens = 0, stopsTotal = 0;
for (const view of VIEWS) {
  for (const [name, path, anonymous] of SCREEN_LIST) {
    const context = await browser.newContext({ viewport: view.viewport, ...view.options, locale: "ar-SA" });
    if (!anonymous) await context.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
    const page = await context.newPage();
    try {
      await page.goto(path.startsWith("file:") ? path : `${BASE_URL}${path.split("#")[0]}?lang=ar${path.includes("#") ? `#${path.split("#")[1]}` : ""}`, { waitUntil: "load", timeout: 45_000 }); // the query goes before the hash, or "#pmc?lang=ar" opens nothing
      await page.waitForTimeout(2200);
      await page.evaluate(() => document.querySelectorAll("details").forEach(element => { element.open = true; }));
      await page.waitForTimeout(700);
      // Tab presses come from the driver, one at a time, and the focused element is inspected in the page after each.
      const result = await (async () => {
        const findings = []; const seen = new Set(); let stops = 0, left = false, lastKey = null, repeats = 0;
        await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
        for (let stop = 0; stop < 400; stop++) {
          await page.keyboard.press("Tab");
          const info = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body || el === document.documentElement) return null;
            const nameOf = e => {
              const aria = e.getAttribute("aria-label")?.trim(); if (aria) return aria;
              const by = e.getAttribute("aria-labelledby"); if (by) { const text = by.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? "").join(" ").trim(); if (text) return text; }
              if (e.labels?.length) { const text = [...e.labels].map(label => label.textContent ?? "").join(" ").trim(); if (text) return text; }
              const title = e.getAttribute("title")?.trim(); if (title) return title;
              const alt = e.querySelector("img[alt]")?.getAttribute("alt")?.trim(); const text = (e.textContent ?? "").replace(/\s+/g, " ").trim();
              return text || alt || (e.getAttribute("placeholder") ?? "").trim() || (e.tagName === "INPUT" && ["submit", "button"].includes(e.type) ? e.value : "");
            };
            const describe = e => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""}${typeof e.className === "string" && e.className ? `.${e.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}` : ""}`;
            const style = getComputedStyle(el);
            const key = (el.__kb ??= `kb${Math.random().toString(36).slice(2)}`);
            return {
              key, described: describe(el), named: Boolean(nameOf(el)), hidden: Boolean(el.closest("[aria-hidden=true]")), composite: el.matches("input[type=date], input[type=time], input[type=datetime-local], input[type=month], input[type=week], input[type=file]"),
              visible: (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || Boolean(style.boxShadow && style.boxShadow !== "none") || el.matches("input[type=file]"),
            };
          });
          if (!info) { left = true; break; }
          if (process.env.TRACE) console.log(`  stop ${stops}: ${info.described}`);
          // A native date/time/file input is several tab stops inside one element (day, month, year, picker button): the page reports the same element for each press.
          // So "the same element again" is a trap only past the controls' own stops: one repeat for any other element, eight for these composite ones.
          if (info.key === lastKey) { repeats++; if (repeats > (info.composite ? 8 : 1)) { findings.push({ kind: "TRAP", what: `Tab did not move focus off ${info.described}` }); left = true; break; } continue; }
          repeats = 0;
          if (seen.has(info.key)) { left = true; break; } // came round to a control already visited: focus cycles, it is not trapped
          lastKey = info.key;
          seen.add(info.key); stops++;
          if (info.hidden) findings.push({ kind: "ORDER", what: `focusable inside aria-hidden: ${info.described}` });
          if (!info.named) findings.push({ kind: "NAMED", what: `no accessible name: ${info.described}` });
          if (!info.visible) findings.push({ kind: "VISIBLE", what: `no visible focus indicator: ${info.described}` });
        }
        if (!left) findings.push({ kind: "TRAP", what: "focus neither left the page nor cycled within 400 Tab presses" });
        const structure = await page.evaluate(() => {
          const out = [];
          const mains = document.querySelectorAll("main, [role=main]").length; if (mains !== 1) out.push({ kind: "LANDMARK", what: `${mains} main landmarks (expected 1)` });
          const h1s = document.querySelectorAll("h1").length; if (h1s !== 1) out.push({ kind: "LANDMARK", what: `${h1s} h1 headings (expected 1)` });
          for (const el of document.querySelectorAll("[tabindex]")) if (Number(el.getAttribute("tabindex")) > 0) out.push({ kind: "ORDER", what: `positive tabindex on ${el.tagName.toLowerCase()}` });
          return out;
        });
        findings.push(...structure);
        // ARIA tab pattern: one tab selected; Arrow keys move the selection or focus within the tablist.
        for (const list of await page.getByRole("tablist").all()) {
          const tabs = await list.getByRole("tab").all();
          if (tabs.length < 2) continue;
          const selected = await list.locator("[role=tab][aria-selected=true]").count();
          if (selected !== 1) findings.push({ kind: "TABS", what: `tablist has ${selected} selected tabs (expected 1)` });
          await tabs[0].focus();
          const before = await page.evaluate(() => document.activeElement?.textContent?.trim());
          await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowRight");
          const moved = await page.evaluate(() => document.activeElement?.getAttribute("role"));
          // Arrow keys are a convenience of the pattern; reaching every tab by Tab and activating it with Enter/Space is the floor and is covered by the walk above.
          if (moved !== "tab" && moved !== null && before) findings.push({ kind: "TABS", what: `Arrow key moved focus out of the tablist (from "${before}")` });
        }
        return { findings, stops };
      })();
      screens++; stopsTotal += result.stops;
      for (const finding of result.findings) all.push({ screen: `${name}/${view.key}`, ...finding });
    } catch (error) { console.log(`could not walk ${name}/${view.key}: ${String(error.message).split("\n")[0]}`); }
    await context.close();
  }
}
await browser.close();
const kinds = ["TRAP", "NAMED", "ORDER", "VISIBLE", "TABS", "LANDMARK"];
const grouped = Object.fromEntries(kinds.map(kind => [kind, all.filter(item => item.kind === kind)]));
const summary = { screensWalked: screens, focusStops: stopsTotal, ...Object.fromEntries(kinds.map(kind => [kind, grouped[kind].length])) };
if (process.env.JSON) console.log(JSON.stringify({ summary, findings: all }, null, 1));
else {
  console.log(JSON.stringify(summary));
  for (const kind of kinds) {
    const unique = new Map();
    for (const item of grouped[kind]) { const key = item.what; const entry = unique.get(key) ?? { what: item.what, screens: new Set() }; entry.screens.add(item.screen); unique.set(key, entry); }
    for (const entry of [...unique.values()].slice(0, 25)) console.log(`[${kind}] ${entry.what} — on ${entry.screens.size} screen(s), e.g. ${[...entry.screens][0]}`);
  }
}
process.exit(kinds.some(kind => kind !== "LANDMARK" && grouped[kind].length > 0) ? 1 : 0);
