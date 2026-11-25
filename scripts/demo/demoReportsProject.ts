// Q-55 batch 2: the demonstration's «reports mode» project — the second project of «شركة العرض» (مبنى الخدمات المشتركة) run the way a building contractor
// reports: three weeks of daily reports, each prepared by the site engineer and approved by the project manager (labour of the main contractor and two
// subcontractors by role and shift, equipment, the day's work planned against actual, materials received, HSE, obstacles, tomorrow's plan, the day's
// inspections and some photos), and the weekly report of each of those weeks written over the figures the platform computes from them. The weekly and
// monthly reports are not stored as figures: reportPeriods computes them from the dailies, and they export as the screens export them (Word / PPTX / PDF).
// Everything is invented and says so. The project's set-up and every report go through the platform's own procedures, as the person whose step it is, so
// each one passes the same checks a real report would; only the day's inspections (WIRs and RFIs dated on the report days) and the synthetic photos are
// written directly, as the rest of the demonstration's history is.
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { syntheticSitePhoto } from "./demoExtras";

type Person = { id: number; openId: string; name: string | null; email: string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Caller = any; // appRouter.createCaller(...) — the builder's own callerFor
export const REPORTS_PROJECT = {
  reportPrefix: "RPT",
  client: "مالك المبنى (عرض)",
  consultant: "استشاري العرض أ",
  contractor: "شركة العرض — المقاول الرئيسي",
  subs: ["مقاول الكهروميكانيك (عرض)", "مقاول الواجهات (عرض)"],
  /** working days (Sunday to Thursday) reported, counted back from yesterday */
  calendarDays: 21,
} as const;

const ymd = (date: Date) => date.toISOString().slice(0, 10);
const siteDate = (date: Date) => new Date(date.getTime() + 3 * 3_600_000); // the site's day (UTC+3), as the reports count it

/** The days the demonstration reports: every Sunday-to-Thursday of the last three weeks, oldest first, never today (left for the walk-through). */
export function reportDays(now: Date): string[] {
  const days: string[] = [];
  for (let back = REPORTS_PROJECT.calendarDays; back >= 1; back--) {
    const date = siteDate(new Date(now.getTime() - back * 86_400_000));
    const dow = date.getUTCDay();
    if (dow === 5 || dow === 6) continue;
    days.push(ymd(date));
  }
  return days;
}

/** The weeks those days fall in. Saturday starts a week, as the weekly report page opens it (`currentWeekStart`), so a saved week is the one the page shows. */
export function reportWeeks(days: string[]): string[] {
  const weeks = new Set<string>();
  for (const day of days) { const date = new Date(`${day}T00:00:00Z`); weeks.add(ymd(new Date(date.getTime() - ((date.getUTCDay() + 1) % 7) * 86_400_000))); }
  return Array.from(weeks).sort();
}

// The work of the building, in the order a frame goes up: [description, unit, daily planned quantity, the project's activity it counts toward]. One line per
// activity carries it, so an activity's planned and actual sums stay in one unit; the rest are described work.
const WORK: Array<[string, string, number, string?]> = [
  ["صب أعمدة الدور الثالث (عرض)", "م³", 18, "S1"], ["تسليح سقف الدور الثالث (عرض)", "طن", 6], ["بلوك جدران الدور الثاني (عرض)", "م²", 140, "S2"],
  ["تمديدات كهرباء الدور الأول (عرض)", "م.ط", 260, "S3"], ["تركيب هياكل الواجهة الشمالية (عرض)", "م²", 45], ["لياسة الدور الأرضي (عرض)", "م²", 210],
];
const MATERIALS: Array<[string, string, string]> = [["خرسانة جاهزة C40 (عرض)", "م³", "مصنع خرسانة العرض"], ["حديد تسليح 16 مم (عرض)", "طن", "مورد الحديد (عرض)"],
  ["بلوك 20 سم (عرض)", "قطعة", "مصنع البلوك (عرض)"], ["كيابل نحاس 4 مم² (عرض)", "لفة", "مورد الكهرباء (عرض)"], ["ألواح ألمنيوم مركّب (عرض)", "م²", "مورد الواجهات (عرض)"]];
const OBSTACLES: Array<[string, string, string]> = [["تأخر وصول مضخة الخرسانة (عرض)", "تأخير الصب ساعتين", "المقاول الرئيسي"], ["رياح شديدة أوقفت الرافعة البرجية (عرض)", "توقف الرفع نصف يوم", "مدير الموقع"],
  ["نقص في عمالة الواجهات (عرض)", "انخفاض إنتاجية الواجهة", "مقاول الواجهات"], ["انتظار اعتماد عينة الكيابل (عرض)", "تأجيل التمديدات يومًا", "الاستشاري"]];
const WEATHER = ["صافٍ", "غائم جزئيًا", "حار", "مغبر", "رياح نشطة"];

export async function seedReportsModeProject(input: {
  client: PoolClient; tenantId: string; projectId: string; now: Date; owner: Person; siteEngineer: Person; manager: Person;
  callerFor: (person: Person) => Caller; roleIds: Map<string, string>;
  storagePut?: (key: string, data: Buffer, contentType: string) => Promise<{ key: string }>; log: (line: string) => void;
}) {
  const { client, tenantId, projectId, now, log } = input;
  const at = { tenantId, projectId };
  const owner = input.callerFor(input.owner); const engineer = input.callerFor(input.siteEngineer); const manager = input.callerFor(input.manager);

  // 1. who works this project: the second site engineer prepares, the project manager approves (each a project-scoped assignment, like any member's)
  for (const [person, role] of [[input.siteEngineer, "SITE_ENGINEER"], [input.manager, "PROJECT_MANAGER"]] as const) {
    const membershipId = (await client.query("SELECT id FROM memberships WHERE tenant_id = $1 AND user_id = $2", [tenantId, person.id])).rows[0].id as string;
    await owner.tenant.assignMembershipRole({ tenantId, membershipId, roleId: input.roleIds.get(role)!, scopeType: "project", scopeId: projectId });
  }

  // 2. the project's set-up as a project manager does it: the parties and the report prefix, the companies on site, the labour roles, the plant
  await owner.projects.profile.save({ ...at, location: "حي العرض، الرياض (عنوان مختلق)", contractNumber: "CT2-DEMO-001", clientName: REPORTS_PROJECT.client, consultantName: REPORTS_PROJECT.consultant,
    contractorName: REPORTS_PROJECT.contractor, workDays: [0, 1, 2, 3, 4], workStart: "07:00", workEnd: "17:00", reportPrefix: REPORTS_PROJECT.reportPrefix });
  const main = (await owner.projects.companies.save({ ...at, name: REPORTS_PROJECT.contractor, role: "main" })).id as string;
  const subs = [] as string[];
  for (const name of REPORTS_PROJECT.subs) subs.push((await owner.projects.companies.save({ ...at, name, role: "sub" })).id as string);
  await owner.projects.labourRoles.seedDefaults({ ...at, language: "ar" });
  const roles = await owner.projects.labourRoles.list(at) as Array<{ id: string; defaultKey: string | null }>;
  const role = (key: string) => roles.find(item => item.defaultKey === key)!.id;
  const crew: Array<{ company: string; role: string; base: number; night?: number }> = [
    { company: main, role: role("site_engineer"), base: 3 }, { company: main, role: role("general_foreman"), base: 2 }, { company: main, role: role("hse_officer"), base: 2 },
    { company: main, role: role("steel_fixer"), base: 22, night: 6 }, { company: main, role: role("formwork_carpenter"), base: 18 }, { company: main, role: role("concrete_worker"), base: 14, night: 8 },
    { company: main, role: role("mason"), base: 16 }, { company: main, role: role("general_labourer"), base: 25 }, { company: main, role: role("crane_operator"), base: 2 },
    { company: subs[0], role: role("electrician"), base: 12 }, { company: subs[0], role: role("plumber"), base: 6 }, { company: subs[0], role: role("mep_supervisor"), base: 1 },
    { company: subs[1], role: role("aluminium_fabricator"), base: 9 }, { company: subs[1], role: role("scaffolder"), base: 5 },
  ];
  const plant: string[] = [];
  for (const [equipmentType, model, plateOrSize] of [["رافعة برجية (عرض)", "TC-6013", "TC-01"], ["مضخة خرسانة (عرض)", "42M", "PMP-07"], ["حفارة صغيرة (عرض)", "CAT-308", "EX-12"], ["مولد كهربائي (عرض)", "250KVA", "GEN-03"]] as const) {
    plant.push((await owner.projects.equipment.save({ ...at, equipmentType, model, plateOrSize, ownerCompanyId: main })).id as string);
  }

  // 3. the day's inspections are read from the WIRs and RFIs dated on that day: a few of each, on the building's own activities
  const days = reportDays(now);
  const definitionRows = (await client.query("SELECT id, code FROM pmc_activity_definitions WHERE tenant_id = $1 AND project_id = $2 ORDER BY code", [tenantId, projectId])).rows as Array<{ id: string; code: string }>;
  const definitions = definitionRows.map(row => row.id);
  const activityOf = new Map(definitionRows.map(row => [row.code, row.id]));
  const at10 = (day: string, hour: number) => new Date(`${day}T${String(hour - 3).padStart(2, "0")}:30:00Z`); // 10:30 on site
  let wirs = 0; let rfis = 0;
  for (const [index, day] of days.entries()) {
    if (definitions.length && index % 2 === 0) {
      wirs++;
      await client.query("INSERT INTO pmc_inspection_requests (id, tenant_id, project_id, request_code, activity_definition_id, contractor_label, consultant_label, requested_at, response_code, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [randomUUID(), tenantId, projectId, `WIR-B-${String(wirs).padStart(3, "0")}`, definitions[index % definitions.length], REPORTS_PROJECT.contractor, REPORTS_PROJECT.consultant, at10(day, 10),
          index >= days.length - 2 ? null : ["A", "B", "A", "C"][wirs % 4], "طلب فحص (عرض)"]);
    }
    if (index % 3 === 1) {
      rfis++;
      await client.query("INSERT INTO rfis (id, tenant_id, project_id, rfi_number, subject, question, status, due_at, submitted_at, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [randomUUID(), tenantId, projectId, `RFI-B-${String(rfis).padStart(3, "0")}`, `استيضاح تفصيلة (عرض) ${rfis}`, "يرجى توضيح التفصيلة في المخطط (سؤال مختلق للعرض).", index >= days.length - 3 ? "submitted" : "answered",
          new Date(at10(day, 12).getTime() + 5 * 86_400_000), at10(day, 12), input.siteEngineer.id]);
    }
  }

  // 4. the daily reports: prepared, sent and approved, day by day; the figures move a little from day to day, deterministically
  const reportIds: string[] = [];
  for (const [index, day] of days.entries()) {
    const wave = (k: number) => ((index * 7 + k * 3) % 5) - 2; // −2 … +2
    const work = WORK.filter(([, , , code], k) => code || (index + k) % 3 !== 2).map(([description, unit, planned, code], k) => {
      const actual = Math.max(0, Math.round(planned * (0.82 + ((index + k) % 6) * 0.06) * 10) / 10);
      const activity = code ? activityOf.get(code) : undefined;
      return { lineType: "work" as const, description: `${description} — ${unit}`, plannedQuantity: planned, actualQuantity: actual, ...(activity ? { pmcActivityDefinitionId: activity } : {}) };
    });
    const labour = crew.flatMap((member, k) => [
      { companyId: member.company, labourRoleId: member.role, shift: "day" as const, headcount: Math.max(1, member.base + wave(k)) },
      ...(member.night && index % 2 === 0 ? [{ companyId: member.company, labourRoleId: member.role, shift: "night" as const, headcount: member.night }] : []),
    ]);
    const equipment = plant.filter((_, k) => k !== 2 || index % 3 === 0).map((equipmentId, k) => ({ equipmentId, count: 1, hours: k === 0 && index % 7 === 3 ? 4 : 9 }));
    const materials = index % 2 === 0 ? [MATERIALS[index % MATERIALS.length]].map(([material, unit, supplier]) => ({ material, quantity: [42, 12, 3200, 30, 160][index % 5], unit, supplier })) : [];
    const hse = [{ kind: "meeting" as const, description: "اجتماع السلامة الصباحي (عرض)", peopleCount: labour.reduce((sum, row) => sum + row.headcount, 0) },
      ...(index % 5 === 3 ? [{ kind: "near_miss" as const, description: "سقوط أداة من السقالة دون إصابة (عرض)", actionTaken: "تثبيت حواجز أدوات على حافة السقالة" }] : []),
      ...(index % 7 === 5 ? [{ kind: "violation" as const, description: "عامل بلا حزام أمان على ارتفاع (عرض)", peopleCount: 1, actionTaken: "إيقاف العمل وتوعية الفريق" }] : [])];
    const obstacleItems = index % 4 === 1 ? [OBSTACLES[index % OBSTACLES.length]].map(([issue, impact, responsible]) => ({ issue, impact, responsible, action: "متابعة يومية حتى الإغلاق (عرض)" })) : [];
    const tomorrow = WORK.filter((_, k) => (index + k + 1) % 3 !== 2).slice(0, 3).map(([activity, unit, planned]) => ({ area: "المبنى الرئيسي", activity, quantity: planned, unit, resources: "الطاقم المعتاد" }));
    const saved = await engineer.siteReports.save({ ...at, reportDate: day, weather: WEATHER[index % WEATHER.length], temperatureC: 29 + (index % 9), wind: index % 6 === 4 ? "شمالية 35 كم/س" : "شمالية 12 كم/س", workHours: 10,
      summary: `تقرير يومي (عرض): أعمال الهيكل والكهروميكانيك والواجهات وفق البرنامج، العمالة ${labour.reduce((sum, row) => sum + row.headcount, 0)} فردًا.`,
      lines: work, labour, equipment, materials, hse, obstacleItems, tomorrow });
    await engineer.siteReports.submit({ ...at, reportId: saved.id });
    await manager.siteReports.review({ ...at, reportId: saved.id, decision: "approve" });
    reportIds.push(saved.id as string);
  }

  // 5. a few synthetic site photos on the latest reports (only with a storage service: a row without its file shows a broken picture)
  let photos = 0;
  if (input.storagePut) {
    for (const [index, reportId] of reportIds.slice(-6).entries()) {
      const bytes = await syntheticSitePhoto(100 + index);
      let key: string; // the key the storage service returns (it adds a suffix), never the one asked for
      try { ({ key } = await input.storagePut(`tenants/${tenantId}/demo/reports-mode-photo-${index + 1}.png`, bytes, "image/png")); } catch { log("reports-mode photos skipped: the storage service refused the upload"); break; }
      await client.query("INSERT INTO site_daily_report_photos (id, tenant_id, project_id, report_id, storage_key, file_name, content_type, size_bytes, caption, zone, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [randomUUID(), tenantId, projectId, reportId, key, `reports-mode-photo-${index + 1}.png`, "image/png", bytes.length, "صورة تركيبية مولَّدة للعرض (ليست من موقع حقيقي)", "المبنى الرئيسي", input.siteEngineer.id]);
      photos++;
    }
  }

  // 6. each week's report: the narrative the project manager writes over the figures the platform computes from that week's dailies
  const weeks = reportWeeks(days);
  for (const [index, weekStart] of weeks.entries()) {
    await manager.reportPeriods.saveWeekly({ ...at, weekStart, photoIds: [], texts: {
      summary: `الأسبوع ${index + 1} (عرض): تقدم الهيكل في الدور الثالث وبدء تمديدات الكهرباء وهياكل الواجهة الشمالية.`,
      analysis: "الإنتاجية الفعلية قريبة من المخطط في الخرسانة، وأقل في الواجهات بسبب نقص العمالة (تحليل مختلق للعرض).",
      correctiveActions: "زيادة طاقم الواجهات وتقديم موعد مضخة الخرسانة (إجراءات مختلقة للعرض).",
      outlook: "استكمال سقف الدور الثالث وبدء بلوك الدور الثالث الأسبوع القادم (عرض).",
      issues: "انتظار اعتماد عينة الكيابل من الاستشاري (عرض).", decisions: "اعتماد العمل بوردية ليلية للخرسانة (عرض).",
    } });
  }
  log(`reports-mode project: ${reportIds.length} approved daily reports, ${weeks.length} weekly reports, ${wirs} WIRs, ${rfis} RFIs, ${photos} photos`);
  return { reports: reportIds.length, weeks, wirs, rfis, photos, days };
}
