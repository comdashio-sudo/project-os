// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildExportLayout } from "./excelExport";
import { buildDailyRangeSheets, type RangeReport } from "./dailyRangeExport";

const base = (date: string, number: string, over: Partial<RangeReport> = {}): RangeReport => ({
  report: { id: number, reportNumber: number, reportDate: date, status: "approved", weather: "clear", temperatureC: "31.5", wind: "10", workHours: 9, summary: "ok", obstacles: null, reviewNote: null },
  labour: [{ companyName: "Main Co", roleName: "Mason", category: "direct", shift: "day", headcount: 12 }],
  equipment: [{ equipmentType: "Excavator", model: "X1", plateOrSize: "20t", count: 2, hours: 8 }],
  lines: [{ lineType: "work", wbsCode: "DC-01", label: "Earth works", description: null, quantity: null, hours: null, plannedQuantity: 100, actualQuantity: 90, variance: -10, reportedStatus: "in_progress" }, { lineType: "labour", wbsCode: null, label: "x", description: null, quantity: 3, hours: null, plannedQuantity: null, actualQuantity: null, variance: null, reportedStatus: null }],
  obstacleItems: [{ issue: "Rain", impact: "1 day", responsible: "PM", action: "Cover", dueDate: "2026-11-26" }],
  inspections: { wir: { items: [{ code: "WIR-1", state: "approved" }] }, rfi: { items: [{ number: "RFI-9", state: "pending" }] } },
  hse: [{ kind: "incident", description: "Slip", peopleCount: 1, actionTaken: "First aid" }],
  totals: { labour: { total: 12, direct: 12, indirect: 0, day: 12, night: 0 }, equipment: { count: 2, hours: 16 } },
  ...over,
});
const meta = { title: "t", exportedAt: new Date("2026-11-25T12:00:00Z"), locale: "en" as const };
const rowsOf = (built: ReturnType<typeof buildDailyRangeSheets>, key: string) => { const sheet = built.sheets.find(item => item.key === key)!; return buildExportLayout(sheet.columns, sheet.rows, meta); };

describe("buildDailyRangeSheets (Q-57 4)", () => {
  it("gives the seven sheets, reports in date order, the work lines only in the works sheet", () => {
    const built = buildDailyRangeSheets([base("2026-11-20", "R-2"), base("2026-11-18", "R-1")], "en");
    expect(built.sheets.map(sheet => sheet.sheetName)).toEqual(["Reports", "Labour", "Equipment", "Works", "Obstacles", "Inspections", "Safety"]);
    const reports = rowsOf(built, "reports");
    expect(reports.rows.map(row => row[1].value)).toEqual(["R-1", "R-2"]);
    expect(rowsOf(built, "works").rows).toHaveLength(2); // one work line per report, the labour line is not one
    expect(rowsOf(built, "inspections").rows.map(row => row[2].value)).toEqual(["WIR", "RFI", "WIR", "RFI"]);
    expect(rowsOf(built, "labour").rows[0].map(cell => cell.value)).toContain(12);
  });
  it("a reader without the safety and site sections gets empty sheets, never someone else's rows", () => {
    const stripped = base("2026-11-18", "R-1", { hse: [], labour: [], equipment: [], lines: [], obstacleItems: [] });
    const built = buildDailyRangeSheets([stripped], "ar");
    for (const key of ["labour", "equipment", "works", "obstacles", "safety"]) expect(rowsOf(built, key).rows).toHaveLength(0);
    expect(built.sheets[0].sheetName).toBe("التقارير");
  });
  it("a period with no report still has its seven sheets (headers only)", () => {
    const built = buildDailyRangeSheets([], "ur");
    expect(built.sheets).toHaveLength(7);
    expect(rowsOf(built, "reports").rows).toHaveLength(0);
  });
});
