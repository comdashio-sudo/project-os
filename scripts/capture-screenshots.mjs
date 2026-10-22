// Screenshot gallery: runs against a LOCAL server and the LOCAL test database with
// synthetic data only (*.example.test, invented names), signs in with a session
// cookie minted from the app's own signing key, and photographs every main screen
// in Arabic at desktop width and at 390px. Writes docs/screenshots/gallery/*.jpg and
// docs/screenshots/index.html (a caption under each picture).
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET, PORT)
//   node scripts/migrate.mjs
//   SEED_CONFIRM=yes node --import tsx scripts/seed-demo-tenant.mjs     # empty database only
//
// NOTE: run scripts/run-integration-database-test.mjs BEFORE seeding the demo tenant, not after: integration.database.test.ts deletes the global permission rows
// (project.read, project.write, pmo.write, executive.read) and with them every tenant's grants of them, so a demo tenant seeded earlier answers 403 afterwards.
//   NODE_ENV=production node dist/index.js &                            # after pnpm build
//   node --import tsx scripts/capture-screenshots.mjs
//
// Playwright is deliberately not a project dependency (see measure-mobile-entry.mjs):
// PLAYWRIGHT_MODULE_DIR (default /opt/node-tools/node_modules/) and PLAYWRIGHT_CHROMIUM
// (default /opt/pw-browsers/chromium-1194/chrome-linux/chrome) locate it.
// Nothing here prints a secret. The seed is for a FRESH database (it refuses to run twice); to redo it, recreate project_os_integration_test and migrate.
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "../server/testing/pgCompat.ts";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema.ts";
import { sdk } from "../server/_core/sdk.ts";
import { getDb } from "../server/db.ts";
import { seedDemoData } from "./lib/demoData.mjs";
import { appRouter } from "../server/routers.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = process.env.SCREENSHOT_OUT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "screenshots"); // SCREENSHOT_OUT: write the pictures somewhere else (a check run)
const url = new URL(process.env.DATABASE_URL ?? "");
if (url.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/");
const { chromium } = require("playwright");

// ------------------------------------------------------------------ synthetic data
const email = process.env.SEED_DEMO_EMAIL ?? "demo.admin@example.test";
const openId = `email:${createHash("sha256").update(email).digest("hex").slice(0, 40)}`;
const db = await getDb();
const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
if (!user) { console.error("No demo user: run scripts/seed-demo-tenant.mjs on the empty database first."); process.exit(2); }
const connection = await mysql.createConnection(url.toString());
const [[company]] = await connection.query("SELECT id FROM companies ORDER BY createdAt LIMIT 1");
const [[project]] = await connection.query("SELECT id FROM projects WHERE tenantId = ? ORDER BY createdAt LIMIT 1", [company.id]);
const tenantId = company.id; const projectId = project.id;
const caller = appRouter.createCaller({ user, req: { protocol: "https", headers: {} }, res: {} });
const days = n => new Date(Date.now() - n * 86400000);
const input = { tenantId, projectId };

const seed = () => seedDemoData({ caller, connection, tenantId, projectId, user });

// ------------------------------------------------------------------ the gallery
const SCREENS = [
  { slug: "login", title: "تسجيل الدخول", note: "الدخول برمز يصل بالبريد، بلا كلمة مرور.", path: "/login", anonymous: true },
  { slug: "home", title: "الصفحة الرئيسية", note: "المدخل إلى المساحات التي يملك المستخدم صلاحيتها.", path: "/" },
  { slug: "registry", title: "سجل المشاريع", note: "مشاريع الشركة ورموزها وحالتها.", path: "/projects/:t" },
  { slug: "controls", title: "لوحة ضبط المشروع", note: "مركز القيادة: الصحة والتقدم وEVM وسجلات التكلفة.", path: "/projects/:t/:p/controls" },
  { slug: "contracts", title: "العقود والالتزامات", note: "عقد المورّد مربوط بسجل الموردين، وعقد العميل يبقى اسمًا.", path: "/projects/:t/:p/controls", open: "العقود والمستندات والمطالبات", heading: "العقود والالتزامات" },
  { slug: "purchase-orders", title: "سجل أوامر الشراء", note: "أمر الشراء يحمل مورّدًا من السجل ويُصدَر مقابل التزام.", path: "/projects/:t/:p/controls", open: "العقود والمستندات والمطالبات", heading: "سجل أوامر الشراء" },
  { slug: "goods-receipts", title: "استلام المواد (GRN): مخزن أو توريد مباشر", note: "الاستلام يرفع رصيد المستودع وتُحمَّل التكلفة على البند عند الصرف، أو تُحمَّل عند الاستلام في «توريد مباشر للموقع» — دون عدّ مزدوج.", path: "/projects/:t/:p/controls", open: "العقود والمستندات والمطالبات", heading: "استلام المواد (GRN)" },
  { slug: "warehouses", title: "المستودعات: الرصيد والقيمة بالمتوسط المرجّح", note: "الرصيد مشتق من الحركات، والقيمة بالمتوسط المرجّح، والكمية بلا سعر تُعرض بجانبها.", path: "/projects/:t/:p/controls", open: "سجل الموقع والجودة", card: "المستودعات والمخزون" },
  { slug: "workforce", title: "القوى العاملة والإسناد", note: "الحضور والساعات الفعلية ومؤشرات الفريق التشغيلية.", path: "/projects/:t/:p/controls", open: "سجل الموقع والجودة", heading: "القوى العاملة والإسناد" },
  { slug: "notifications", title: "الإشعارات وتفضيلات البريد", note: "ثلاثة اختيارات للبريد لكل شخص؛ لا يُرسل شيء حتى يُفعَّل مفتاح التشغيل.", path: "/projects/:t/:p/controls", open: "المتابعة والذكاء والإشعارات", heading: "إشعارات البريد" },
  { slug: "commercial", title: "السلسلة التجارية", note: "من جدول الكميات إلى عقد المقاول من الباطن (مع اختيار المورّد من السجل) والمستخلص والفاتورة.", path: "/projects/:t/:p/commercial" },
  { slug: "profitability", title: "ربحية المشروع", note: "الإيراد والتكلفة والالتزامات والتعرض (قيمة ما على الرفوف تدخل التعرض مرة واحدة).", path: "/projects/:t/:p/profitability" },
  { slug: "my-performance", title: "أدائي", note: "المؤشرات الفردية المشتقة من الأنشطة المسندة.", path: "/projects/:t/:p/my-performance" },
  { slug: "pmc", title: "متابعة التنفيذ (PMC)", note: "تحديثات الوحدات والاعتمادات والفحوص والاستيراد.", path: "/projects/:t/:p/pmc" },
  { slug: "field-entry", title: "إدخال الميدان من الجوال", note: "التقدم وصرف المواد وساعات الفريق واستلام المواد بنقرات قليلة.", path: "/m/:t/:p" },
  { slug: "payroll", title: "الرواتب: التحميل وتوزيع الساعات ونهاية الخدمة", note: "الراتب المحمّل بتأمين صاحب العمل حسب الجنسية، ويُوزَّع بنسب الساعات المعتمدة؛ «تقدير للتكلفة، وليس احتسابًا قانونيًا».", path: "/payroll/:t", click: "عرض التفاصيل والقصائم المحمية" },
  { slug: "people", title: "الموظفون", note: "سجل الموظفين وأرقامهم وحالتهم.", path: "/people/:t" },
  { slug: "executive", title: "لوحة التنفيذي", note: "نظرة الشركة على محفظتها.", path: "/executive/:t" },
  { slug: "pmo", title: "لوحة PMO", note: "استثناءات اليوم وملخص المحفظة.", path: "/pmo/:t" },
  { slug: "licensing", title: "التراخيص", note: "الحزم والاستحقاقات لكل شركة.", path: "/licensing/:t" },
  { slug: "billing", title: "الفوترة", note: "اشتراك الشركة وفواتيرها.", path: "/billing/:t" },
  { slug: "support", title: "مركز الدعم", note: "التذاكر والتصعيد.", path: "/support/:t" },
  { slug: "administration", title: "إدارة الشركة", note: "الأعضاء والأدوار والإعدادات (نسب التأمينات ونهاية الخدمة لكل شركة).", path: "/tenants/:t/administration" },
  { slug: "profile", title: "الملف الشخصي", note: "بيانات المستخدم ولغة الواجهة.", path: "/profile" },
  { slug: "evm", title: "حاسبة EVM", note: "حساب مؤشرات القيمة المكتسبة.", path: "/evm" },
  // work order 5 (items 7-12): the screens it added
  { slug: "pmc-tab", title: "ضبط المشروع PMC كتبويب داخل الضوابط", note: "يفتحه الرابط #pmc؛ أزرار Excel وPDF والطباعة على كل شاشة لها جسم.", path: "/projects/:t/:p/controls#pmc" },
  { slug: "design", title: "التنسيق الفني والمعماري", note: "سجل المخططات والمراجعات والإحالات وملاحظات التصميم وتقديمات الاستشاري A/B/C/D.", path: "/projects/:t/:p/controls", open: "التنسيق الفني والمعماري", heading: "سجل المخططات" },
  { slug: "tenders", title: "المناقصات قبل الترسية", note: "الحزم والمدعوون والعروض والمعايرة والترسية التي تنشئ عقدًا والتزامًا.", path: "/projects/:t/:p/controls", open: "المناقصات قبل الترسية", heading: "حزم المناقصة" },
  { slug: "master-plan-tools", title: "الخطة الرئيسية: التدوير والمعايرة والعروض المشتركة", note: "تدوير خلفية الخطة ومعايرتها بالمتر، ومشاركة العروض، والتنبيهات.", path: "/projects/:t/:p/controls", open: "التخطيط وملفات البيانات", heading: "تدوير الخطة ومعايرتها" },
  { slug: "setup-project", title: "معالج الإعداد: أول مشروع", note: "الخطوة الثانية من أربع: الشركة، أول مشروع، الاستيراد، دعوة الفريق.", path: "/setup/:t#project" },
  { slug: "setup-import", title: "معالج الإعداد: الاستيراد", note: "ارفع جدولك (XER أو Excel) أو قوالب البيانات؛ يمكن تخطي الخطوة.", path: "/setup/:t#import" },
  { slug: "setup-invite", title: "معالج الإعداد: دعوة الفريق بأدوار جاهزة", note: "كل دور جاهز بصلاحيات محدودة وفصل مهام؛ الدعوة تُقيَّد بالمشروع الأول افتراضيًا.", path: "/setup/:t#invite" },
  { slug: "user-guide", title: "دليل الاستخدام داخل المنصة", note: "خمسة أقسام بخطوات ولقطات من الشاشات الفعلية.", path: "/projects/:t/:p/guide#cost-control" },
];
const VIEWS = [{ key: "desktop", label: "سطح المكتب", viewport: { width: 1440, height: 900 }, options: {} }, { key: "mobile", label: "الجوال 390px", viewport: { width: 390, height: 844 }, options: { hasTouch: true, isMobile: true } }];

await seed();
const ONLY = process.env.ONLY?.split(",");
if (!ONLY) rmSync(join(OUT, "gallery"), { recursive: true, force: true });
mkdirSync(join(OUT, "gallery"), { recursive: true });
const token = await sdk.issueSession(openId, { name: user.name ?? "Demo Admin" });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const taken = [];
for (const view of VIEWS) {
  for (const screen of SCREENS) {
    if (ONLY && !ONLY.includes(screen.slug)) continue;
    const context = await browser.newContext({ viewport: view.viewport, ...view.options, locale: "ar-SA" });
    if (!screen.anonymous) await context.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(String(error.message).slice(0, 120)));
    const target = screen.path.replace(":t", tenantId).replace(":p", projectId);
    const file = `gallery/${String(SCREENS.indexOf(screen) + 1).padStart(2, "0")}-${screen.slug}-${view.key}.jpg`;
    try {
      const [targetPath, targetHash] = target.split("#"); // the query goes BEFORE the hash, or "#pmc?lang=ar" opens nothing
      await page.goto(`${BASE_URL}${targetPath}${targetPath.includes("?") ? "&" : "?"}lang=ar${targetHash ? `#${targetHash}` : ""}`, { waitUntil: "load", timeout: 45_000 });
      await page.waitForTimeout(2500);
      let how = "full page";
      if (screen.click) { await page.getByRole("button", { name: screen.click }).first().click(); await page.waitForTimeout(2500); }
      if (screen.open) { await page.locator("summary").filter({ hasText: screen.open }).first().click(); await page.waitForTimeout(2500); }
      if (screen.card) {
        const card = page.locator('[data-slot="card"]').filter({ has: page.locator('[data-slot="card-title"]', { hasText: screen.card }) }).last();
        if (await card.count()) { await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: join(OUT, file), type: "jpeg", quality: 72 }); how = "card"; }
        else { await page.screenshot({ path: join(OUT, file), type: "jpeg", quality: 72, fullPage: true }); how = "full page (card not found)"; }
      } else if (screen.heading) {
        const heading = page.locator("h2, h3").filter({ hasText: screen.heading }).first();
        const section = heading.locator("xpath=ancestor::*[self::section or self::article][1]");
        if (await section.count()) { await section.scrollIntoViewIfNeeded(); await section.screenshot({ path: join(OUT, file), type: "jpeg", quality: 72 }); how = "section"; }
        else { await page.screenshot({ path: join(OUT, file), type: "jpeg", quality: 72, fullPage: true }); how = "full page (heading not found)"; }
      } else await page.screenshot({ path: join(OUT, file), type: "jpeg", quality: 72, fullPage: true });
      taken.push({ screen, view, file, how, errors, ok: true });
    } catch (error) { taken.push({ screen, view, file, how: String(error.message).slice(0, 100), errors, ok: false }); }
    await context.close();
  }
}
await browser.close();
await connection.end();

if (ONLY) { console.log(JSON.stringify(taken.map(item => `${item.file}: ${item.how} ${item.errors.join("; ")}`), null, 1)); process.exit(0); }
const esc = text => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const figures = SCREENS.map((screen, index) => {
  const pair = VIEWS.map(view => taken.find(item => item.screen === screen && item.view === view));
  const cells = pair.map(item => item?.ok ? `<figure class="${item.view.key}"><a href="${item.file}"><img loading="lazy" src="${item.file}" alt="${esc(screen.title)} — ${item.view.label}"></a><figcaption>${esc(screen.title)} — ${item.view.label}</figcaption></figure>` : `<figure class="missing"><figcaption>${esc(screen.title)} — ${item?.view.label}: لم تُلتقط (${esc(item?.how)})</figcaption></figure>`).join("\n");
  return `<section><h2>${index + 1}. ${esc(screen.title)}</h2><p>${esc(screen.note)}</p><div class="pair">${cells}</div></section>`;
}).join("\n");
writeFileSync(join(OUT, "index.html"), `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>معرض لقطات PROJECT OS</title>
<style>body{font-family:system-ui,"Segoe UI",Tahoma,sans-serif;margin:0;background:#f4f6f8;color:#14232b}header{padding:24px 20px;background:#123a4a;color:#fff}header p{margin:6px 0 0;opacity:.85;max-width:70ch}main{max-width:1500px;margin:0 auto;padding:16px}section{background:#fff;border-radius:14px;padding:18px;margin:18px 0;box-shadow:0 1px 3px #0002}h2{margin:0 0 4px;font-size:20px}section>p{margin:0 0 14px;color:#4a5c66}.pair{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,1fr);gap:16px;align-items:start}figure{margin:0}figure img{max-width:100%;height:auto;border:1px solid #d6dde2;border-radius:8px;display:block}figcaption{font-size:13px;color:#4a5c66;margin-top:6px}.missing{padding:12px;background:#fff4f4;border:1px solid #e8b4b4;border-radius:8px}@media(max-width:900px){.pair{grid-template-columns:1fr}}</style></head><body>
<header><h1>معرض لقطات PROJECT OS</h1><p>كل الشاشات الرئيسية بالعربية، على سطح المكتب (1440px) وعلى الجوال (390px)، من منصة تعمل محليًا على قاعدة الاختبار ببيانات تركيبية بحتة (*.example.test وأسماء مختلقة). لا بيانات عميل ولا جهة عمل المالك. أُنتج بـ <code>scripts/capture-screenshots.mjs</code>.</p></header>
<main>
${figures}
</main></body></html>
`);
const failed = taken.filter(item => !item.ok || item.errors.length || item.how.includes("not found"));
console.log(JSON.stringify({ captured: taken.filter(item => item.ok).length, of: taken.length, notes: failed.map(item => `${item.file}: ${item.ok ? "" : "FAILED "}${item.how} ${item.errors.join("; ")}`) }, null, 2));
process.exit(0);
