// Colour-contrast audit (G-177, G-178, G-179 — D-29). For ten screens, in Arabic, at 1280px and 390px, in the light theme and the dark one
// (`html.dark`, forced here: the product ships the light theme only, so dark is measured so it is ready, not because a person sees it today),
// it reads the computed colours in the page and checks:
//   TEXT     — every visible text at least 4.5:1 against what is behind it, 3:1 when large (24px, or 18.66px bold). WCAG 1.4.3.
//   NONTEXT  — 3:1 for the parts that carry meaning without words (WCAG 1.4.11): the border of an input, select or textarea; an icon that is a
//              button's only content; a small round status dot. Against the background behind them.
// Disabled controls are exempt (as WCAG says). A text on an image or a gradient cannot be measured from colours and is counted as UNKNOWN,
// not passed. What this does NOT prove: contrast of focus rings (scripts/check-keyboard.mjs checks they exist), of charts' inner marks,
// or of anything drawn in a canvas. A clean run is "no contrast defect this script can detect".
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET, BASE_URL)
//   NODE_ENV=production node dist/index.js &              # after pnpm build, on the test database with a company that has a project
//   node --import tsx scripts/check-contrast.mjs          [THEME=light|dark|both] [ONLY=<part of a screen name>] [JSON=1]
//   → exit 1 on any TEXT or NONTEXT finding. FIXTURE_FILE=<html> measures that one file instead (the negative control).
import { createRequire } from "node:module";
import mysql from "../server/testing/pgCompat.ts";
import { sdk } from "../server/_core/sdk.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/")("playwright");

const connection = await mysql.createConnection(dbUrl.toString());
const [[project]] = await connection.query("SELECT p.id, p.tenantId FROM projects p JOIN companies c ON c.id = p.tenantId WHERE c.slug NOT LIKE 'perf-volume-%' ORDER BY c.createdAt DESC, p.createdAt LIMIT 1");
const [[owner]] = await connection.query("SELECT u.openId, u.name FROM users u JOIN memberships m ON m.userId = u.id JOIN membership_roles mr ON mr.membershipId = m.id JOIN roles r ON r.id = mr.roleId WHERE m.tenantId = ? AND r.code = 'TENANT_OWNER' LIMIT 1", [project.tenantId]);
await connection.end();
const t = project.tenantId, p = project.id;
// The ten screens (#190): the ones a person spends the day in, across the levels.
const SCREENS = [
  ["الدخول", "/login", true], ["سجل المشاريع", `/projects/${t}`], ["ضوابط المشروع", `/projects/${t}/${p}/controls`], ["ضبط المشروع PMC", `/projects/${t}/${p}/pmc`],
  ["السلسلة التجارية", `/projects/${t}/${p}/commercial`], ["الربحية", `/projects/${t}/${p}/profitability`], ["إدخال الجوال", `/m/${t}/${p}`],
  ["القيادة التنفيذية", `/executive/${t}`], ["إدارة الشركة", `/tenants/${t}/administration`], ["الموظفون", `/people/${t}`],
];
const SCREEN_LIST = process.env.FIXTURE_FILE ? [["fixture", `file://${process.env.FIXTURE_FILE}`, true]] : SCREENS.filter(([name]) => !process.env.ONLY || name.includes(process.env.ONLY));
const THEMES = process.env.THEME === "light" ? ["light"] : process.env.THEME === "dark" ? ["dark"] : ["light", "dark"];
const VIEWS = [{ key: "desktop", viewport: { width: 1280, height: 900 }, options: {} }, { key: "mobile", viewport: { width: 390, height: 844 }, options: { isMobile: true, hasTouch: true } }];

// Runs inside the page. Colours are composited the way the browser paints them: an element's own alpha over the first opaque ancestor background.
function measure() {
  // Any CSS colour (rgb, oklch — Tailwind 4's — oklab, color(), named) to sRGB with alpha: the browser paints it on a 1x1 canvas and the pixel is read.
  const pad = document.createElement("canvas").getContext("2d", { willReadFrequently: true }); const cache = new Map();
  const parse = value => {
    if (!value || value === "none" || value === "transparent") return value === "transparent" ? [0, 0, 0, 0] : null;
    if (cache.has(value)) return cache.get(value);
    pad.clearRect(0, 0, 1, 1); pad.fillStyle = "rgba(0,0,0,0)"; pad.fillStyle = value; if (pad.fillStyle === "rgba(0, 0, 0, 0)" && !/^rgba?\(0,\s*0,\s*0,\s*0\)$/.test(value)) { cache.set(value, null); return null; }
    pad.fillRect(0, 0, 1, 1); const [r, g, b, a] = pad.getImageData(0, 0, 1, 1).data; const colour = [r, g, b, a / 255]; cache.set(value, colour); return colour;
  };
  const over = (top, bottom) => { const a = top[3]; return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1]; };
  const lum = ([r, g, b]) => { const c = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  // What is painted behind an element: its ancestors' backgrounds stacked from the page up. A background image or gradient makes it unknowable.
  const behind = el => {
    const layers = []; let unknown = false;
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== "none") { unknown = true; break; }
      const c = parse(s.backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let colour = [255, 255, 255, 1];
    if (!layers.length || layers[layers.length - 1][3] < 1) colour = parse(getComputedStyle(document.body).backgroundColor) ?? colour;
    for (const layer of layers.reverse()) colour = over(layer, colour);
    return { colour, unknown };
  };
  const shown = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(el); return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05 && !el.closest("[aria-hidden=true], [hidden]"); };
  const disabled = el => Boolean(el.closest("button:disabled, input:disabled, select:disabled, textarea:disabled, [aria-disabled=true], fieldset:disabled"));
  const describe = el => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${typeof el.className === "string" && el.className ? `.${el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}` : ""}`;
  const findings = []; let checked = 0, unknown = 0;
  const textOwners = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent.trim() && node.parentElement) textOwners.add(node.parentElement);
  for (const el of textOwners) {
    if (!shown(el) || disabled(el) || el.closest("svg, canvas, script, style, noscript")) continue;
    const s = getComputedStyle(el); const fg = parse(s.color); if (!fg) continue;
    const bg = behind(el); if (bg.unknown) { unknown++; continue; }
    const size = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const value = ratio(over([...fg.slice(0, 3), fg[3] * Number(s.opacity)], bg.colour), bg.colour);
    checked++;
    if (value < (large ? 3 : 4.5) - 0.005) findings.push({ kind: "TEXT", what: `${value.toFixed(2)}:1 < ${large ? 3 : 4.5}:1 — «${el.textContent.trim().slice(0, 30)}» (${describe(el)}, ${s.color} on rgb(${bg.colour.slice(0, 3).map(Math.round).join(", ")}))` });
  }
  // Non-text: a field's border, a button whose only content is an icon, a small round status dot.
  for (const el of document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea, [role=combobox]")) {
    if (!shown(el) || disabled(el)) continue;
    const s = getComputedStyle(el); if (parseFloat(s.borderBottomWidth) === 0) continue;
    const border = parse(s.borderBottomColor); const bg = behind(el.parentElement ?? el); if (!border || bg.unknown) continue;
    const value = ratio(over(border, bg.colour), bg.colour); checked++;
    if (value < 2.995) findings.push({ kind: "NONTEXT", what: `field border ${value.toFixed(2)}:1 < 3:1 — ${describe(el)} (${s.borderBottomColor})` });
  }
  for (const button of document.querySelectorAll("button, a, [role=button]")) {
    if (!shown(button) || disabled(button) || button.textContent.trim()) continue;
    const icon = button.querySelector("svg"); if (!icon || !shown(icon)) continue;
    // The paint is on the drawn shape (lucide puts stroke="currentColor" on the svg and the shapes inherit it); computed, currentColor is already a colour.
    const shape = icon.querySelector("path, circle, rect, line, polyline, polygon, ellipse") ?? icon; const s = getComputedStyle(shape);
    const paint = s.stroke && s.stroke !== "none" ? s.stroke : s.fill; const colour = parse(paint) ?? parse(getComputedStyle(icon).color);
    const bg = behind(button); if (!colour || bg.unknown) continue;
    const value = ratio(over(colour, bg.colour), bg.colour); checked++;
    if (value < 2.995) findings.push({ kind: "NONTEXT", what: `icon-only control ${value.toFixed(2)}:1 < 3:1 — ${describe(button)} «${button.getAttribute("aria-label") ?? ""}»` });
  }
  for (const dot of document.querySelectorAll("span, i, div")) {
    const r = dot.getBoundingClientRect(); if (r.width < 4 || r.width > 16 || Math.abs(r.width - r.height) > 1 || dot.textContent.trim() || dot.children.length) continue;
    const s = getComputedStyle(dot); if (!s.borderRadius.includes("%") && parseFloat(s.borderRadius) < r.width / 2 - 1) continue;
    const colour = parse(s.backgroundColor); if (!colour || colour[3] === 0 || !shown(dot)) continue;
    const bg = behind(dot.parentElement ?? dot); if (bg.unknown) continue;
    const value = ratio(over(colour, bg.colour), bg.colour); checked++;
    if (value < 2.995) findings.push({ kind: "NONTEXT", what: `status dot ${value.toFixed(2)}:1 < 3:1 — ${describe(dot)} (${s.backgroundColor})` });
  }
  return { findings, checked, unknown };
}

const token = await sdk.issueSession(owner.openId, { name: owner.name });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const all = []; const table = [];
for (const theme of THEMES) for (const view of VIEWS) for (const [name, path, anonymous] of SCREEN_LIST) {
  const context = await browser.newContext({ viewport: view.viewport, ...view.options, locale: "ar-SA" });
  if (!anonymous) await context.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
  await context.addInitScript(() => { try { localStorage.setItem("project-os-language", "ar"); } catch { /* storage off */ } });
  const page = await context.newPage();
  try {
    await page.goto(path.startsWith("file:") ? path : `${BASE_URL}${path}`, { waitUntil: "load", timeout: 45_000 });
    await page.waitForTimeout(2200);
    await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });
    if (theme === "dark") await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(200);
    const result = await page.evaluate(measure);
    table.push({ screen: name, theme, view: view.key, checked: result.checked, unknown: result.unknown, text: result.findings.filter(f => f.kind === "TEXT").length, nontext: result.findings.filter(f => f.kind === "NONTEXT").length });
    for (const finding of result.findings) all.push({ screen: `${name}/${theme}/${view.key}`, ...finding });
  } catch (error) { console.log(`could not measure ${name}/${theme}/${view.key}: ${String(error.message).split("\n")[0]}`); }
  await context.close();
}
await browser.close();
const summary = { measured: table.length, elements: table.reduce((n, row) => n + row.checked, 0), unknown: table.reduce((n, row) => n + row.unknown, 0), TEXT: all.filter(f => f.kind === "TEXT").length, NONTEXT: all.filter(f => f.kind === "NONTEXT").length };
if (process.env.JSON) console.log(JSON.stringify({ summary, table, findings: all }, null, 1));
else {
  console.log(JSON.stringify(summary));
  console.log("| Screen | Theme | Width | Checked | Unknown | Text < AA | Non-text < 3:1 |\n|---|---|---|---|---|---|---|");
  for (const row of table) console.log(`| ${row.screen} | ${row.theme} | ${row.view} | ${row.checked} | ${row.unknown} | ${row.text} | ${row.nontext} |`);
  const unique = new Map();
  for (const item of all) { const key = `[${item.kind}] ${item.what}`; const entry = unique.get(key) ?? new Set(); entry.add(item.screen); unique.set(key, entry); }
  for (const [what, screens] of [...unique].slice(0, 60)) console.log(`${what} — on ${screens.size} screen(s), e.g. ${[...screens][0]}`);
}
process.exit(summary.TEXT + summary.NONTEXT > 0 ? 1 : 0);
