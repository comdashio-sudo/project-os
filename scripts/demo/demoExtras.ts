// Work order 17, item 4: what the demonstration company still lacked for a full sales walk-through — human-resources records, "my indicators" for the people who work
// on the project, synthetic site photos, and five short knowledge articles. Everything is obviously made up (names end in "(عرض)", photos carry a hatched
// "synthetic" band and are drawn by this file, never taken from a real site). Called from seedDemoCompany inside its seeding transaction.
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export const KNOWLEDGE_ARTICLES = [
  { title: "فحص صب الخرسانة قبل التسليم (مقال عرض)", content: "قبل طلب الفحص: تأكد من نظافة القوالب، ومطابقة تسليح الحديد للمخطط، وتثبيت الغطاء الخرساني. بعد الصب: سجّل درجة الحرارة ورقم الخلطة، ولا تُزِل القوالب قبل المدة المقررة. هذا مقال توضيحي لأغراض العرض." },
  { title: "كيف تُكتب ملاحظة عدم مطابقة (NCR) مفيدة (مقال عرض)", content: "اذكر الموقع بدقة (الفيلا والنشاط)، وصف العيب في جملة واحدة، وأرفق صورة عند الإمكان، وحدّد تاريخ الإغلاق المطلوب. لا تخلط أكثر من عيب في ملاحظة واحدة، ولا تغلقها قبل إعادة الفحص. هذا مقال توضيحي لأغراض العرض." },
  { title: "الاستلام الأول للمواد في المستودع (مقال عرض)", content: "طابق الكمية الواصلة مع أمر الشراء وإذن التسليم، افحص الحالة الظاهرية، سجّل الاستلام في المنصة في اليوم نفسه، وضع المواد في موقعها المحدد. المواد المرفوضة تُعزل وتُسجَّل ولا تُصرف. هذا مقال توضيحي لأغراض العرض." },
  { title: "قراءة مؤشرات الأداء والتكلفة بلغة بسيطة (مقال عرض)", content: "مؤشر أداء التكلفة أقل من 1 يعني أنك تصرف أكثر مما أنجزت؛ ومؤشر الجدول أقل من 1 يعني تأخرًا عن البرنامج. الربح المتوقع هو العقد بعد الأوامر التغييرية ناقص التكلفة المتوقعة عند الإنهاء. هذا مقال توضيحي لأغراض العرض." },
  { title: "السلامة في الموقع: خمس قواعد يومية (مقال عرض)", content: "الخوذة والحذاء في كل وقت، حواجز حول الحفر المفتوحة، فحص السقالات قبل كل وردية، عدم العمل على ارتفاع دون حزام، والإبلاغ الفوري عن أي حادث أو شبه حادث. هذا مقال توضيحي لأغراض العرض." },
];

const EXTRA_STAFF = ["عامل موقع (عرض) ١", "عامل موقع (عرض) ٢", "فني كهرباء (عرض)", "فني سباكة (عرض)", "مشغّل معدات (عرض)", "حارس موقع (عرض)"].map((name, index) => ({ name, title: ["عامل", "عامل", "فني كهرباء", "فني سباكة", "مشغّل معدات", "حارس"][index], department: "الموقع" }));

/** A small synthetic site scene as a PNG: sky, ground, rows of block-built "villas" in stages of completion, and a hatched band marking it as synthetic. */
export async function syntheticSitePhoto(seed: number): Promise<Buffer> {
  const { PNG } = await import("pngjs");
  const W = 640; const H = 400; const png = new PNG({ width: W, height: H });
  const set = (x: number, y: number, r: number, g: number, b: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (W * y + x) << 2; png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) y < 220 ? set(x, y, 150 + Math.round(y / 4), 195 + Math.round(y / 9), 235) : set(x, y, 176 - (y - 220) / 8, 150 - (y - 220) / 9, 108);
  const box = (x0: number, y0: number, w: number, h: number, c: [number, number, number]) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, ...c); };
  for (let i = 0; i < 5; i++) {
    const stage = (seed + i) % 4; const x0 = 30 + i * 120; const base = 330;
    box(x0, base - 18, 100, 18, [120, 120, 124]); // foundation slab
    if (stage >= 1) box(x0 + 6, base - 78, 88, 60, [200, 188, 170]); // block walls
    if (stage >= 2) box(x0, base - 92, 100, 14, [140, 140, 146]); // roof slab
    if (stage >= 3) { box(x0 + 14, base - 64, 20, 28, [70, 110, 160]); box(x0 + 62, base - 64, 20, 28, [70, 110, 160]); } // windows
  }
  for (let y = 0; y < 34; y++) for (let x = 0; x < W; x++) ((x + y) % 28 < 14) ? set(x, y, 220, 60, 50) : set(x, y, 255, 255, 255); // the "synthetic" hatch
  return PNG.sync.write(png);
}

type Person = { id: number; name: string; key: string };
export async function seedDemoExtras(input: {
  client: PoolClient; tenantId: string; projectId: string; ownerId: number; reviewerId: number; people: Person[];
  approvedReports: Array<{ id: string; preparedBy: number }>; day: (n: number) => Date; now: Date; bulk: (client: PoolClient, table: string, columns: string[], rows: unknown[][]) => Promise<void>;
  storagePut?: (key: string, data: Buffer, contentType: string) => Promise<unknown>; log: (line: string) => void;
}) {
  const { client, tenantId, projectId, ownerId, reviewerId, people, bulk } = input;
  // 1. employees: every demonstration person has a record linked to their account (that is what makes "my indicators" open), plus the site workforce
  const titles: Record<string, [string, string]> = { board: ["عضو مجلس الإدارة", "الإدارة"], pmo: ["مدير المحفظة", "المحفظة"], pm: ["مدير المشروع", "المشروع"], keeper: ["أمين المستودع", "المستودع"], site1: ["مهندس موقع", "الموقع"], site2: ["مهندس موقع", "الموقع"], qc: ["مدير الجودة", "الجودة"], coord: ["منسق المشروع", "المشروع"], cost: ["مراقب التكاليف", "التكاليف"], plan: ["مهندس التخطيط", "التخطيط"] };
  const employeeRows: unknown[][] = []; const employeeIds: string[] = [];
  people.forEach((person, index) => { const id = randomUUID(); employeeIds.push(id); const [title, department] = titles[person.key] ?? ["موظف", "عام"]; employeeRows.push([id, tenantId, `EMP-${String(index + 1).padStart(3, "0")}`, person.name, title, department, input.day(-400 - index * 20), "active", person.id, ownerId]); });
  EXTRA_STAFF.forEach((staff, index) => { const id = randomUUID(); employeeIds.push(id); employeeRows.push([id, tenantId, `EMP-${String(people.length + index + 1).padStart(3, "0")}`, staff.name, staff.title, staff.department, input.day(-200 - index * 15), "active", null, ownerId]); });
  await bulk(client, "employees", ["id", "tenant_id", "employee_number", "full_name", "job_title", "department", "hire_date", "employment_status", "linked_user_id", "created_by_user_id"], employeeRows);
  // 2. attendance for the last 20 working days, approved by the project manager
  const attendance: unknown[][] = [];
  for (let back = 24; back >= 1; back--) {
    const date = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate() - back)); const dow = date.getUTCDay(); if (dow === 5 || dow === 6) continue;
    employeeIds.forEach((employeeId, index) => attendance.push([randomUUID(), tenantId, employeeId, date, (back + index) % 17 === 0 ? "leave" : (back * 3 + index) % 41 === 0 ? "absent" : "present", "approved", ownerId, reviewerId]));
  }
  await bulk(client, "employee_attendance", ["id", "tenant_id", "employee_id", "attendance_date", "attendance_status", "status", "created_by_user_id", "reviewed_by_user_id"], attendance);
  // 3. site photos (synthetic) — only when a storage service is configured; a row without its file would show a broken picture
  let photos = 0;
  if (input.storagePut) {
    const photoRows: unknown[][] = [];
    for (const [index, report] of input.approvedReports.slice(-12).entries()) {
      const key = `tenants/${tenantId}/demo/site-photo-${index + 1}.png`;
      const bytes = await syntheticSitePhoto(index);
      try { await input.storagePut(key, bytes, "image/png"); } catch { input.log("site photos skipped: the storage service refused the upload"); break; }
      photoRows.push([randomUUID(), tenantId, projectId, report.id, key, `site-photo-${index + 1}.png`, "image/png", bytes.length, "صورة تركيبية مولَّدة للعرض (ليست من موقع حقيقي)", report.preparedBy]);
    }
    if (photoRows.length) await bulk(client, "site_daily_report_photos", ["id", "tenant_id", "project_id", "report_id", "storage_key", "file_name", "content_type", "size_bytes", "caption", "created_by_user_id"], photoRows);
    photos = photoRows.length;
  } else input.log("site photos skipped: no storage service is configured on this machine");
  // 4. five knowledge articles, each from its own source document (the article table requires one)
  const docRows: unknown[][] = []; const articleRows: unknown[][] = [];
  KNOWLEDGE_ARTICLES.forEach((article, index) => {
    const documentId = randomUUID();
    docRows.push([documentId, tenantId, projectId, `KB-${String(index + 1).padStart(3, "0")}`, article.title, "report", "approved", ownerId]);
    articleRows.push([randomUUID(), tenantId, documentId, article.title, article.content, "published", ownerId, ownerId, input.day(-30 + index)]);
  });
  await bulk(client, "project_documents", ["id", "tenant_id", "project_id", "document_number", "title", "category", "status", "created_by_user_id"], docRows);
  await bulk(client, "knowledge_articles", ["id", "tenant_id", "source_document_id", "title", "content", "status", "created_by_user_id", "published_by_user_id", "published_at"], articleRows);
  input.log(`${employeeRows.length} employees, ${attendance.length} attendance rows, ${photos} site photos, ${articleRows.length} knowledge articles`);
  return { employees: employeeRows.length, attendance: attendance.length, photos, articles: articleRows.length, employeeIds };
}
