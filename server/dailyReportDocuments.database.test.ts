import JSZip from "jszip";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { storagePut } from "./storage";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";

// D-47 (b), real database and router as the restricted role: a made-up report is exported as PDF and Word, fetched and opened; sections, totals, logo and footer are
// checked, and the PDF's Arabic text (pdf.js) must come out in reading order with joined letters. Synthetic data only.
const SLUG = "daily-docs";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@dd.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const A = "ab000000-0000-4000-8000-000000000001";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const MAIN = "شركة المقاول الرئيسي مثال";
const SECTIONS = ["الرأس", "العمالة", "المعدات", "الإنجاز", "الفحوصات", "المواد المستلمة", "السلامة والصحة المهنية", "المعوقات", "خطة الغد", "الصور", "الاعتماد"];
const KEYS = ["owner", "engineer", "otherOwner"] as const;
const ids = {} as Record<(typeof KEYS)[number], number>, callers = {} as Record<(typeof KEYS)[number], ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection, s3: FakeS3, tenantId = "";
const at = () => ({ tenantId, projectId: A }), fetchBytes = async (url: string) => Buffer.from(await (await fetch(url)).arrayBuffer());

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    for (const table of ["site_daily_report_materials", "site_daily_report_hse", "site_daily_report_obstacles", "site_daily_report_tomorrow", "site_daily_report_labour", "site_daily_report_equipment", "site_daily_report_lines", "site_daily_reports",
      "project_report_counters", "project_equipment", "project_labour_roles", "project_companies", "project_profiles", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]); await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  } await connection.query("DELETE FROM users WHERE openId LIKE 'dd-%'");
}

/** The PDF's text as pdf.js extracts it, one string per line, and the raw (unnormalised) text to see the letters' forms. */
async function pdfText(bytes: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const lines: string[] = []; let raw = ""; let line: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    for (const item of (await (await pdf.getPage(p)).getTextContent()).items as Array<{ str: string; hasEOL: boolean }>) {
      raw += item.str; if (item.str.trim()) line.push(item.str.normalize("NFKC"));
      if (item.hasEOL) { lines.push(line.join(" ")); line = []; }
    }
    if (line.length) { lines.push(line.join(" ")); line = []; }
  }
  return { lines, raw, pages: pdf.numPages };
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("the daily report as PDF and Word on a real database (D-47 b)", () => {
  let reportId = "";
  beforeAll(async () => {
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`dd-${key}`, `DD ${key}`, `dd-${key}@dd.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'dd-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `dd-${key}`)!.id; callers[key] = callerFor(ids[key], `dd-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Daily Docs Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await callers.otherOwner.tenant.create({ legalName: "Other Docs Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" });
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'DD-A', 'مشروع الفلل التجريبي', 'villas', 'SAR', 'active')", [A, tenantId]);
    const field = await callers.owner.tenant.createRole({ tenantId, code: "DD_FIELD", name: "Site engineer", productCode: "PROJECT", permissionCodes: ["project.field.manage"] });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.engineer, roleId: field.id, scopeType: "project", scopeId: A });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    const logo = await storagePut(`uploads/${tenantId}/${A}/logo/dd-client.png`, PNG, "image/png");
    await callers.owner.projects.profile.save({ ...at(), location: null, contractNumber: null, clientName: "العميل مثال", consultantName: "الاستشاري مثال", contractorName: MAIN, workDays: [0, 1, 2, 3, 4], workStart: null, workEnd: null, reportPrefix: "DR" });
    await connection.query("UPDATE project_profiles SET clientLogoKey = ? WHERE tenantId = ? AND projectId = ?", [logo.key, tenantId, A]);
    const main = (await callers.owner.projects.companies.save({ ...at(), name: MAIN, role: "main" })).id;
    const sub = (await callers.owner.projects.companies.save({ ...at(), name: "مقاول الباطن مثال", role: "sub" })).id;
    await callers.owner.projects.labourRoles.seedDefaults({ ...at(), language: "ar" });
    const roles = await callers.owner.projects.labourRoles.list(at());
    const role = (key: string) => roles.find(item => item.defaultKey === key)!.id;
    const crane = (await callers.owner.projects.equipment.save({ ...at(), equipmentType: "رافعة متحركة", model: "50T", plateOrSize: "DD-1", ownerCompanyId: main })).id;
    reportId = (await callers.engineer.siteReports.save({ ...at(), reportDate: "2026-11-05", weather: "مشمس", wind: "شمالية 15", workHours: 10, temperatureC: 31,
      lines: [{ lineType: "work", description: "أعمال البلوك المنطقة الأولى", plannedQuantity: 120, actualQuantity: 95.5 }],
      labour: [{ companyId: main, labourRoleId: role("mason"), shift: "day", headcount: 14 }, { companyId: main, labourRoleId: role("site_engineer"), shift: "day", headcount: 3 }, { companyId: sub, labourRoleId: role("steel_fixer"), shift: "night", headcount: 9 }],
      equipment: [{ equipmentId: crane, count: 1, hours: 8 }],
      materials: [{ material: "إسمنت بورتلاندي", quantity: 40, unit: "كيس" }], hse: [{ kind: "meeting", description: "اجتماع السلامة الصباحي", peopleCount: 26 }],
      obstacleItems: [{ issue: "تأخر توريد الخرسانة", impact: "تأخير الصب ثلاث ساعات" }], tomorrow: [{ area: "المنطقة الأولى", activity: "صب سقف البلوك الرابع" }] })).id;
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } if (s3) await s3.close(); });

  it("PDF: sections 0–10 in order, the totals, the logo (only the client has one), a footer on every page; Arabic in reading order, joined", async () => {
    const exported = await callers.engineer.siteReports.export({ ...at(), reportId, format: "pdf", locale: "ar" });
    const bytes = await fetchBytes(exported.url);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-"); expect(bytes.toString("latin1")).toMatch(/\/Subtype\s*\/Image/); // the client's logo
    const { lines, raw, pages } = await pdfText(bytes);
    if (process.env.DD_DUMP) (await import("node:fs")).writeFileSync(process.env.DD_DUMP, bytes); // the file for a screenshot (pdftoppm), on demand
    const text = lines.join("\n");
    let last = -1; // reading order: each section title after the one before it
    for (const title of SECTIONS) { const at = text.indexOf(title, last + 1); expect(at, title).toBeGreaterThan(last); last = at; }
    for (const phrase of [MAIN, "الاستشاري مثال", "أعمال البلوك المنطقة الأولى", "تأخر توريد الخرسانة", "صب سقف البلوك الرابع", "أعده", "اعتمده"]) expect(text, phrase).toContain(phrase);
    expect(raw).toMatch(/[ﹰ-﻿]/); expect(raw).not.toMatch(/[ا-ي]{3}/); // phrases read back in logical order; letters drawn in joined forms, no run of unjoined base letters: every Arabic letter was drawn in its contextual form
    expect(lines.find(line => line.startsWith("الإجمالي") && line.endsWith(" 26")), lines.join(" / ")).toBeTruthy(); // totals: labour 26 (17 + 9), variance −24.5
    expect(lines.some(line => line.endsWith("120 95.5 -24.5"))).toBe(true);
    for (let p = 1; p <= pages; p++) expect(text).toContain(`صفحة ${p} من ${pages}`);
    expect(lines.filter(line => line.includes("DR-0001") && line.includes("2026-11-05") && line.includes("مشروع الفلل التجريبي") && line.includes("صفحة")).length).toBe(pages);
  });

  it("Word: the same sections and totals, right-to-left, the logo as an image, and a footer with the page fields", async () => {
    const exported = await callers.engineer.siteReports.export({ ...at(), reportId, format: "docx", locale: "ar" });
    const zip = await JSZip.loadAsync(await fetchBytes(exported.url)), document = await zip.file("word/document.xml")!.async("string");
    const plain = document.replace(/<[^>]+>/g, " ");
    let last = -1;
    for (const title of SECTIONS) { const at = plain.indexOf(title, last + 1); expect(at, title).toBeGreaterThan(last); last = at; }
    for (const phrase of [MAIN, "أعمال البلوك المنطقة الأولى", "اجتماع السلامة الصباحي", "صب سقف البلوك الرابع", "-24.5", "26"]) expect(plain, phrase).toContain(phrase);
    expect(document).toContain("<w:bidi/>"); expect(Object.keys(zip.files).some(name => name.startsWith("word/media/"))).toBe(true);
    const footer = await zip.file(Object.keys(zip.files).find(name => /^word\/footer\d*\.xml$/.test(name))!)!.async("string");
    expect(footer).toContain("DR-0001"); expect(footer).toMatch(/PAGE/); expect(footer).toMatch(/NUMPAGES/);
  });

  it("refused: another company, and an unknown report; nothing is written", async () => {
    expect(await code(callers.otherOwner.siteReports.export({ ...at(), reportId, format: "pdf", locale: "ar" }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.engineer.siteReports.export({ ...at(), reportId: "ab000000-0000-4000-8000-0000000000ff", format: "docx", locale: "ar" }))).toBe("PROJECT_OS_SITE_REPORT_NOT_FOUND");
    expect(Number((await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'site_report.exported'", [tenantId]))[0][0].n)).toBe(2);
  });
});
