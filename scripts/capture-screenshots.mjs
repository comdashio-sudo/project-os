// Screenshot gallery: runs against a LOCAL server and the LOCAL test database with
// synthetic data only (*.example.test, invented names), signs in with a session
// cookie minted from the app's own signing key, and photographs every main screen
// in Arabic at desktop width and at 390px. Writes docs/screenshots/gallery/*.jpg and
// docs/screenshots/index.html (a caption under each picture).
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET, PORT)
//   node scripts/migrate.mjs
//   SEED_CONFIRM=yes node --import tsx scripts/seed-demo-tenant.mjs     # empty database only
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
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema.ts";
import { sdk } from "../server/_core/sdk.ts";
import { getDb, transitionEmployeeTimeEntryForTenant } from "../server/db.ts";
import { appRouter } from "../server/routers.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "screenshots");
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

async function seed() {
  const [[already]] = await connection.query("SELECT COUNT(*) AS n FROM cost_entries WHERE projectId = ?", [projectId]);
  if (Number(already.n) > 0) { console.log("seed: skipped (the demo project already has cost records)"); return; }
  const [wbsRows] = await connection.query("SELECT id, code FROM wbs_items WHERE projectId = ? ORDER BY code", [projectId]);
  const w = Object.fromEntries(wbsRows.map(row => [row.code, row.id]));
  const [first, second] = [wbsRows[0].id, wbsRows[1]?.id ?? wbsRows[0].id];
  await connection.query("UPDATE projects SET contractValue = 1400000, currency = 'SAR', status = 'active' WHERE id = ?", [projectId]);
  for (const [id, amount, code] of [[first, 400000, "B1"], [second, 900000, "B2"]]) await caller.budgets.create({ ...input, wbsItemId: id, costCode: code, originalAmount: amount, currentAmount: amount });
  await caller.costs.createActual({ ...input, wbsItemId: first, amount: 260000, incurredAt: days(20), category: "materials" });
  await caller.costs.createActual({ ...input, wbsItemId: first, amount: 90000, incurredAt: days(10), category: "labour" });
  await caller.costs.createActual({ ...input, wbsItemId: second, amount: 300000, incurredAt: days(5), category: "subcontract" });
  await caller.progress.create({ ...input, wbsItemId: first, percentComplete: 80, reportedAt: days(18) });
  await caller.progress.create({ ...input, wbsItemId: second, percentComplete: 30, reportedAt: days(2) });
  const co = await caller.changes.create({ ...input, changeNumber: "CO-1", title: "Extra scope", description: "Extra scope instructed", impactScheduleDays: 0, impactCost: 0, contractValueImpact: 120000, currency: "SAR" });
  for (const nextStatus of ["submitted", "under_review", "approved"]) await caller.changes.transitionStatus({ ...input, changeRequestId: co.id, nextStatus });
  await caller.controls.captureOperationalEvmSnapshot({ ...input, periodAt: days(30), eacMethod: "ac_plus_remaining" });

  // Suppliers, a supplier contract linked to the register, a commitment and an issued purchase order.
  const steel = await caller.procurement.createSupplier({ tenantId, code: "SUP-1", legalName: "Gulf Steel Supply Co.", contactName: "Sales Desk", contactEmail: "sales@gulfsteel.example.test" });
  await caller.procurement.createSupplier({ tenantId, code: "SUP-2", legalName: "Al Noor Concrete Works", contactEmail: "orders@alnoor.example.test" });
  await caller.contracts.create({ ...input, code: "C-001", title: "Reinforcement steel supply", counterparty: "Gulf Steel Supply Co.", counterpartyKind: "supplier", supplierId: steel.id, contractValue: 250000, currency: "SAR", startAt: days(60), endAt: new Date(Date.now() + 200 * 86400000) });
  await caller.contracts.create({ ...input, code: "C-002", title: "Main contract with the client", counterparty: "Client Developer Co.", counterpartyKind: "client", contractValue: 1400000, currency: "SAR" });
  const commitment = await caller.contracts.createCommitment({ ...input, code: "CM-001", description: "Steel and cement commitment", amount: 120000, currency: "SAR", committedAt: days(30) });
  await connection.query("UPDATE commitments SET status = 'committed' WHERE id = ?", [commitment.id]); // no procedure moves a commitment on; the receipt checks it is committed
  const po = await caller.purchaseOrders.create({ ...input, commitmentId: commitment.id, wbsItemId: first, supplierId: steel.id, purchaseOrderNumber: "PO-001", orderDate: days(25), amount: 60000, currency: "SAR", summary: "Rebar and cement for the foundations" });
  for (const nextStatus of ["submitted", "approved", "issued"]) await caller.purchaseOrders.transitionStatus({ ...input, purchaseOrderId: po.id, nextStatus });
  const po2 = await caller.purchaseOrders.create({ ...input, commitmentId: commitment.id, wbsItemId: second, supplierId: steel.id, purchaseOrderNumber: "PO-002", orderDate: days(12), amount: 30000, currency: "SAR", summary: "Block work delivered straight to the plot" });
  for (const nextStatus of ["submitted", "approved", "issued"]) await caller.purchaseOrders.transitionStatus({ ...input, purchaseOrderId: po2.id, nextStatus });

  // Materials and a warehouse: an opening balance WITH a price, a priced receipt (weighted average), an issue to work, one receipt straight to site.
  const warehouse = await caller.warehouses.create({ ...input, code: "WH-MAIN", name: "Main site store" });
  await caller.warehouses.create({ ...input, code: "WH-2", name: "Block B store" });
  const cement = await caller.materials.createMaster({ tenantId, code: "CEM-42", description: "Cement 42.5 (50 kg bag)", unitOfMeasure: "bag", category: "concrete" });
  const rebar = await caller.materials.createMaster({ tenantId, code: "REB-16", description: "Rebar 16 mm", unitOfMeasure: "ton", category: "steel" });
  await caller.materials.saveProjectOverride({ ...input, materialId: cement.id, reorderLevel: 150, active: true });
  await caller.warehouses.recordInventory({ ...input, warehouseId: warehouse.id, materialId: cement.id, transactionType: "receipt", quantityDelta: 400, unitCost: 14, referenceNumber: "OPENING", note: "Opening balance", occurredAt: days(28) });
  await caller.goodsReceipts.create({ ...input, grnNumber: "GRN-001", purchaseOrderId: po.id, materialId: cement.id, receivedQuantity: 300, rejectedQuantity: 0, unitCost: 16, unitOfMeasure: "bag", receivedAt: days(20), receiptMode: "warehouse_stock", warehouseId: warehouse.id });
  await caller.warehouses.issueToWork({ ...input, warehouseId: warehouse.id, materialId: cement.id, wbsItemId: first, issuedQuantity: 120, referenceNumber: "ISS-001", issuedAt: days(15) });
  await caller.goodsReceipts.create({ ...input, grnNumber: "GRN-002", purchaseOrderId: po2.id, materialId: rebar.id, receivedQuantity: 8, rejectedQuantity: 0, unitCost: 2400, unitOfMeasure: "ton", receivedAt: days(9), receiptMode: "direct_to_site" });

  // People: three employees (two nationalities), a salary structure each, approved hours across two WBS items, one payroll run shared out by hours.
  const [[resource]] = await connection.query("SELECT id FROM project_resources WHERE projectId = ? AND resourceType = 'labor' LIMIT 1", [projectId]);
  const resourceId = resource?.id ?? (await caller.resources.create({ ...input, resourceCode: "LAB-1", name: "Site labour", resourceType: "labor", plannedUnits: 2000, allocatedUnits: 0, unitCost: 45, currency: "SAR" })).id;
  const staff = [["E-001", "Employee One", "Foreman", "2020-01-01", "Saudi", 9000, 2000, 1000], ["E-002", "Employee Two", "Mason", "2025-06-01", "Indian", 5000, 1000, 0], ["E-003", "Employee Three", "Carpenter", "2023-03-01", "Egyptian", 5500, 1000, 500]];
  const ids = [];
  for (const [number, name, title, hired, nationality, base, housing, transport] of staff) {
    const id = randomUUID(); ids.push(id);
    await connection.query("INSERT INTO employees (id, tenantId, employeeNumber, fullName, jobTitle, department, hireDate, employmentStatus, nationality, createdByUserId) VALUES (?, ?, ?, ?, ?, 'Site', ?, 'active', ?, ?)", [id, tenantId, number, name, title, hired, nationality, user.id]);
    await caller.employees.payroll.salaryStructure.save({ tenantId, employeeId: id, baseSalary: base, housingAllowance: housing, transportAllowance: transport, hardshipAllowance: 0, gosiRate: 0.09, otherDeductions: 0, eosAccrualMode: "computed", eosMonthlyAccrual: 0, currency: "SAR" });
  }
  const month = new Date(); const periodStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)); const periodEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
  const dayOf = n => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), n)).toISOString().slice(0, 10);
  for (const [index, employeeId] of ids.entries()) for (const [wbsItemId, workDays] of [[first, [1, 2, 3]], [second, [4, 5]]]) {
    const assignmentId = randomUUID();
    await connection.query("INSERT INTO employee_assignments (id, tenantId, projectId, employeeId, projectResourceId, wbsItemId, plannedStartAt, plannedFinishAt, plannedHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 120, 'active', ?)", [assignmentId, tenantId, projectId, employeeId, resourceId, wbsItemId, dayOf(1), dayOf(28), user.id]);
    for (const d of workDays) {
      const entryId = randomUUID();
      await connection.query("INSERT INTO employee_time_entries (id, tenantId, assignmentId, employeeId, projectId, workDate, actualHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?)", [entryId, tenantId, assignmentId, employeeId, projectId, dayOf(d), 8 - (index === 1 && wbsItemId === second ? 2 : 0), user.id]);
      await transitionEmployeeTimeEntryForTenant({ userId: user.id, tenantId, projectId, timeEntryId: entryId, status: "approved" });
    }
  }
  const run = await caller.employees.payroll.createRun({ tenantId, periodStart, periodEnd });
  const [entries] = await connection.query("SELECT id FROM payroll_entries WHERE payrollRunId = ?", [run.id]);
  for (const entry of entries) await caller.employees.payroll.allocateByHours({ tenantId, payrollEntryId: entry.id }).catch(error => console.log("allocateByHours:", String(error.message).slice(0, 80)));
  console.log("seed: done");
}

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
];
const VIEWS = [{ key: "desktop", label: "سطح المكتب", viewport: { width: 1440, height: 900 }, options: {} }, { key: "mobile", label: "الجوال 390px", viewport: { width: 390, height: 844 }, options: { hasTouch: true, isMobile: true } }];

await seed();
const ONLY = process.env.ONLY?.split(",");
if (!ONLY) rmSync(join(OUT, "gallery"), { recursive: true, force: true });
mkdirSync(join(OUT, "gallery"), { recursive: true });
const token = await sdk.createSessionToken(openId, { name: user.name ?? "Demo Admin" });
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
      await page.goto(`${BASE_URL}${target}${target.includes("?") ? "&" : "?"}lang=ar`, { waitUntil: "load", timeout: 45_000 });
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
