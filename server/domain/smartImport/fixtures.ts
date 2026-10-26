import ExcelJS from "exceljs";
import type { KindCode } from "./kinds";

// SYNTHETIC samples that imitate how real project files look — no real data of anyone, invented names only (*.example.test style). Each carries what a person would say it is (kind, sheet and
// which column is which field), so a test can measure how many columns the reader matches WITHOUT help. The mess is deliberate: a logo and title lines above the table, merged cells,
// Arabic-Indic digits, Hijri dates, several sheets, totals and headings inside the table, CSV in Windows-1256, units in five spellings.
export type Sample = {
  id: string; description: string; fileName: string; format: "xlsx" | "csv" | "xer"; bytes: Uint8Array;
  expectedKind: KindCode | null; expectedSheet: string | null;
  /** column index (0-based, in the sheet) -> the field key the column is */
  expected: Record<number, string>;
  /** data rows that must come out (headings, totals and blanks excluded) */
  expectedRows: number;
  minMergedFilled?: number;
};

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const arabicDigits = (value: string | number) => String(value).replace(/\d/g, d => AR_DIGITS[Number(d)]);
const grouped = (value: number) => value.toLocaleString("en-US");

type SheetSpec = { name: string; rtl?: boolean; rows: Array<Array<string | number | Date | null>>; merges?: string[] };
async function workbook(sheets: SheetSpec[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name, { views: [{ rightToLeft: Boolean(spec.rtl) }] });
    spec.rows.forEach(row => ws.addRow(row));
    for (const range of spec.merges ?? []) ws.mergeCells(range);
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export async function buildSamples(): Promise<Sample[]> {
  const samples: Sample[] = [];

  // 1. Arabic BOQ of an invented contractor: logo + title above, a chapter column merged vertically, Arabic-Indic digits, section headings, subtotal and grand total rows, blanks.
  {
    const rows: SheetSpec["rows"] = [
      ["شركة الأفق التجريبية للمقاولات", null, null, null, null, null, null], ["جدول الكميات — مشروع مثال سكني", null, null, null, null, null, null], [null, null, null, null, null, null, null],
      ["الباب", "م", "وصف الأعمال", "الوحدة", "الكمية", "سعر الوحدة (ريال)", "الإجمالي (ريال)"],
      ["الأول", null, "أعمال الحفر والردم", null, null, null, null],
      [null, arabicDigits("1.1"), "حفر عام بالآلات في تربة عادية", "م³", arabicDigits(1200), arabicDigits(18), arabicDigits(21600)],
      [null, arabicDigits("1.2"), "ردم بمواد مختارة ودمك", "م٣", arabicDigits(800), arabicDigits(32.5), arabicDigits(26000)],
      [null, arabicDigits("1.3"), "نقل ناتج الحفر خارج الموقع", "م3", arabicDigits(400), arabicDigits(12), arabicDigits(4800)],
      [null, null, "إجمالي الباب الأول", null, null, null, arabicDigits(52400)],
      [null, null, null, null, null, null, null],
      ["الثاني", null, "أعمال الخرسانة", null, null, null, null],
      [null, arabicDigits("2.1"), "خرسانة عادية للقواعد", "م³", arabicDigits(150), arabicDigits(310), arabicDigits(46500)],
      [null, arabicDigits("2.2"), "حديد تسليح عالي المقاومة", "طن", arabicDigits(48), arabicDigits(3100), arabicDigits(148800)],
      [null, arabicDigits("2.3"), "قوالب خشبية للأعمدة", "م٢", arabicDigits(900), arabicDigits(55), arabicDigits(49500)],
      [null, null, "إجمالي الباب الثاني", null, null, null, arabicDigits(244800)],
      [null, null, "المجموع الكلي", null, null, null, arabicDigits(297200)],
    ];
    samples.push({ id: "boq-ar-contractor", description: "Arabic BOQ: logo, title, chapter column merged vertically, Arabic-Indic digits, headings and totals", fileName: "جدول كميات المقاول الأفق.xlsx", format: "xlsx",
      bytes: await workbook([{ name: "جدول الكميات", rtl: true, rows, merges: ["A1:G1", "A2:G2", "A5:A9", "A11:A16"] }]),
      expectedKind: "boq", expectedSheet: "جدول الكميات", expected: { 1: "code", 2: "name", 3: "unit", 4: "quantity", 5: "rate", 6: "amount" }, expectedRows: 6, minMergedFilled: 4 });
  }

  // 2. English BOQ, three sheets: cover, summary, the real table; thousands separators, units cum / sqm / nos.
  {
    const cover: SheetSpec = { name: "Cover", rows: [["Example Builders Ltd"], ["Tender submission"], ["Project: Sample Villas"], [null], ["Prepared: 2026-03-02"]] };
    const summary: SheetSpec = { name: "Summary", rows: [["Section", "Amount"], ["Civil", 1250000], ["MEP", 780000], ["Total", 2030000]] };
    const rows: SheetSpec["rows"] = [
      ["Example Builders Ltd", null, null, null, null, null], ["Bill of Quantities - Civil Works", null, null, null, null, null], [null, null, null, null, null, null],
      ["Item", "Description", "Unit", "Qty", "Rate", "Amount"],
      ["A", "Excavation", null, null, null, null],
      ["A.1", "Bulk excavation in ordinary soil", "cum", "1,200.00", "18.00", "21,600.00"],
      ["A.2", "Backfilling and compaction", "cum", "800.00", "32.50", "26,000.00"],
      ["B.1", "Reinforced concrete grade 30", "cum", "150.00", "310.00", "46,500.00"],
      ["B.2", "Formwork to columns", "sqm", "900.00", "55.00", "49,500.00"],
      ["B.3", "Anchor bolts supply and fix", "nos", "320", "12.50", "4,000.00"],
      ["Sub total", null, null, null, null, "147,600.00"],
    ];
    samples.push({ id: "boq-en-3sheets", description: "English BOQ across three sheets (cover, summary, BOQ): the right sheet is found", fileName: "Sample BOQ Civil.xlsx", format: "xlsx",
      bytes: await workbook([cover, summary, { name: "BOQ - Civil", rows, merges: ["A1:F1", "A2:F2"] }]),
      expectedKind: "boq", expectedSheet: "BOQ - Civil", expected: { 0: "code", 1: "name", 2: "unit", 3: "quantity", 4: "rate", 5: "amount" }, expectedRows: 5 });
  }

  // 3. Arabic programme with HIJRI date text in the start and finish columns.
  {
    const rows: SheetSpec["rows"] = [
      ["البرنامج الزمني لمشروع تجريبي", null, null, null, null, null], [null, null, null, null, null, null],
      ["رقم النشاط", "اسم النشاط", "المدة (يوم)", "تاريخ البداية", "تاريخ النهاية", "نسبة الإنجاز %"],
      ["A100", "تجهيز الموقع", arabicDigits(14), "١٥/٠٧/١٤٤٧هـ", "٢٩/٠٧/١٤٤٧هـ", "100%"],
      ["A110", "أعمال الحفر", arabicDigits(30), "٠١/٠٨/١٤٤٧هـ", "٠١/٠٩/١٤٤٧هـ", "60%"],
      ["A120", "صب القواعد", arabicDigits(21), "١٥/٠٨/١٤٤٧هـ", "٠٦/٠٩/١٤٤٧هـ", "0%"],
      ["A130", "أعمال الهيكل الخرساني", arabicDigits(90), "١ رمضان ١٤٤٧ هـ", "٢٩ ذو القعدة ١٤٤٧ هـ", "0%"],
    ];
    samples.push({ id: "schedule-ar-hijri", description: "Arabic programme with Hijri dates as text", fileName: "البرنامج الزمني.xlsx", format: "xlsx",
      bytes: await workbook([{ name: "البرنامج", rtl: true, rows }]), expectedKind: "schedule", expectedSheet: "البرنامج",
      expected: { 0: "activityCode", 1: "activityName", 2: "duration", 3: "plannedStartAt", 4: "plannedFinishAt", 5: "progress" }, expectedRows: 4 });
  }

  // 4. English programme with real Excel dates, a text-date column in dd/mm/yyyy and a WBS column.
  {
    const rows: SheetSpec["rows"] = [
      ["Programme of Works", null, null, null, null, null], ["Rev 2 — baseline", null, null, null, null, null], [null, null, null, null, null, null],
      ["WBS", "Activity ID", "Activity Name", "Start", "Finish", "% Complete"],
      ["1.1", "T-1010", "Mobilisation", new Date(Date.UTC(2026, 2, 1)), new Date(Date.UTC(2026, 2, 14)), 100],
      ["1.1", "T-1020", "Site survey", new Date(Date.UTC(2026, 2, 8)), new Date(Date.UTC(2026, 2, 20)), 80],
      ["1.2", "T-1030", "Excavation", new Date(Date.UTC(2026, 2, 21)), new Date(Date.UTC(2026, 3, 30)), 25],
      ["1.2", "T-1040", "Foundations", "25/04/2026", "30/06/2026", 0],
    ];
    samples.push({ id: "schedule-en-excel", description: "English programme: Excel dates mixed with dd/mm/yyyy text, WBS column", fileName: "Programme rev2.xlsx", format: "xlsx",
      bytes: await workbook([{ name: "Programme", rows }]), expectedKind: "schedule", expectedSheet: "Programme",
      expected: { 0: "wbsCode", 1: "activityCode", 2: "activityName", 3: "plannedStartAt", 4: "plannedFinishAt", 5: "progress" }, expectedRows: 4 });
  }

  // 5. Materials register as CSV in Windows-1256: units in five spellings.
  {
    const lines = ["رمز المادة,وصف المادة,الوحدة,الكمية,المورد,تاريخ التوريد", "MAT-001,خرسانة جاهزة 30 ميجا,م3,\"1,200\",شركة الإمداد التجريبية,15/03/2026", "MAT-002,حديد تسليح 16 مم,طن,48,مصنع الحديد المثال,16/03/2026", "MAT-003,بلاط سيراميك 60×60,م٢,900,مورد البلاط المثال,20/03/2026", "MAT-004,رمل ناعم,cum,300,شركة الإمداد التجريبية,21/03/2026", "MAT-005,مسامير تثبيت,عدد,5000,مورد المعدات المثال,22/03/2026"];
    samples.push({ id: "materials-csv-1256", description: "Materials register, CSV in Windows-1256", fileName: "سجل المواد.csv", format: "csv", bytes: encodeWindows1256(lines.join("\r\n")),
      expectedKind: "materials", expectedSheet: "CSV", expected: { 0: "code", 1: "description", 2: "unitOfMeasure", 3: "quantity", 4: "supplier", 5: "date" }, expectedRows: 5 });
  }

  // 6. Deliveries register in English with NO code column.
  {
    const rows: SheetSpec["rows"] = [
      ["Goods Received Log", null, null, null, null, null], [null, null, null, null, null, null],
      ["Delivery Date", "Material", "UOM", "Qty Received", "Supplier", "Spec"],
      [new Date(Date.UTC(2026, 2, 15)), "Ready-mix concrete C30", "m3", 120, "Example Supply Co", "ASTM C94"], [new Date(Date.UTC(2026, 2, 16)), "Rebar 16mm", "ton", 4.8, "Example Steel", "BS 4449"], [new Date(Date.UTC(2026, 2, 17)), "Ceramic tiles 60x60", "sqm", 900, "Example Tiles", "EN 14411"],
    ];
    samples.push({ id: "deliveries-en", description: "Deliveries log in English without a code column", fileName: "GRN log.xlsx", format: "xlsx", bytes: await workbook([{ name: "GRN", rows }]), expectedKind: "materials", expectedSheet: "GRN",
      expected: { 0: "date", 1: "description", 2: "unitOfMeasure", 3: "quantity", 4: "supplier", 5: "referenceSpecification" }, expectedRows: 3 });
  }

  // 7. Budget in Arabic.
  {
    const rows: SheetSpec["rows"] = [["ميزانية المشروع", null, null, null], [null, null, null, null], ["رمز بند الميزانية", "البيان", "الميزانية الأصلية", "الميزانية المعدلة"], ["CIV", "أعمال مدنية", "١٬٢٥٠٬٠٠٠", "١٬٣٠٠٬٠٠٠"], ["MEP", "أعمال كهروميكانيكية", "٧٨٠٬٠٠٠", "٧٨٠٬٠٠٠"], ["FIN", "أعمال التشطيبات", "٤٢٠٬٠٠٠", "٤٥٠٬٠٠٠"], ["الإجمالي", null, "٢٬٤٥٠٬٠٠٠", "٢٬٥٣٠٬٠٠٠"]];
    samples.push({ id: "budget-ar", description: "Arabic budget with Arabic thousands separators", fileName: "الميزانية.xlsx", format: "xlsx", bytes: await workbook([{ name: "الميزانية", rtl: true, rows }]), expectedKind: "budget", expectedSheet: "الميزانية",
      expected: { 0: "costCode", 1: "description", 2: "originalAmount", 3: "currentAmount" }, expectedRows: 3 });
  }

  // 8. Contracts in Arabic.
  {
    const rows: SheetSpec["rows"] = [["سجل العقود", null, null, null, null], [null, null, null, null, null], ["رقم العقد", "موضوع العقد", "المقاول", "قيمة العقد", "العملة"], ["C-001", "أعمال الهيكل الخرساني", "شركة البناء التجريبية", "٨٥٠٬٠٠٠", "ريال"], ["C-002", "أعمال الكهرباء", "مؤسسة النور المثال", "٣٢٠٬٠٠٠", "ريال"], ["C-003", "أعمال السباكة", "مؤسسة الماء المثال", "١٨٠٬٠٠٠", "SAR"]];
    samples.push({ id: "contracts-ar", description: "Contracts register in Arabic", fileName: "العقود.xlsx", format: "xlsx", bytes: await workbook([{ name: "العقود", rtl: true, rows }]), expectedKind: "contracts", expectedSheet: "العقود",
      expected: { 0: "code", 1: "title", 2: "counterparty", 3: "contractValue", 4: "currency" }, expectedRows: 3 });
  }

  // 9. Payment certificate (مستخلص): recognised, no importer.
  {
    const rows: SheetSpec["rows"] = [["مستخلص رقم ٣", null, null, null, null, null, null, null, null], ["مشروع مثال سكني — شهر مارس ٢٠٢٦", null, null, null, null, null, null, null, null], [null, null, null, null, null, null, null, null, null],
      ["رقم البند", "وصف الأعمال", "الوحدة", "كمية العقد", "الكمية السابقة", "الكمية الحالية", "الكمية التراكمية", "سعر الوحدة", "المبلغ"], ["1.1", "حفر عام", "م3", 1200, 600, 300, 900, 18, 5400], ["1.2", "ردم", "م3", 800, 200, 200, 400, 32.5, 6500], ["2.1", "خرسانة", "م3", 150, 50, 40, 90, 310, 12400], ["الاستقطاع", null, null, null, null, null, null, null, -2430]];
    samples.push({ id: "valuation-ar", description: "Payment certificate: recognised, no importer yet", fileName: "مستخلص ٣.xlsx", format: "xlsx", bytes: await workbook([{ name: "المستخلص", rtl: true, rows }]), expectedKind: "valuation", expectedSheet: "المستخلص",
      expected: { 0: "code", 1: "name", 2: "unit", 3: "quantity", 4: "previousQuantity", 5: "currentQuantity", 6: "cumulativeQuantity", 7: "rate", 8: "amount" }, expectedRows: 3 });
  }

  // 10. Daily report.
  {
    const rows: SheetSpec["rows"] = [["التقرير اليومي للموقع", null, null, null, null], [null, null, null, null, null], ["التاريخ", "عدد العمالة", "المعدات", "الطقس", "ملخص الأعمال"], ["١٥/٠٣/٢٠٢٦", 42, "حفار + قلاب", "مشمس", "حفر وردم الجزء الشمالي"], ["١٦/٠٣/٢٠٢٦", 45, "حفار + خلاطة", "مغبر", "صب قواعد المحور أ"], ["١٧/٠٣/٢٠٢٦", 40, "رافعة", "مشمس", "تركيب حديد الأعمدة"]];
    samples.push({ id: "daily-report-ar", description: "Daily site report", fileName: "تقرير يومي.xlsx", format: "xlsx", bytes: await workbook([{ name: "تقرير يومي", rtl: true, rows }]), expectedKind: "dailyReport", expectedSheet: "تقرير يومي",
      expected: { 0: "date", 1: "labour", 2: "equipment", 3: "weather", 4: "work" }, expectedRows: 3 });
  }

  // 11. Messy BOQ: a long preamble, header on row 12, no keyword anywhere, Western digits with Arabic text, mixed units, blank separators.
  {
    const preamble: SheetSpec["rows"] = Array.from({ length: 10 }, (_unused, i) => [i === 0 ? "مؤسسة الرواد التجريبية — عرض سعر" : i === 3 ? "إلى: شركة المثال للتطوير" : i === 6 ? "التاريخ: ٢٠٢٦/٠٣/٠٢" : null, null, null, null, null, null]);
    const rows: SheetSpec["rows"] = [...preamble, [null, null, null, null, null, null], ["رقم", "البيان", "الوحدة", "الكمية", "الفئة", "المبلغ"], ["1", "توريد وتركيب أبواب خشبية", "عدد", 24, 1800, 43200], [null, null, null, null, null, null], ["2", "توريد وتركيب نوافذ ألمنيوم", "م2", 160, 450, 72000], ["3", "دهانات داخلية", "م²", 2400, 22, 52800], ["4", "أعمال الجبس بورد", "م2", 600, 85, 51000]];
    samples.push({ id: "boq-ar-messy", description: "BOQ with a long preamble, no keyword, odd header words (الفئة = rate)", fileName: "عرض سعر الرواد.xlsx", format: "xlsx", bytes: await workbook([{ name: "Sheet1", rows }]), expectedKind: "boq", expectedSheet: "Sheet1",
      expected: { 0: "code", 1: "name", 2: "unit", 3: "quantity", 4: "rate", 5: "amount" }, expectedRows: 4 });
  }

  // 12. A synthetic Primavera XER (kind detection only: the importer reads it natively).
  {
    const xer = ["ERMHDR\t8.4\t2026-03-01\tProject\tadmin\tadmin\tdb\tProject Management\tUSD", "%T\tPROJWBS", "%F\twbs_id\twbs_short_name\twbs_name", "%R\t1\t1\tExample project", "%T\tTASK", "%F\ttask_id\ttask_code\ttask_name\twbs_id\ttarget_start_date\ttarget_end_date\tstatus_code", "%R\t10\tA100\tMobilise\t1\t2026-03-01 08:00\t2026-03-14 17:00\tTK_NotStart", "%E"].join("\n");
    samples.push({ id: "xer", description: "Primavera XER", fileName: "program.xer", format: "xer", bytes: new TextEncoder().encode(xer), expectedKind: null, expectedSheet: null, expected: {}, expectedRows: 0 });
  }
  return samples;
}


/**
 * A second set written AFTER the dictionary was tuned on the first: unusual spellings, typos, tatweel, an MS-Project-style export, extra unmapped columns. It exists to measure how the reader
 * does on wording it was not tuned on (the first set is the one the dictionary was shaped by, so its score flatters).
 */
export async function buildHoldoutSamples(): Promise<Sample[]> {
  const samples: Sample[] = [];
  {
    const rows: SheetSpec["rows"] = [["حصر كميات أعمال التشطيبات", null, null, null, null, null], [null, null, null, null, null, null], ["بند", "البيـــــان", "وحـده", "الكميه", "السعر الإفرادي", "القيمه"], ["١", "دهان جدران بلاستيك", "م٢", "٣٥٠٠", "١٨٫٥", "٦٤٧٥٠"], ["٢", "تركيب بلاط أرضيات", "م٢", "٢٢٠٠", "٦٥", "١٤٣٠٠٠"], ["٣", "تركيب أبواب داخلية", "عدد", "٤٠", "٩٥٠", "٣٨٠٠٠"]];
    samples.push({ id: "holdout-boq-typos", description: "Arabic BOQ with tatweel, taa-marbuta spelled as haa, 'السعر الإفرادي'", fileName: "حصر.xlsx", format: "xlsx", bytes: await workbook([{ name: "حصر", rtl: true, rows }]), expectedKind: "boq", expectedSheet: "حصر", expected: { 0: "code", 1: "name", 2: "unit", 3: "quantity", 4: "rate", 5: "amount" }, expectedRows: 3 });
  }
  {
    const rows: SheetSpec["rows"] = [["Tender BOQ", null, null, null, null, null, null], [null, null, null, null, null, null, null], ["Sl. No", "Work Description", "U/M", "Quantity", "Unit Price (SAR)", "Total Price", "Remarks"], [1, "Supply & lay interlock paving", "sq.m", 1800, 85, 153000, "Grey"], [2, "Kerb stones 100x25", "m", 640, 38, 24320, null], [3, "Manhole covers", "Nos", 22, 450, 9900, "Class D400"]];
    samples.push({ id: "holdout-boq-en-variant", description: "English BOQ: Sl. No / Work Description / U/M / Total Price + a Remarks column", fileName: "Tender BOQ.xlsx", format: "xlsx", bytes: await workbook([{ name: "BOQ", rows }]), expectedKind: "boq", expectedSheet: "BOQ", expected: { 0: "code", 1: "name", 2: "unit", 3: "quantity", 4: "rate", 5: "amount" }, expectedRows: 3 });
  }
  {
    const rows: SheetSpec["rows"] = [["ID", "Task Name", "Duration", "Start", "Finish", "% Complete", "Predecessors"], [1, "Project start", "0 days", new Date(Date.UTC(2026, 4, 3)), new Date(Date.UTC(2026, 4, 3)), 100, ""], [2, "Design approval", "20 days", new Date(Date.UTC(2026, 4, 4)), new Date(Date.UTC(2026, 4, 29)), 100, "1"], [3, "Procurement of steel", "45 days", new Date(Date.UTC(2026, 4, 30)), new Date(Date.UTC(2026, 6, 30)), 40, "2"], [4, "Erection", "60 days", new Date(Date.UTC(2026, 7, 1)), new Date(Date.UTC(2026, 9, 24)), 0, "3"]];
    samples.push({ id: "holdout-msproject", description: "MS Project style export (ID, Task Name, Duration, Start, Finish, % Complete, Predecessors)", fileName: "plan.xlsx", format: "xlsx", bytes: await workbook([{ name: "Task_Table", rows }]), expectedKind: "schedule", expectedSheet: "Task_Table", expected: { 0: "activityCode", 1: "activityName", 2: "duration", 3: "plannedStartAt", 4: "plannedFinishAt", 5: "progress" }, expectedRows: 4 });
  }
  {
    const rows: SheetSpec["rows"] = [["مخزن الموقع — وارد", null, null, null, null], [null, null, null, null, null], ["الصنف", "العدد", "الوحدة", "رقم الفاتورة", "اسم المورد"], ["اسمنت بورتلاندي", 600, "كيس", "INV-2201", "مورد الاسمنت المثال"], ["رمل مغسول", 40, "م3", "INV-2202", "مورد الرمل المثال"], ["أسياخ حديد 12مم", 12, "طن", "INV-2203", "مصنع الحديد المثال"]];
    samples.push({ id: "holdout-store-inward", description: "Store inward log with informal headers (الصنف / العدد)", fileName: "وارد المخزن.xlsx", format: "xlsx", bytes: await workbook([{ name: "وارد", rtl: true, rows }]), expectedKind: "materials", expectedSheet: "وارد", expected: { 0: "description", 1: "quantity", 2: "unitOfMeasure", 4: "supplier" }, expectedRows: 3 });
  }
  {
    const rows: SheetSpec["rows"] = [["Subcontract Register", null, null, null, null], [null, null, null, null, null], ["Subcontract No", "Description", "Subcontractor", "Contract Sum", "Currency"], ["SC-01", "Structural steel works", "Example Steel Works", "1,450,000", "SAR"], ["SC-02", "HVAC installation", "Example Cooling Co", "820,000", "SAR"], ["SC-03", "Landscaping", "Example Gardens", "260,000", "SAR"]];
    samples.push({ id: "holdout-contracts-en", description: "Subcontract register in English", fileName: "subcontracts.xlsx", format: "xlsx", bytes: await workbook([{ name: "Register", rows }]), expectedKind: "contracts", expectedSheet: "Register", expected: { 0: "code", 1: "title", 2: "counterparty", 3: "contractValue", 4: "currency" }, expectedRows: 3 });
  }
  return samples;
}

/** Windows-1256 bytes, built by inverting the decoder itself so the table cannot be mistyped. */
function encodeWindows1256(text: string): Uint8Array {
  const decoder = new TextDecoder("windows-1256");
  const reverse = new Map<string, number>();
  for (let byte = 0x80; byte <= 0xff; byte++) reverse.set(decoder.decode(Uint8Array.of(byte)), byte);
  const bytes: number[] = [];
  for (const ch of text) { const code = ch.codePointAt(0)!; bytes.push(code < 0x80 ? code : reverse.get(ch) ?? 0x3f); }
  return new Uint8Array(bytes);
}

export { grouped as _grouped };
