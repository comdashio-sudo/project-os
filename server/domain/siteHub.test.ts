import { describe, expect, it } from "vitest";
import { DAILY_REPORT_READERS, IMPORT_HUB_PAGES, IMPORT_HUB_READERS, PAGE_ACCESS, REPORTS_HUB_PAGES, REPORTS_HUB_READERS, SITE_HUB_PAGES, SITE_HUB_READERS, pageAllowed } from "../../shared/pageAccess";
import { READ_PERMISSIONS } from "../siteReports";

// Q-36 (step 2 b): the side menu's «الموقع والتنفيذ» item, the entry page's gate and each card's gate read one table, so the entry is shown exactly to whoever
// may open at least one of its four pages — no more (a link the server refuses), no fewer (a page nobody can reach).
describe("Q-36 (2 b): the site entry's readers", () => {
  it("each of the four pages has a single «any of» group, so the entry's readers are exactly their union", () => {
    for (const page of SITE_HUB_PAGES) expect(PAGE_ACCESS[page]).toHaveLength(1);
    expect([...SITE_HUB_READERS].sort()).toEqual(Array.from(new Set(SITE_HUB_PAGES.flatMap(page => [...PAGE_ACCESS[page][0]]))).sort());
  });
  it("the daily report card's gate is the server's own read check (server/siteReports.ts READ_PERMISSIONS)", () => {
    expect(READ_PERMISSIONS).toBe(DAILY_REPORT_READERS);
    expect(PAGE_ACCESS.dailyReport).toEqual([DAILY_REPORT_READERS]);
  });
  it("POSITIVE and NEGATIVE: one code of any card opens the entry; a code of none (the warehouse keeper's) opens no card", () => {
    const opens = (codes: string[]) => SITE_HUB_PAGES.filter(page => pageAllowed(page, group => group.some(code => codes.includes(code))));
    expect(opens(["project.qc.receive"])).toEqual(["dailyReport"]);
    expect(opens(["project.pmc.read"])).toEqual(["progress", "qc", "stalled", "progressLog"]); // Q-70 (1): the progress log is a card for the same reader
    expect(opens(["project.inventory.manage"])).toEqual([]);
    expect(SITE_HUB_READERS).not.toContain("project.inventory.manage");
  });
});

describe("Q-36 (2 c): the reports entry's readers", () => {
  it("each report page has a single «any of» group — the weekly and monthly ones the daily report's own readers — and the entry's readers are their union", () => {
    for (const page of REPORTS_HUB_PAGES) expect(PAGE_ACCESS[page]).toHaveLength(1);
    expect(PAGE_ACCESS.weeklyReport).toEqual([DAILY_REPORT_READERS]);
    expect(PAGE_ACCESS.monthlyReport).toEqual([DAILY_REPORT_READERS]);
    expect([...REPORTS_HUB_READERS].sort()).toEqual(Array.from(new Set(REPORTS_HUB_PAGES.flatMap(page => [...PAGE_ACCESS[page][0]]))).sort());
  });
  it("NEGATIVE: the warehouse keeper's code opens no report", () => {
    expect(REPORTS_HUB_PAGES.filter(page => pageAllowed(page, group => group.includes("project.inventory.manage")))).toEqual([]);
  });
});

describe("Q-36 (3 c): the import entry's readers", () => {
  it("each page an import card leads to has a single «any of» group, and the entry's readers are their union", () => {
    for (const page of IMPORT_HUB_PAGES) expect(PAGE_ACCESS[page]).toHaveLength(1);
    expect([...IMPORT_HUB_READERS].sort()).toEqual(Array.from(new Set(IMPORT_HUB_PAGES.flatMap(page => [...PAGE_ACCESS[page][0]]))).sort());
  });
  it("NEGATIVE: the warehouse keeper's code opens none of them", () => {
    expect(IMPORT_HUB_PAGES.filter(page => pageAllowed(page, group => group.includes("project.inventory.manage")))).toEqual([]);
  });
});

