// Q-51 batch 1: «كراسة بيانات المشروع» — one Excel file a company fills with what a new project needs (or what an existing one lacks) and uploads at once.
// Every sheet is built from the field table of the importer that will read it (pmcImport, dataImport, boqFile): the columns, which of them are required,
// and the header each importer accepts come from there, not from a copy, so the workbook and its importers cannot drift apart. A sheet whose data no
// importer reads yet (the project's own data, its models, its team) has its table here, next to the others, and the workbook's reader will use it too.
// Layout of a data sheet: row 1 the Arabic header, row 2 the English header (both accepted by the importer), row 3 what to write (in the reader's
// language), rows 4–5 two made-up examples marked «مثال / Example» in column A (never imported), data from row 6. Column A is the row's kind.
// Required columns are indigo, optional ones light; a key cell left empty on a row that has data turns red, a repeated key turns amber; the activities
// sheet shows each model's weight total (rows with an activity code only), which must be 100. A hidden sheet «_dashio» names the version — only to
// recognise the file: the reader trusts its own tables, never the uploaded file's.
import ExcelJS from "exceljs";
import { BOQ_HEADERS } from "./boqFile";
import { importModuleFields } from "./dataImport";
import { pmcImportFields } from "./pmcImport";
import { importTemplateHeaders } from "@shared/importTemplateHeaders";

export const PROJECT_WORKBOOK_VERSION = "dashio-project-workbook/1";
export type WorkbookLocale = "ar" | "en" | "ur";
export type WorkbookColumn = { key: string; required: boolean; ar: string; en: string; list?: string };
export type WorkbookSheet = { key: string; ar: string; en: string; ur: string; columns: WorkbookColumn[]; keys: string[]; examples: Array<Record<string, string | number>> };

const ARABIC = /[؀-ۿ]/;
const title = (text: string) => text.replace(/\b[a-z]/g, letter => letter.toUpperCase());
/** The importer's own accepted headers give the two header rows: its first Arabic one and its first other one. */
const fromAliases = (field: { key: string; required: boolean; aliases: readonly string[] }): WorkbookColumn => ({
  key: field.key, required: field.required,
  ar: field.aliases.find(alias => ARABIC.test(alias)) ?? field.key,
  en: title(field.aliases.find(alias => !ARABIC.test(alias)) ?? field.key),
});
const pmc = (kind: Parameters<typeof pmcImportFields>[0], only?: string[]) => pmcImportFields(kind).filter(field => !only || only.includes(field.key)).map(fromAliases);
const general = (moduleCode: keyof typeof importTemplateHeaders) => importModuleFields(moduleCode).map((field, index) => ({ key: field.key, required: field.required, ar: importTemplateHeaders[moduleCode].ar[index], en: importTemplateHeaders[moduleCode].en[index] }));
const own = (key: string, required: boolean, ar: string, en: string, list?: string): WorkbookColumn => ({ key, required, ar, en, list });

// The lists the drop-downs offer (sheet «القوائم»): one column each.
export const WORKBOOK_LISTS: Record<string, string[]> = {
  status: ["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE"],
  currency: ["SAR"],
  scope: ["project", "company"],
  role: ["PROJECT_MANAGER", "PLANNING_ENGINEER", "SITE_ENGINEER", "QA_QC_MANAGER", "HSE_MANAGER", "COST_CONTROLLER", "PROJECT_COORDINATOR", "WAREHOUSE_CUSTODIAN", "PROCUREMENT_OFFICER"],
};

const withList = (columns: WorkbookColumn[], key: string, list: string) => columns.map(column => (column.key === key ? { ...column, list } : column));

/** The thirteen data sheets, in the order the reader will apply them (models → units → activities → …). */
export function projectWorkbookSheets(): WorkbookSheet[] {
  return [
    { key: "project", ar: "1 بيانات المشروع", en: "1 Project", ur: "1 پروجیکٹ", keys: ["code"], columns: [
      own("code", true, "رمز المشروع", "Project Code"), own("name", true, "اسم المشروع", "Project Name"), own("contractValue", true, "قيمة العقد", "Contract Value"),
      own("currency", true, "العملة", "Currency", "currency"), own("plannedStartAt", true, "تاريخ البداية المخطط", "Planned Start"), own("plannedFinishAt", true, "تاريخ النهاية المخطط", "Planned Finish"),
      own("location", false, "الموقع", "Location"), own("clientName", false, "المالك", "Client"), own("consultantName", false, "الاستشاري", "Consultant"), own("contractorName", false, "المقاول", "Contractor"),
    ], examples: [{ code: "EX-001", name: "مشروع مثال", contractValue: 25000000, currency: "SAR", plannedStartAt: "2027-01-01", plannedFinishAt: "2028-06-30", clientName: "مالك مختلق" }] },
    { key: "models", ar: "2 النماذج", en: "2 Models", ur: "2 ماڈل", keys: ["modelCode"], columns: [own("modelCode", true, "رمز النموذج", "Model Code"), own("modelName", false, "اسم النموذج", "Model Name")],
      examples: [{ modelCode: "A", modelName: "فيلا نموذج A" }, { modelCode: "B", modelName: "فيلا نموذج B" }] },
    { key: "units", ar: "3 الوحدات", en: "3 Units", ur: "3 یونٹس", keys: ["unitNumber"], columns: withList(pmc("locations"), "modelCode", "models"),
      examples: [{ blockCode: "B1", unitNumber: 1, modelCode: "A" }, { blockCode: "B1", unitNumber: 2, modelCode: "B" }] },
    { key: "activities", ar: "4 الأنشطة والأوزان", en: "4 Activities and weights", ur: "4 سرگرمیاں اور وزن", keys: ["modelCode", "activityCode"], columns: withList(pmc("catalog"), "modelCode", "models"),
      examples: [{ modelCode: "A", groupCode: "STR", stageCode: "S1", activityCode: "A-01", activityName: "صب الأسقف", activityNameEn: "Slab casting", weightPercent: 60 }, { modelCode: "A", groupCode: "FIN", stageCode: "S2", activityCode: "A-02", activityName: "الدهان", activityNameEn: "Painting", weightPercent: 40 }] },
    { key: "baseline", ar: "5 خط الأساس", en: "5 Baseline", ur: "5 بیس لائن", keys: ["modelCode", "activityCode"], columns: withList(pmc("baselineDates"), "modelCode", "models"),
      examples: [{ modelCode: "A", activityCode: "A-01", startDate: "2027-01-01", endDate: "2027-03-31" }, { modelCode: "A", activityCode: "A-02", startDate: "2027-04-01", endDate: "2027-05-31" }] },
    { key: "boq", ar: "6 جدول الكميات", en: "6 BOQ", ur: "6 BOQ", keys: ["code"], columns: Object.entries(BOQ_HEADERS).map(([key, aliases]) => fromAliases({ key, required: true, aliases })),
      examples: [{ code: "BOQ-01", description: "حفر (مثال)", unitOfMeasure: "m3", quantity: 1200, unitRate: 18.5 }, { code: "BOQ-02", description: "خرسانة عادية (مثال)", unitOfMeasure: "m3", quantity: 85, unitRate: 320 }] },
    { key: "budget", ar: "7 الميزانية", en: "7 Budget", ur: "7 بجٹ", keys: ["costCode"], columns: general("budget"), examples: [{ costCode: "CIVIL", originalAmount: 500000, currentAmount: 525000 }] },
    { key: "contracts", ar: "8 العقود", en: "8 Contracts", ur: "8 معاہدے", keys: ["code"], columns: withList(general("contracts"), "currency", "currency"),
      examples: [{ code: "CON-001", title: "عقد الأعمال المدنية", counterparty: "مقاول مختلق", contractValue: 2500000, currency: "SAR" }] },
    { key: "materials", ar: "9 المواد", en: "9 Materials", ur: "9 مواد", keys: ["code"], columns: general("materials"),
      examples: [{ code: "MAT-CONC-40", description: "خرسانة إنشائية", unitOfMeasure: "m3", category: "خرسانة" }] },
    { key: "team", ar: "10 الفريق", en: "10 Team", ur: "10 ٹیم", keys: ["email"], columns: [own("email", true, "البريد", "E-mail"), own("roleCode", true, "الدور", "Role", "role"), own("scope", true, "النطاق", "Scope", "scope"), own("name", false, "الاسم", "Name")],
      examples: [{ email: "engineer@team.example.test", roleCode: "SITE_ENGINEER", scope: "project", name: "مهندس مختلق" }] },
    { key: "status", ar: "11 حالة التنفيذ الحالية", en: "11 Current progress", ur: "11 موجودہ پیش رفت", keys: ["unitNumber", "activityCode"], columns: withList(pmc("status"), "status", "status"),
      examples: [{ unitNumber: 1, activityCode: "A-01", status: "COMPLETE" }, { unitNumber: 1, activityCode: "A-02", status: "IN_PROGRESS" }] },
    { key: "requests", ar: "12 طلبات الاستلام السابقة", en: "12 Past inspection requests", ur: "12 سابقہ معائنہ درخواستیں", keys: ["requestCode"], columns: pmc("requests"),
      examples: [{ requestCode: "WIR-001", activityCode: "A-01", unitNumbers: "1", requestedAt: "2027-01-10" }] },
    { key: "stock", ar: "13 أرصدة المستودع", en: "13 Opening stock", ur: "13 ابتدائی اسٹاک", keys: ["warehouseCode", "materialCode"], columns: general("openingBalances"),
      examples: [{ warehouseCode: "WH-01", materialCode: "MAT-CONC-40", quantity: 120, unitCost: 310 }] },
  ];
}

const T = {
  ar: { readme: "اقرأني", lists: "القوائم", kind: "نوع الصف", example: "مثال", required: "إلزامي", optional: "اختياري", total: "مجموع الأوزان لكل نموذج (يجب أن يكون 100)",
    lines: ["كراسة بيانات المشروع من داشيو: املأ ما لديك من الأوراق ثم ارفع الملف كله من صفحة الاستيراد.", "الأوراق تُقرأ بالترتيب: النماذج ثم الوحدات ثم الأنشطة ثم الباقي.", "الصفان الأولان في كل ورقة عنوانا العمود بالعربية والإنجليزية، والثالث ما يُكتب فيه. لا تغيّر العناوين.", "الصفوف المكتوب في عمودها الأول «مثال» لا تُستورد أبدًا؛ اكتب بياناتك تحتها.", "العمود النيلي إلزامي والفاتح اختياري. الخلية الحمراء مفتاح ناقص في صف فيه بيانات، والكهرمانية مفتاح مكرر.", "ورقة بخطأ لا يُحفظ منها شيء، والأوراق السليمة تُعتمد. إعادة الرفع تحدّث ولا تكرر.", "الفريق: لا تُرسل أي دعوة إلا بعد تأكيد منفصل."],
    hint: { required: "إلزامي", optional: "اختياري", date: "تاريخ بصيغة 2027-01-31", number: "رقم", percent: "نسبة من 100", list: "اختر من القائمة" } },
  en: { readme: "Read me", lists: "Lists", kind: "Row kind", example: "Example", required: "Required", optional: "Optional", total: "Weight total per model (must be 100)",
    lines: ["The Dashio project workbook: fill the sheets you have, then upload the whole file from the import page.", "The sheets are read in order: models, then units, then activities, then the rest.", "The first two rows of each sheet are the column's header in Arabic and English, the third says what goes in it. Do not change the headers.", "Rows whose first column says «Example» are never imported; write your data below them.", "An indigo column is required, a light one optional. A red cell is a missing key on a row with data; an amber one a repeated key.", "A sheet with an error saves nothing; the sound sheets are applied. Uploading again updates, never duplicates.", "Team: no invitation is sent until you confirm it separately."],
    hint: { required: "Required", optional: "Optional", date: "Date as 2027-01-31", number: "Number", percent: "Percentage of 100", list: "Choose from the list" } },
  ur: { readme: "پہلے پڑھیں", lists: "فہرستیں", kind: "قطار کی قسم", example: "مثال", required: "لازمی", optional: "اختیاری", total: "ہر ماڈل کے وزن کا مجموعہ (100 ہونا چاہیے)",
    lines: ["Dashio کی پروجیکٹ ورک بک: جو شیٹس آپ کے پاس ہیں بھریں، پھر پوری فائل درآمد کے صفحے سے اپ لوڈ کریں۔", "شیٹس ترتیب سے پڑھی جاتی ہیں: ماڈل، پھر یونٹس، پھر سرگرمیاں، پھر باقی۔", "ہر شیٹ کی پہلی دو قطاریں عربی اور انگریزی میں کالم کا عنوان ہیں، تیسری بتاتی ہے کہ اس میں کیا لکھیں۔ عنوانات نہ بدلیں۔", "جن قطاروں کے پہلے کالم میں «مثال» لکھا ہے وہ کبھی درآمد نہیں ہوتیں؛ اپنا ڈیٹا ان کے نیچے لکھیں۔", "نیلا کالم لازمی ہے، ہلکا اختیاری۔ سرخ خانہ ڈیٹا والی قطار میں غائب کلید ہے؛ کہربائی دہرائی گئی کلید۔", "غلطی والی شیٹ سے کچھ محفوظ نہیں ہوتا؛ درست شیٹس لاگو ہوتی ہیں۔ دوبارہ اپ لوڈ اپ ڈیٹ کرتا ہے، دہراتا نہیں۔", "ٹیم: الگ تصدیق کے بغیر کوئی دعوت نہیں بھیجی جاتی۔"],
    hint: { required: "لازمی", optional: "اختیاری", date: "تاریخ 2027-01-31 کی شکل میں", number: "عدد", percent: "100 میں سے فیصد", list: "فہرست سے منتخب کریں" } },
} as const;

const DATE_KEYS = /At$|Date$/; const NUMBER_KEYS = /Value$|Amount$|quantity|unitRate|unitCost|unitWeight|unitNumber/; const PERCENT_KEYS = /weightPercent|plannedPercent/;
/** Review of #531: the columns that hold a number (an amount, a quantity, a rate, a weight). Every other column — a code above all — stays text, so «007» is never «7». */
export const isNumberColumn = (key: string) => NUMBER_KEYS.test(key) || PERCENT_KEYS.test(key);
const hintOf = (column: WorkbookColumn, locale: WorkbookLocale) => {
  const hint = T[locale].hint;
  const kind = column.list ? hint.list : DATE_KEYS.test(column.key) ? hint.date : PERCENT_KEYS.test(column.key) ? hint.percent : NUMBER_KEYS.test(column.key) ? hint.number : "";
  return [column.required ? hint.required : hint.optional, kind].filter(Boolean).join(" · ");
};
export const FIRST_DATA_ROW = 6; const LAST_ROW = 2000;
const INDIGO = "FF3730A3"; const LIGHT = "FFE0E7FF"; const RED = "FFFCA5A5"; const AMBER = "FFFDE68A";
const letter = (index: number) => { let n = index; let out = ""; while (n > 0) { const m = (n - 1) % 26; out = String.fromCharCode(65 + m) + out; n = Math.floor((n - 1) / 26); } return out; };

/** Builds the workbook in a language (the read-me, the third header row and the sheet names follow it; the two header rows are always Arabic and English). */
export async function buildProjectWorkbook(input: { locale: WorkbookLocale }) {
  const t = T[input.locale]; const rtl = input.locale !== "en";
  const book = new ExcelJS.Workbook(); book.creator = "Dashio";
  const sheets = projectWorkbookSheets();
  const readme = book.addWorksheet(t.readme, { views: [{ rightToLeft: rtl }] });
  readme.getColumn(1).width = 110;
  t.lines.forEach((line, index) => { readme.getCell(index + 1, 1).value = line; });
  sheets.forEach((sheet, index) => { readme.getCell(t.lines.length + 2 + index, 1).value = sheet[input.locale]; });

  const lists = book.addWorksheet(t.lists, { views: [{ rightToLeft: rtl }] });
  const listRange: Record<string, string> = {};
  Object.entries(WORKBOOK_LISTS).forEach(([name, values], index) => {
    const col = letter(index + 1); lists.getCell(`${col}1`).value = name;
    values.forEach((value, row) => { lists.getCell(`${col}${row + 2}`).value = value; });
    listRange[name] = `'${t.lists}'!$${col}$2:$${col}$${values.length + 1}`;
  });

  for (const sheet of sheets) {
    const ws = book.addWorksheet(sheet[input.locale], { views: [{ rightToLeft: rtl, state: "frozen", ySplit: 3 }] });
    const header = [t.kind, ...sheet.columns.map(column => column.ar)];
    ws.getRow(1).values = header; ws.getRow(2).values = [t.kind, ...sheet.columns.map(column => column.en)]; ws.getRow(3).values = ["", ...sheet.columns.map(column => hintOf(column, input.locale))];
    sheet.columns.forEach((column, index) => {
      const col = index + 2; ws.getColumn(col).width = Math.max(14, column.ar.length + 4, column.en.length + 2);
      for (const row of [1, 2]) { const cell = ws.getCell(row, col); cell.font = { bold: true, color: { argb: column.required ? "FFFFFFFF" : "FF1E1B4B" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: column.required ? INDIGO : LIGHT } }; }
      ws.getCell(3, col).font = { italic: true, color: { argb: "FF475569" } };
      const listName = column.list === "models" ? undefined : column.list;
      const formula = column.list === "models" ? `'${sheets[1][input.locale]}'!$B$${FIRST_DATA_ROW - 2}:$B$${LAST_ROW}` : listName ? listRange[listName] : undefined;
      if (formula) for (let row = FIRST_DATA_ROW - 2; row <= Math.min(LAST_ROW, FIRST_DATA_ROW + 300); row++) ws.getCell(row, col).dataValidation = { type: "list", allowBlank: true, formulae: [formula] };
    });
    ws.getColumn(1).width = 12;
    sheet.examples.forEach((example, index) => {
      const row = ws.getRow(FIRST_DATA_ROW - 2 + index);
      row.values = [t.example, ...sheet.columns.map(column => example[column.key] ?? null)];
      row.font = { italic: true, color: { argb: "FF64748B" } };
    });
    // a key left empty on a row that has data is red; a repeated key (all its parts together) amber — on data rows only, never on the examples
    const lastCol = letter(sheet.columns.length + 1); const range = (col: string) => `$${col}$${FIRST_DATA_ROW}:$${col}$${LAST_ROW}`;
    const keyCols = sheet.keys.map(key => letter(sheet.columns.findIndex(column => column.key === key) + 2));
    for (const col of keyCols) ws.addConditionalFormatting({ ref: `${col}${FIRST_DATA_ROW}:${col}${LAST_ROW}`, rules: [{ type: "expression", priority: 1, formulae: [`AND(${col}${FIRST_DATA_ROW}="",COUNTA($B${FIRST_DATA_ROW}:$${lastCol}${FIRST_DATA_ROW})>0)`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED } } } }] });
    const repeated = `AND(${keyCols.map(col => `${col}${FIRST_DATA_ROW}<>""`).join(",")},COUNTIFS(${keyCols.map(col => `${range(col)},${col}${FIRST_DATA_ROW}`).join(",")})>1)`;
    ws.addConditionalFormatting({ ref: `${keyCols[0]}${FIRST_DATA_ROW}:${keyCols[keyCols.length - 1]}${LAST_ROW}`, rules: [{ type: "expression", priority: 2, formulae: [repeated], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: AMBER } } } }] });
    if (sheet.key === "activities") {
      // each model's weight total, from the rows that have an activity code (the importer counts the same rows)
      const model = letter(sheet.columns.findIndex(column => column.key === "modelCode") + 2); const code = letter(sheet.columns.findIndex(column => column.key === "activityCode") + 2); const weight = letter(sheet.columns.findIndex(column => column.key === "weightPercent") + 2);
      const at = sheet.columns.length + 3; ws.getCell(1, at).value = t.total; ws.getCell(1, at).font = { bold: true }; ws.getColumn(at).width = 16; ws.getColumn(at + 1).width = 10;
      for (let index = 0; index < 50; index++) {
        const modelRow = FIRST_DATA_ROW + index; const modelsRef = `'${sheets[1][input.locale]}'!B${modelRow}`;
        ws.getCell(2 + index, at).value = { formula: `IF(${modelsRef}="","",${modelsRef})` };
        ws.getCell(2 + index, at + 1).value = { formula: `IF(${modelsRef}="","",SUMIFS(${range(weight)},${range(model)},${modelsRef},${range(code)},"<>"))` };
      }
    }
  }
  const meta = book.addWorksheet("_dashio", { state: "veryHidden" });
  meta.getCell("A1").value = PROJECT_WORKBOOK_VERSION; meta.getCell("A2").value = input.locale;
  const bytes = Buffer.from(await book.xlsx.writeBuffer());
  return { bytes, fileName: `dashio-project-workbook-${input.locale}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}
