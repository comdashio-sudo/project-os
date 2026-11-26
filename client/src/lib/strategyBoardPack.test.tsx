import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildStrategyBoardPack, scenarioRows, strategyWorkbook, type Forecast, type ForecastScenario } from "./strategyBoardPack";
import { deckProblems } from "./weeklyDeck";
import { weeklyDeckPptx } from "./weeklyDeckPptx";

// Q-21 (b), batch 3: the board pack prints the forecast the screen shows — the same rows, written the same way — and its files open with the same numbers.
// A synthetic three-month forecast; nothing here is computed.
const scenario = (scale: number, breakEvenMonth: number | null): ForecastScenario => ({
  months: [0, 1, 2].map(index => ({ index, revenue: 1_000_000 * scale * (index + 1), backlogRevenue: 500_000, receipts: 900_000 * scale, vatCollected: 0, outflows: 800_000, net: 100_000 * scale - 50_000, cumulative: (index + 1) * 10_000 * scale - 40_000 })),
  totals: { revenue: 6_000_000 * scale, backlogRevenue: 1_500_000, receipts: 2_700_000 * scale, outflows: 2_400_000, net: 300_000 * scale - 150_000 },
  lowestCumulative: -40_000 + 10_000 * scale, lowestMonth: 0, fundingRequired: Math.max(0, 40_000 - 10_000 * scale), breakEvenMonth,
  used: { winRate: 20 * scale }, missing: [], trace: [{ figure: "revenue", formula: "tendersPerYear / 12 × winRate × averageTenderValue", uses: ["tendersPerYear", "winRate", "averageTenderValue"] }],
});
const forecast: Forecast = {
  asOf: "2026-11-21", horizonMonths: 3,
  backlog: { scheduled: { count: 2, remainingValue: 1_500_000 }, unscheduled: { count: 1, remainingValue: 4_000_000 } },
  scenarios: { conservative: scenario(1, null), base: scenario(2, 2), optimistic: scenario(3, 1) },
  sensitivity: { winRateDelta: 5, revenueChange: { conservative: 100_000, base: 200_000, optimistic: 300_000 }, lowestCashChange: { conservative: 1_000, base: 2_000, optimistic: 3_000 } },
};
const assumptions = [{ code: "winRate", name: "Synthetic win rate", values: { conservative: 20, base: 40, optimistic: 60 } }];

describe("Q-21 (b): the board pack", () => {
  it("POSITIVE: the summary slide is the screen's rows; the slides fit; the PowerPoint opens with every slide; the workbook carries the server's numbers as numbers", async () => {
    const slides = buildStrategyBoardPack({ forecast, assumptions, language: "en", company: "Synthetic Co." });
    expect(deckProblems(slides)).toEqual([]);
    const table = slides[1].items.find(item => item.kind === "table");
    expect(table && table.kind === "table" ? table.rows.slice(1) : null).toEqual(scenarioRows(forecast, "en"));
    expect(scenarioRows(forecast, "en")[0]).toEqual(["Revenue (excl. VAT)", "6,000,000 SAR", "12,000,000 SAR", "18,000,000 SAR"]);
    expect(scenarioRows(forecast, "en")[8]).toEqual(["Cash break-even month", "Not within the horizon", "Month 3", "Month 2"]);
    const cash = slides[2].items.find(item => item.kind === "chart");
    expect(cash && cash.kind === "chart" ? cash.chart.series.map(series => series.values) : null).toEqual([[-30_000, -20_000, -10_000], [-20_000, 0, 20_000], [-10_000, 20_000, 50_000]]);

    const pptx = await JSZip.loadAsync(await weeklyDeckPptx(slides, "en"));
    expect(Object.keys(pptx.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(slides.length);

    const ExcelJS = (await import("exceljs")).default;
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await strategyWorkbook({ forecast, assumptions, language: "en" }));
    const summary = book.getWorksheet("Scenarios compared")!;
    expect(summary.getRow(2).values).toEqual([undefined, "Revenue (excl. VAT)", 6_000_000, 12_000_000, 18_000_000]);
    expect(summary.getRow(10).values).toEqual([undefined, "Cash break-even month", "Not within the horizon", 3, 2]);
    const base = book.getWorksheet("Base")!;
    expect(base.rowCount).toBe(1 + forecast.horizonMonths);
    expect(base.getRow(4).values).toEqual([undefined, 3, 6_000_000, 500_000, 1_800_000, 800_000, 150_000, 20_000]);
  });

  it("NEGATIVE: an Arabic pack keeps its figures in Western digits and says «not within the horizon» instead of a month zero; missing inputs and the unscheduled backlog are printed, not hidden", () => {
    const slides = buildStrategyBoardPack({ forecast: { ...forecast, scenarios: { ...forecast.scenarios, base: { ...forecast.scenarios.base, missing: ["overheadsMonthly"] } } }, assumptions, language: "ar", company: "شركة مختلقة" });
    const text = JSON.stringify(slides);
    expect(text).not.toMatch(/[٠-٩]/);
    expect(scenarioRows(forecast, "ar")[8][1]).toBe("لا يتحقق في الأفق");
    expect(text).toContain("overheadsMonthly");
    expect(text).toContain("4,000,000 ريال");
    expect(deckProblems(slides)).toEqual([]);
  });

  it("Q-21 limit — NEGATIVE then POSITIVE: the trace slide and the trace sheet of an Urdu or Arabic pack say each step in that language, not the server's English words", async () => {
    const slides = buildStrategyBoardPack({ forecast, assumptions, language: "ur", company: "مختلق کمپنی" });
    const text = JSON.stringify(slides);
    expect(text).toContain("آمدنی");
    expect(text).not.toContain("tendersPerYear / 12 × winRate × averageTenderValue"); // the server's English line
    const ExcelJS = (await import("exceljs")).default; const book = new ExcelJS.Workbook();
    await book.xlsx.load(await strategyWorkbook({ forecast, assumptions, language: "ar" }));
    const sheet = book.worksheets[book.worksheets.length - 1];
    expect(sheet.getRow(2).values).toEqual([undefined, "الإيراد", expect.stringContaining("يتوزّع على \u2066executionMonths\u2069"), "tendersPerYear, winRate, averageTenderValue"]);
  });
});
