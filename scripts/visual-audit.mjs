// Q-54 (2): the visual audit — every main screen, in a real browser, against a real server and the LOCAL test database (synthetic demo company «شركة العرض»,
// people under *.example.test). For each role × screen × width × language it measures, in the page itself:
//   horizontal scroll (the page wider than the screen); text that leaves its box (an element whose text is wider than the element, clipped or spilling);
//   a tap target under 44 px on a phone (a button, link, input or select smaller than 44 in either side); text under 4.5:1 against its background;
//   a colour outside the tokens is held by `pnpm check` (palette ceiling 0) and is not measured again here; console errors and page errors.
// It writes the defects ranked by weight to docs/qa/visual-audit-20261120.md (or AUDIT_OUT) and exits 1 when there is a critical one (a horizontal scroll or a page error).
//
//   DATABASE_URL=…/project_os_integration_test JWT_SECRET=… BASE_URL=http://localhost:3999 node --import tsx scripts/visual-audit.mjs
//   (AUDIT_ROLES=owner,site.engineer.1 AUDIT_WIDTHS=390,1280 AUDIT_LANGS=ar AUDIT_ROUTES=controls,stalled narrow a run)
//
// Playwright is not a project dependency: PLAYWRIGHT_MODULE_DIR (default /opt/node-tools/node_modules/) locates it. Nothing here prints a secret.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import mysql from "../server/testing/pgCompat.ts";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema.ts";
import { sdk } from "../server/_core/sdk.ts";
import { getDb } from "../server/db.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3999";
const OUT = process.env.AUDIT_OUT ?? "docs/qa/visual-audit-20261120.md";
const url = new URL(process.env.DATABASE_URL ?? "");
if (url.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const list = (value, fallback) => (value ? value.split(",").map(item => item.trim()).filter(Boolean) : fallback);

const ROLES = list(process.env.AUDIT_ROLES, ["owner", "project.manager", "site.engineer.1"]);
const WIDTHS = list(process.env.AUDIT_WIDTHS, ["390", "768", "1280", "1440"]).map(Number);
const LANGS = list(process.env.AUDIT_LANGS, ["ar", "en", "ur"]);
const ROUTES = [
  ["controls", "/projects/:t/:p/controls"], ["site", "/projects/:t/:p/site"], ["stalled", "/projects/:t/:p/stalled"], ["reports", "/projects/:t/:p/reports"],
  ["pmc", "/projects/:t/:p/pmc"], ["team", "/projects/:t/:p/team"], ["baseline", "/projects/:t/:p/baseline"], ["schedule", "/projects/:t/:p/schedule"],
  ["meetings", "/projects/:t/:p/meetings"], ["risks", "/projects/:t/:p/risks"], ["safety", "/projects/:t/:p/safety"], ["commercial", "/projects/:t/:p/commercial"],
  ["profitability", "/projects/:t/:p/profitability"], ["weekly", "/projects/:t/:p/weekly-report"], ["monthly", "/projects/:t/:p/monthly-report"],
  ["field", "/m/:t/:p"], ["daily", "/m/:t/:p/report"], ["progress", "/m/:t/:p/progress"], ["qc", "/m/:t/:p/qc"], ["issue", "/m/:t/:p/issue"],
  ["registry", "/projects/:t"], ["levels", "/levels/:t"], ["pmo", "/pmo/:t"], ["executive", "/executive/:t"], ["people", "/people/:t"], ["admin", "/tenants/:t/administration"],
  ["my-work", "/my-work/:t"], ["profile", "/profile"],
].filter(([slug]) => !process.env.AUDIT_ROUTES || list(process.env.AUDIT_ROUTES, []).includes(slug));

const db = await getDb();
const connection = await mysql.createConnection(url.toString());
const [[company]] = await connection.query("SELECT id FROM companies ORDER BY created_at LIMIT 1");
if (!company) { console.error("No demo company: run scripts/demo/seed-demo-company.mjs seed first."); process.exit(2); }
const [[project]] = await connection.query("SELECT id FROM projects WHERE tenant_id = ? ORDER BY created_at LIMIT 1", [company.id]);
const emailOf = role => (role === "owner" ? "owner@example.test" : `${role}@show.example.test`);

// Runs inside the page: every measurement is a pure function of the DOM and the computed styles.
const measure = phone => {
  // any CSS colour (rgb, oklab, color(), color-mix…) through one canvas pixel: the browser converts it, we read sRGB and alpha back
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1; const ctx = canvas.getContext("2d", { willReadFrequently: true }); const memo = new Map();
  const parse = color => { if (!color || color === "transparent") return { r: 0, g: 0, b: 0, a: 0 }; if (memo.has(color)) return memo.get(color); ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = "#000"; ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; const value = { r, g, b, a: a / 255 }; memo.set(color, value); return value; };
  const lum = ({ r, g, b }) => { const f = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const background = element => { for (let node = element; node; node = node.parentElement) { const c = parse(getComputedStyle(node).backgroundColor); if (c && c.a > 0.9) return c; if (getComputedStyle(node).backgroundImage !== "none") return null; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const label = element => { const text = (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50); const tag = element.tagName.toLowerCase(); const hint = element.getAttribute("data-testid") || element.id || [...element.classList].slice(0, 2).join("."); return `${tag}${hint ? `[${hint}]` : ""} «${text}»`; };
  const visible = element => { const r = element.getBoundingClientRect(); const s = getComputedStyle(element); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05 && !element.closest("[aria-hidden='true'], .sr-only"); };
  const found = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > window.innerWidth + 1) found.push({ kind: "hscroll", weight: 3, where: `page ${doc.scrollWidth}px > ${window.innerWidth}px` });
  for (const element of document.querySelectorAll("body *")) {
    if (!visible(element)) continue;
    const style = getComputedStyle(element);
    const ownText = [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim().length > 1);
    if (ownText) {
      if (element.scrollWidth > element.clientWidth + 2 && style.overflowX !== "auto" && style.overflowX !== "scroll" && style.textOverflow !== "ellipsis" && element.clientWidth > 0)
        found.push({ kind: "overflow", weight: 2, where: label(element) });
      const fg = parse(style.color); const bg = background(element);
      if (fg && bg && fg.a > 0.5) { const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); const ratio = (a + 0.05) / (b + 0.05); const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5) && !element.closest("button:disabled, [aria-disabled='true'], input:disabled")) found.push({ kind: "contrast", weight: 2, where: `${label(element)} ${ratio.toFixed(2)}:1` }); }
    }
    if (phone && element.matches("button, a[href], input:not([type=hidden]), select, [role=button], [role=tab], [role=combobox]") && !element.closest("[data-table-cell], td, th")) {
      // a checkbox or radio is tapped through its label: measure the label that holds it
      const r = (element.matches("input[type=checkbox], input[type=radio]") && element.closest("label") ? element.closest("label") : element).getBoundingClientRect();
      if ((r.width < 44 || r.height < 44) && !(element.matches("a") && style.display === "inline")) found.push({ kind: "tap", weight: 1, where: `${label(element)} ${Math.round(r.width)}×${Math.round(r.height)}` });
    }
  }
  return found;
};

const results = [];
const browser = await chromium.launch();
try {
  for (const role of ROLES) {
    const [user] = await db.select().from(users).where(eq(users.email, emailOf(role))).limit(1);
    if (!user) { console.log(`skip ${role}: no such demo person`); continue; }
    const token = await sdk.issueSession(user.openId, { name: user.name ?? role });
    for (const width of WIDTHS) {
      const phone = width < 768;
      const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, ...(phone ? { hasTouch: true, isMobile: true } : {}) });
      await context.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
      const page = await context.newPage();
      for (const lang of LANGS) for (const [slug, template] of ROUTES) {
        const errors = [];
        const onConsole = message => { if (message.type() === "error") errors.push(message.text().slice(0, 140)); };
        const onError = error => errors.push(`pageerror: ${String(error.message).slice(0, 140)}`);
        page.on("console", onConsole); page.on("pageerror", onError);
        const path = template.replace(":t", company.id).replace(":p", project.id);
        try { await page.goto(`${BASE_URL}${path}?lang=${lang}`, { waitUntil: "load", timeout: 30_000 }); await page.waitForTimeout(2500); }
        catch (error) { errors.push(`navigation: ${String(error.message).slice(0, 100)}`); }
        const found = await page.evaluate(measure, phone).catch(() => []);
        for (const message of errors) found.push({ kind: message.startsWith("pageerror") ? "pageerror" : "console", weight: message.startsWith("pageerror") ? 3 : 1, where: message });
        page.off("console", onConsole); page.off("pageerror", onError);
        for (const item of found) results.push({ role, width, lang, slug, ...item });
        process.stdout.write(`${role} ${width} ${lang} ${slug}: ${found.length}\n`);
      }
      await context.close();
    }
  }
} finally { await browser.close(); await connection.end(); }

// One defect seen on many pages is one line, weighted by how often it is seen.
const NAMES = { hscroll: "تمرير أفقي", pageerror: "خطأ صفحة", overflow: "نص يخرج من مكانه", contrast: "تباين أقل من الحد", tap: "هدف لمس أقل من 44px", console: "خطأ في Console" };
const grouped = new Map();
for (const item of results) { const key = `${item.kind}|${item.slug}|${item.where.replace(/\d+(\.\d+)?/g, "#")}`; const entry = grouped.get(key) ?? { ...item, seen: 0, widths: new Set(), langs: new Set(), roles: new Set() }; entry.seen += 1; entry.widths.add(item.width); entry.langs.add(item.lang); entry.roles.add(item.role); grouped.set(key, entry); }
const ranked = [...grouped.values()].sort((a, b) => b.weight * Math.log2(1 + b.seen) - a.weight * Math.log2(1 + a.seen));
const critical = ranked.filter(item => item.kind === "hscroll" || item.kind === "pageerror");
const counts = Object.fromEntries(Object.keys(NAMES).map(kind => [kind, ranked.filter(item => item.kind === kind).length]));
const lines = [
  "# التدقيق البصري — 2026-11-20 (Q-54)", "",
  `المصدر: \`scripts/visual-audit.mjs\` على قاعدة الاختبار المحلية وشركة العرض المختلقة. الأدوار: ${ROLES.join("، ")}. العروض: ${WIDTHS.join("، ")}. اللغات: ${LANGS.join("، ")}. المسارات: ${ROUTES.length}.`, "",
  `العيوب الحرجة (تمرير أفقي أو خطأ صفحة): **${critical.length}**.`, "",
  "| النوع | عدد العيوب المميّزة |", "|---|---|", ...Object.entries(NAMES).map(([kind, name]) => `| ${name} | ${counts[kind]} |`), "",
  "## القائمة مرتّبة بالأثر", "", "| # | النوع | الشاشة | العنصر/التفصيل | مرات الظهور | العروض | اللغات | الأدوار |", "|---|---|---|---|---|---|---|---|",
  ...ranked.slice(0, 400).map((item, index) => `| ${index + 1} | ${NAMES[item.kind]} | ${item.slug} | ${item.where.replace(/\|/g, "/")} | ${item.seen} | ${[...item.widths].join("،")} | ${[...item.langs].join("،")} | ${[...item.roles].length} |`),
  "", ranked.length > 400 ? `(${ranked.length - 400} عيبًا آخر أقل أثرًا لم تُدرج)` : "", "",
  "حدود: Chromium فقط (لا WebKit)؛ التباين يُحسب على خلفية مصمتة (يُتخطى ما فوق صورة أو تدرّج)؛ ألوان خارج الرموز يمنعها `pnpm check` لا هذا السكربت.",
];
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${lines.join("\n")}\n`);
console.log(`\n${ranked.length} distinct defects (${critical.length} critical) → ${OUT}`);
process.exit(critical.length ? 1 : 0);
