// The columns of the four operational imports that follow the Excel cycle (work order 11, item 4): actual costs, purchase orders, employees, hours.
// One table read by three places: the importer (which header means which field), the template (what the blank file shows) and the export (what a saved file looks like),
// so a column added here appears in all three and a file exported from the platform imports back with no mapping.
export const LEDGER_MODULES = ["costs", "purchaseOrders", "employees", "timeEntries"] as const;
export type LedgerModule = (typeof LEDGER_MODULES)[number];
export const isLedgerModule = (code: string): code is LedgerModule => (LEDGER_MODULES as readonly string[]).includes(code);

export type LedgerColumn = {
  key: string;
  required: boolean;
  ar: string;
  en: string;
  /** Other header spellings the importer accepts (the two headers above and the key are always accepted). */
  aliases?: string[];
  /** A closed set of values: the template offers it as a drop-down. */
  list?: string[];
  example: string;
  /** Shown in the export and accepted in a file, but a change to it is refused (the value belongs to a workflow, not to the sheet). */
  readOnly?: boolean;
};

export const ledgerColumns: Record<LedgerModule, LedgerColumn[]> = {
  // Actual costs (cost_entries, entry type "actual"). Each row names the WBS item it belongs to, or a budget line that is linked to one.
  costs: [
    { key: "wbsCode", required: false, ar: "رمز WBS", en: "WBS Code", example: "1.1" },
    { key: "costCode", required: false, ar: "رمز بند الميزانية", en: "Budget Cost Code", aliases: ["cost code", "رمز التكلفة"], example: "CIVIL" },
    { key: "category", required: false, ar: "الفئة", en: "Category", list: ["materials", "labour", "subcontract", "other"], example: "materials" },
    { key: "incurredAt", required: true, ar: "تاريخ التكلفة", en: "Cost Date", aliases: ["date", "التاريخ"], example: "2026-09-15" },
    { key: "amount", required: true, ar: "المبلغ (ريال)", en: "Amount (SAR)", aliases: ["amount", "المبلغ"], example: "12500.00" },
  ],
  // Purchase orders: always created as drafts; the approval path (submitted → approved → issued → received) stays where it is.
  purchaseOrders: [
    { key: "purchaseOrderNumber", required: true, ar: "رقم أمر الشراء", en: "PO Number", aliases: ["po number", "purchase order number", "purchase order"], example: "PO-001" },
    { key: "orderDate", required: true, ar: "تاريخ الأمر", en: "Order Date", aliases: ["date", "التاريخ"], example: "2026-09-15" },
    { key: "amount", required: true, ar: "المبلغ (ريال)", en: "Amount (SAR)", aliases: ["amount", "المبلغ"], example: "48000.00" },
    { key: "summary", required: true, ar: "الوصف", en: "Summary", aliases: ["description", "الملخص"], example: "Reinforcement steel" },
    { key: "contractCode", required: false, ar: "رمز العقد", en: "Contract Code", aliases: ["contract"], example: "CON-001" },
    { key: "supplierCode", required: false, ar: "رمز المورّد", en: "Supplier Code", aliases: ["supplier"], example: "SUP-001" },
    { key: "supplierName", required: false, ar: "اسم المورّد", en: "Supplier Name", example: "" },
    { key: "wbsCode", required: false, ar: "رمز WBS", en: "WBS Code", example: "1.1" },
    { key: "status", required: false, ar: "الحالة", en: "Status", readOnly: true, example: "draft" },
  ],
  // Employees: the working record only. Nationality and identity documents never travel through Excel; they stay on their own audited screen.
  employees: [
    { key: "employeeNumber", required: true, ar: "الرقم الوظيفي", en: "Employee Number", aliases: ["employee no", "employee id"], example: "E-1001" },
    { key: "fullName", required: true, ar: "الاسم الكامل", en: "Full Name", aliases: ["name", "الاسم"], example: "Example Employee" },
    { key: "jobTitle", required: true, ar: "المسمى الوظيفي", en: "Job Title", aliases: ["title"], example: "Site Engineer" },
    { key: "department", required: true, ar: "القسم", en: "Department", example: "Engineering" },
    { key: "hireDate", required: true, ar: "تاريخ التعيين", en: "Hire Date", aliases: ["hired"], example: "2026-01-15" },
    { key: "employmentStatus", required: false, ar: "حالة التوظيف", en: "Employment Status", aliases: ["status", "الحالة"], list: ["active", "suspended", "terminated"], example: "active" },
  ],
  // Hours: one row per employee per day, against the employee's assignment on this project. The attendance-approval rule applies exactly as on the hours screen.
  timeEntries: [
    { key: "employeeNumber", required: true, ar: "الرقم الوظيفي", en: "Employee Number", aliases: ["employee no", "employee id"], example: "E-1001" },
    { key: "workDate", required: true, ar: "تاريخ العمل", en: "Work Date", aliases: ["date", "التاريخ"], example: "2026-09-15" },
    { key: "actualHours", required: true, ar: "الساعات الفعلية", en: "Actual Hours", aliases: ["hours", "الساعات"], example: "8" },
    { key: "reportedProgressPercent", required: false, ar: "نسبة التقدم المبلَّغ بها", en: "Reported Progress %", aliases: ["progress", "progress percent", "التقدم"], example: "" },
  ],
};

/** The permission each module needs to import it: the one the screen that creates the same record asks for. (Employees and hours also need the company-level HR permission, checked on the server.) */
export const ledgerImportPermission = { costs: "project.cost.enter", purchaseOrders: "project.procurement.manage", employees: "project.hr.manage", timeEntries: "project.manage" } as const satisfies Record<LedgerModule, string>;

export const LEDGER_ID_HEADER = "__id";
export const LEDGER_VERSION_HEADER = "__version";
export const ledgerHeaders = (moduleCode: LedgerModule, locale: "ar" | "en") => ledgerColumns[moduleCode].map(column => column[locale]);
