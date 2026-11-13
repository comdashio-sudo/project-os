// D-26 (#187, 6.4): an exported Excel file carries Western digits in every language — no Arabic-Indic (٠-٩) or Persian (۰-۹) digit in any cell, and no number
// format that tells Excel to draw them (a «[$-...]» locale code). The pages themselves are checked after render by tests/ui/audit.mjs (a hard finding).
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildTableWorkbook } from "@/lib/excelExport";

const EASTERN = /[٠-٩۰-۹]/;
type Row = { code: string; name: string; amount: number; share: number; day: Date; units: number };
const rows: Row[] = [
  { code: "V-12", name: "فيلا مختلقة ١", amount: 1234567.891, share: 0.256, day: new Date("2026-11-13T00:00:00Z"), units: 390 },
  { code: "V-13", name: "ولا", amount: -57446.81, share: 1, day: new Date("2026-01-02T00:00:00Z"), units: 0 },
];

async function cells(locale: "ar" | "ur") {
  const bytes = await buildTableWorkbook<Row>({
    sheetName: "تقرير",
    columns: [
      { header: "الرمز", value: row => row.code }, { header: "الاسم", value: row => row.name }, { header: "المبلغ", value: row => row.amount, kind: "money" },
      { header: "النسبة", value: row => row.share, kind: "percent" }, { header: "التاريخ", value: row => row.day, kind: "date" }, { header: "الوحدات", value: row => row.units },
    ],
    rows,
    meta: { title: "تقرير مختلق", company: "شركة مختلقة", project: "مشروع مختلق", exportedAt: new Date("2026-11-13T09:15:00Z"), locale },
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const out: Array<{ address: string; text: string; numFmt: string }> = [];
  workbook.worksheets[0].eachRow(row => row.eachCell(cell => out.push({ address: cell.address, text: String(cell.text ?? ""), numFmt: String(cell.numFmt ?? "") })));
  return out;
}

describe("Excel export digits (D-26, 6.4)", () => {
  for (const locale of ["ar", "ur"] as const) {
    it(`${locale}: no cell the export writes has an Arabic-Indic or Persian digit, and no number format draws one`, async () => {
      const all = await cells(locale);
      const written = all.filter(cell => !/فيلا مختلقة/.test(cell.text)); // the one name typed with a ١ on purpose is the person's own text, kept as it is
      expect(written.length).toBeGreaterThan(15);
      expect(written.filter(cell => EASTERN.test(cell.text)).map(cell => `${cell.address}: ${cell.text}`)).toEqual([]);
      expect(all.filter(cell => /\[\$-/.test(cell.numFmt)).map(cell => `${cell.address}: ${cell.numFmt}`)).toEqual([]);
      expect(all.some(cell => /2026/.test(cell.text))).toBe(true); // the export day in the header block, in Western digits
    });
  }

  it("NEGATIVE: the check catches an Eastern digit and a locale number format", () => {
    expect(EASTERN.test("٢٠٢٦")).toBe(true);
    expect(EASTERN.test("۲۰۲۶")).toBe(true);
    expect(EASTERN.test("2026-11-13")).toBe(false);
    expect(/\[\$-/.test("[$-2000401]#,##0")).toBe(true);
  });
});
