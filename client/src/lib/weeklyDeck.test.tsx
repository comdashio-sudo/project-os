// D-50: the weekly deck — the same number and period on every slide, nothing over anything or past its box, long text continuing on a next slide,
// and the PowerPoint file opening with one slide per slide and native charts. Synthetic figures only.
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildWeeklyDeck, capacity, deckProblems, monthlyReportNumber, splitText, weeklyReportNumber, type DeckInput, type DeckMonthly, type Slide } from "@/lib/weeklyDeck";
import { weeklyDeckPptx } from "@/lib/weeklyDeckPptx";

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const days = ["2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];
const activity = (i: number) => ({
  code: `A-${String(i).padStart(2, "0")}`, name: `Synthetic activity ${i}`,
  period: { planned: 70 + i, actual: 60 + i, variance: -10, percentOfPlan: 86, completedUnits: i },
  cumulative: { planned: 200 + i, actual: 180 + i },
  daily: days.map(date => ({ date, planned: 10, actual: 9 })),
});

function input(overrides: Partial<DeckInput> = {}): DeckInput {
  return {
    language: "ar",
    number: weeklyReportNumber("DEMO", "2026-11-07"),
    figures: {
      period: { start: "2026-11-07", end: "2026-11-13", workingDayCount: 6 },
      reports: [{}, {}, {}, {}, {}],
      missingWorkingDays: ["2026-11-12"],
      activities: Array.from({ length: 13 }, (_, i) => activity(i + 1)),
      labour: { period: { direct: 420, indirect: 96 }, daily: days.map(date => ({ date, direct: 60, indirect: 14 })) },
      equipment: [{ equipmentType: "Excavator", daily: days.map(date => ({ date, count: 2 })) }, { equipmentType: "Crane", daily: days.map(date => ({ date, count: 1 })) }],
      quality: { wir: { A: 4, B: 1, C: 0, pending: 2 }, rfi: { submitted: 3, answered: 2, pending: 1 }, ncr: { opened: 1, closed: 0, open: 2 } },
      safety: { manHours: 4128 },
    },
    labels: { summary: "الملخص", analysis: "التحليل", outlook: "النظرة للأسبوعين القادمين" },
    texts: { summary: "أسبوع مختلق للاختبار.", analysis: "تحليل طويل ".repeat(300), outlook: "" },
    photos: Array.from({ length: 7 }, (_, i): { url: string | null; caption: string } => ({ url: PIXEL, caption: `صورة ${i + 1}` })).concat([{ url: null, caption: "بلا رابط" }]),
    logos: [PIXEL, null, PIXEL],
    parties: ["Client Co (example)", "Consultant Co (example)", null],
    mapImage: PIXEL,
    ...overrides,
  };
}
const footers = (slides: Slide[]) => slides.map(slide => slide.items.filter(item => item.kind === "text" && item.role === "footer").map(item => (item.kind === "text" ? item.text : "")));

describe("weekly deck layout", () => {
  it("puts the system's number and period on every slide, and nothing overlaps or runs past its box", () => {
    const slides = buildWeeklyDeck(input());
    expect(slides.length).toBeGreaterThanOrEqual(10);
    expect(deckProblems(slides)).toEqual([]);
    footers(slides).forEach((footer, index) => {
      expect(footer).toHaveLength(1);
      expect(footer[0]).toContain("DEMO-WR-20261107 · 2026-11-07 – 2026-11-13");
      expect(footer[0]).toContain(`${index + 1}/${slides.length}`);
    });
  });

  it("continues a long text and a long table on next slides, and leaves out an empty text and a photo without a link", () => {
    const slides = buildWeeklyDeck(input());
    const titles = slides.map(slide => slide.items.find(item => item.kind === "text" && item.role === "title")).map(item => (item?.kind === "text" ? item.text : ""));
    expect(titles.filter(title => title.startsWith("التحليل")).length).toBeGreaterThanOrEqual(2);
    expect(titles.filter(title => title.startsWith("أرقام الأسبوع"))).toHaveLength(2); // 13 activities: 10 + 3
    expect(titles.some(title => title.startsWith("النظرة"))).toBe(false);
    expect(slides.flatMap(slide => slide.items).filter(item => item.kind === "image" && item.box.w > 3 && item.box.w < 5)).toHaveLength(7);
  });

  it("NEGATIVE: the checker names a box over another, a box off the slide and text longer than its box", () => {
    const slides = buildWeeklyDeck(input());
    const broken: Slide[] = [{ items: [...slides[0].items, { kind: "text", role: "body", box: { x: 0.3, y: 7.0, w: 2, h: 0.35 }, text: "x", size: 10 }] },
      { items: [{ kind: "text", role: "body", box: { x: 12, y: 1, w: 2, h: 1 }, text: "x", size: 10 }] },
      { items: [{ kind: "text", role: "body", box: { x: 1, y: 1, w: 2, h: 0.5 }, text: "y".repeat(500), size: 14 }] }];
    const problems = deckProblems(broken);
    expect(problems.some(problem => problem.includes("overlap"))).toBe(true);
    expect(problems.some(problem => problem.includes("outside"))).toBe(true);
    expect(problems.some(problem => problem.includes("longer than its box"))).toBe(true);
  });

  it("reads from the right in Arabic and from the left in English; % of plan is the engine's percentage as it is", () => {
    const firstTwo = (slides: Slide[]) => { const slide = slides.find(item => item.items.some(box => box.kind === "text" && box.role === "heading"))!; return slide.items.filter(box => box.kind === "text" && box.role === "heading").map(box => box.box.x); };
    const [arFirst, arSecond] = firstTwo(buildWeeklyDeck(input()));
    expect(arFirst).toBeGreaterThan(arSecond);
    const [enFirst, enSecond] = firstTwo(buildWeeklyDeck(input({ language: "en" })));
    expect(enFirst).toBeLessThan(enSecond);
    expect(JSON.stringify(buildWeeklyDeck(input()))).toContain("86.0%");
    expect(JSON.stringify(buildWeeklyDeck(input()))).not.toContain("8,600");
  });

  it("splits at a space within the limit, and the number is the prefix, WR and the week's first day", () => {
    const parts = splitText("word ".repeat(100), 60);
    expect(parts.every(part => part.length <= 60)).toBe(true);
    expect(parts.join(" ").split(" ").length).toBe(100);
    expect(capacity({ x: 0, y: 0, w: 6, h: 5 }, 14)).toBeGreaterThan(500);
    expect(weeklyReportNumber(null, "2026-11-07")).toBe("WR-20261107");
  });

  it("with no work lines the figures slide says so and there is no activity chart; with no equipment there is no equipment slide", () => {
    const base = input();
    const slides = buildWeeklyDeck(input({ figures: { ...base.figures, activities: [], equipment: [] } }));
    expect(deckProblems(slides)).toEqual([]);
    expect(JSON.stringify(slides)).toContain("لا بيانات في هذه الفترة.");
    expect(slides.flatMap(slide => slide.items).filter(item => item.kind === "chart").map(item => (item.kind === "chart" ? item.chart.type : ""))).toEqual(["bar", "doughnut"]);
  });
});

describe("weekly deck as PowerPoint", () => {
  it("opens as a .pptx with one slide per slide, the number on each, and native charts", async () => {
    const slides = buildWeeklyDeck(input());
    const zip = await JSZip.loadAsync(await weeklyDeckPptx(slides, "ar"));
    const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slideFiles).toHaveLength(slides.length);
    for (const name of slideFiles) expect(await zip.file(name)!.async("string")).toContain("DEMO-WR-20261107");
    const charts = Object.keys(zip.files).filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name));
    expect(charts.length).toBe(5); // daily bars, cumulative lines, labour stack, the doughnut, equipment
    const kinds = await Promise.all(charts.map(name => zip.file(name)!.async("string")));
    expect(kinds.some(xml => xml.includes("<c:doughnutChart>"))).toBe(true);
    expect(kinds.some(xml => xml.includes("<c:lineChart>"))).toBe(true);
    expect(kinds.filter(xml => xml.includes("<c:barChart>")).length).toBe(3);
    expect(await zip.file("ppt/presentation.xml")!.async("string")).toContain('cx="12192000"'); // 16:9 wide
  });
});

describe("monthly deck (D-53 b)", () => {
  const monthly: DeckMonthly = {
    sCurve: { plannedSource: "p6", points: [{ month: "2026-09", planned: 25, actual: 20 }, { month: "2026-10", planned: 62.5, actual: 30 }, { month: "2026-11", planned: 90, actual: 55 }] },
    milestones: Array.from({ length: 12 }, (_, i) => ({ code: `M-${i + 1}`, name: `Synthetic milestone ${i + 1}`, plannedDate: "2026-11-10", actualDate: i % 2 ? "2026-11-12" : null, state: i % 2 ? "done_late" : "late", varianceDays: 2 })),
    earnedValue: { asOf: "2026-11-30", pv: 1000, ev: 900, ac: 950, bac: 5000, cv: -50, sv: -100, cpi: 0.947, spi: 0.9 },
    financialHidden: false,
  };
  const month = (overrides: Partial<DeckMonthly> = {}) => input({ number: monthlyReportNumber("DEMO", "2026-11"), monthly: { ...monthly, ...overrides }, labels: {}, texts: {}, photos: [], mapImage: null });
  const titles = (slides: Slide[]) => slides.map(slide => slide.items.find(item => item.kind === "text" && item.role === "title")).map(item => (item?.kind === "text" ? item.text : ""));

  it("adds the S-curve (planned and actual), the milestones (10 a slide) and earned value, under the month's number on every slide", () => {
    const slides = buildWeeklyDeck(month());
    expect(deckProblems(slides)).toEqual([]);
    expect(titles(slides)).toEqual(expect.arrayContaining(["أرقام الشهر", "منحنى S: المخطط (P6) والفعلي %", "المعالم", "المعالم (تابع)", "القيمة المكتسبة"]));
    const curve = slides.flatMap(slide => slide.items).find(item => item.kind === "chart" && item.chart.type === "line" && item.chart.labels[0] === "2026-09");
    expect(curve?.kind === "chart" ? curve.chart.series.map(series => series.values) : null).toEqual([[25, 62.5, 90], [20, 30, 55]]);
    expect(JSON.stringify(slides)).toContain("منجز متأخرًا");
    footers(slides).forEach(footer => expect(footer[0]).toContain("DEMO-MR-202611 · 2026-11-07 – 2026-11-13"));
  });

  it("NEGATIVE: no P6 schedule draws the actual line only and says why; hidden finance shows no figure; no snapshot says so", () => {
    const noPlan = buildWeeklyDeck(month({ sCurve: { plannedSource: null, points: monthly.sCurve.points.map(point => ({ ...point, planned: null })) } }));
    expect(deckProblems(noPlan)).toEqual([]);
    const line = noPlan.flatMap(slide => slide.items).find(item => item.kind === "chart" && item.chart.labels[0] === "2026-09");
    expect(line?.kind === "chart" ? line.chart.series.map(series => series.name) : null).toEqual(["الفعلي"]);
    expect(JSON.stringify(noPlan)).toContain("لا جدول P6 مستورد");
    const hidden = JSON.stringify(buildWeeklyDeck(month({ earnedValue: null, financialHidden: true })));
    expect(hidden).toContain("مخفية: تحتاج صلاحية الاطلاع المالي.");
    expect(hidden).not.toContain("\"CPI\"");
    expect(JSON.stringify(buildWeeklyDeck(month({ earnedValue: null })))).toContain("لا لقطة قيمة مكتسبة");
    expect(monthlyReportNumber(null, "2026-01")).toBe("MR-202601");
  });

  it("opens as a .pptx whose slides all carry the month's number, with the S-curve as a native line chart", async () => {
    const slides = buildWeeklyDeck(month());
    const zip = await JSZip.loadAsync(await weeklyDeckPptx(slides, "en"));
    const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slideFiles).toHaveLength(slides.length);
    for (const name of slideFiles) expect(await zip.file(name)!.async("string")).toContain("DEMO-MR-202611");
    const charts = await Promise.all(Object.keys(zip.files).filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name)).map(name => zip.file(name)!.async("string")));
    expect(charts.filter(xml => xml.includes("<c:lineChart>")).length).toBe(2); // the S-curve and the weekly cumulative %
  });
});

