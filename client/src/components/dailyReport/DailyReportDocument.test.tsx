/** @vitest-environment jsdom */
// Synthetic report only: invented companies, trades and figures.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DailyReportDocument, downloadWord, ReportExports, type ReportForDocument } from "./DailyReportDocument";

const pdf = vi.hoisted(() => ({ exportElementToPdf: vi.fn(async () => "daily-report-2026-10-20-2026-11-12.pdf") }));
vi.mock("@/lib/pdfExport", () => pdf);
afterEach(() => { cleanup(); vi.restoreAllMocks(); pdf.exportElementToPdf.mockClear(); });

const DATA: ReportForDocument = {
  report: { reportNumber: "DR-0007", reportDate: "2026-10-20", weather: "clear", temperatureC: "31.5", wind: "light", workHours: 10, summary: "Slab pour in block B", obstacles: null, status: "approved" },
  labour: [{ companyName: "Main Contractor Co.", roleName: "Masons", shift: "day", headcount: 1200 }, { companyName: "Main Contractor Co.", roleName: "Masons", shift: "night", headcount: 4 }],
  equipment: [{ equipmentType: "Mixer", model: null, plateOrSize: null, count: 2, hours: 8 }],
  lines: [{ lineType: "work", label: null, quantity: null, hours: null, description: "Walls", pmcUnitId: "u12", pmcActivityDefinitionId: "a1", reportedStatus: "IN_PROGRESS" }],
  inspections: { wir: { submitted: 3, approved: 1, rejected: 1, pending: 1 }, rfi: { submitted: 0, approved: 0, rejected: 0, pending: 0 } },
  materials: [{ material: "Rebar", quantity: 12.5, unit: "t", supplier: "Steel Supplier Co." }], hse: [], obstacleItems: [], tomorrow: [{ area: "B", activity: "Plaster", quantity: null, unit: null, resources: null }],
  photos: [{ id: "p1", fileName: "a.jpg" }, { id: "p2", fileName: "b.jpg" }],
  approval: { prepare: { at: new Date("2026-10-20T08:00:00Z") }, review: { at: null }, approve: { at: "2026-10-20T22:30:00Z" } },
  totals: { labour: { total: 1204, day: 1200, night: 4 }, equipment: { count: 2, hours: 16 }, cumulativeManDays: 15000 },
};
const doc = (language: "ar" | "en" | "ur" = "en") => render(<DailyReportDocument data={DATA} language={language} projectName="Villas" unitNumber={id => (id === "u12" ? "12" : "—")} activityName={id => (id === "a1" ? "Block work" : "—")} />);

describe("the daily report document (Q-9 c, D-47 b)", () => {
  it("draws sections 0 to 10 in order from the server's figures, with Western digits", () => {
    const { container } = doc();
    const titles = Array.from(container.querySelectorAll("h2")).map(node => node.textContent);
    expect(titles).toEqual(["0) Header", "1) Labour", "2) Equipment", "3) Work done", "4) Inspections", "5) Materials received", "6) Safety", "7) Obstacles", "8) Plan for tomorrow", "9) Photos", "10) Approval"]);
    const text = container.textContent ?? "";
    for (const expected of ["DR-0007", "31.5", "1,200", "Block work", "Rebar", "12.5", "Plaster", "2 photo(s)"]) expect(text).toContain(expected);
    expect(container.querySelector("[data-doc-labour-total]")?.textContent).toBe("Total: 1,204 (Day 1,200 · Night 4) · Cumulative man-days: 15,000");
    expect(text).not.toMatch(/[٠-٩]/);
    // the approval step at 22:30 UTC is the next day on site (UTC+3)
    expect(text).toContain("Done 2026-10-21");
    // a date inside right-to-left text keeps its own order (it was drawn 21-10-2026 in Arabic before)
    expect(Array.from(container.querySelectorAll('span[dir="ltr"]')).map(node => node.textContent)).toContain("2026-10-21");
  });

  it("Arabic is right-to-left with Arabic headings; Urdu takes the English words, right-to-left", () => {
    const { container } = doc("ar");
    expect(container.querySelector("article")!.getAttribute("dir")).toBe("rtl");
    expect(container.querySelector("h2")!.textContent).toBe("0) الرأس");
    expect(container.textContent).not.toMatch(/[٠-٩]/);
    cleanup();
    const urdu = doc("ur").container;
    expect(urdu.querySelector("article")!.getAttribute("dir")).toBe("rtl");
    expect(urdu.querySelector("h2")!.textContent).toBe("0) Header");
  });

  it("the Word file is the document's HTML as application/msword with an ASCII .doc name", async () => {
    const { container } = doc("ar");
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => { blobs.push(blob); return "blob:x"; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const name = downloadWord(container.querySelector("article")!, "daily-report-2026-10-20", new Date("2026-11-12T10:00:00Z"));
    expect(name).toBe("daily-report-2026-10-20-2026-11-12.doc");
    expect(blobs[0]!.type).toBe("application/msword");
    const html = await blobs[0]!.text();
    expect(html).toContain('xmlns:w="urn:schemas-microsoft-com:office:word"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("التقرير اليومي");
  });
});

describe("the export bar", () => {
  function bar(onExcel = vi.fn(async () => ({ url: "https://files.example.test/sheet.xlsx", fileName: "labour-2026-10-20.xlsx" }))) {
    const ref = { current: null as HTMLElement | null };
    const view = render(<><ReportExports language="en" fileBase="daily-report-2026-10-20" documentRef={ref} onExcel={onExcel} buttonClass="b" /><article ref={node => { ref.current = node; }}>doc</article></>);
    return { onExcel, view };
  }

  it("PDF draws the document in portrait; Excel takes the server's file", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { onExcel } = bar();
    fireEvent.click(screen.getByText("Download PDF"));
    await waitFor(() => expect(pdf.exportElementToPdf).toHaveBeenCalledWith(expect.any(HTMLElement), "daily-report-2026-10-20", "portrait"));
    await waitFor(() => screen.getByText(/Downloaded: daily-report/));
    fireEvent.click(screen.getByText("Labour sheet (Excel)"));
    await waitFor(() => expect(onExcel).toHaveBeenCalledTimes(1));
    await waitFor(() => screen.getByText("Downloaded: labour-2026-10-20.xlsx"));
  });

  it("a failed export says so and never claims a download", async () => {
    bar(vi.fn(async () => { throw new Error("PROJECT_OS_PERMISSION_DENIED"); }));
    fireEvent.click(screen.getByText("Labour sheet (Excel)"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("The export failed. Try again."));
    expect(screen.queryByText(/Downloaded:/)).toBeNull();
  });
});
