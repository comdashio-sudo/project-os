// @vitest-environment jsdom
import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InShellProvider, PageTitle } from "./pageFrame";

// Q-59 (4): one head for every page — its title, one line saying what it is for, its own buttons in one place, then its filter bar.
const pagesDir = path.resolve(process.cwd(), "client/src/pages");
const sources = readdirSync(pagesDir).filter(name => name.endsWith(".tsx") && !name.includes(".test.")).map(name => ({ name, text: readFileSync(path.join(pagesDir, name), "utf8") }));

afterEach(cleanup);

describe("the page template (Q-59 4)", () => {
  it("draws the title, its line, the page's buttons in one place and the filter bar under them, in that order", () => {
    render(<InShellProvider><PageTitle title="Stalled units" description="Villas that have stopped" actions={<button type="button">New</button>} filters={<label>Block<input /></label>} /></InShellProvider>);
    const head = document.querySelector("[data-page-title]")!;
    expect(head.querySelector("h1")!.textContent).toBe("Stalled units");
    expect(head.querySelector("[data-page-description]")!.textContent).toBe("Villas that have stopped");
    const order = Array.from(head.querySelectorAll("h1, [data-page-buttons], [data-page-filters]")).map(node => node.tagName === "H1" ? "title" : node.hasAttribute("data-page-buttons") ? "actions" : "filters");
    expect(order).toEqual(["title", "actions", "filters"]);
  });
  it("NEGATIVE: a page with no buttons and no filters draws neither row (no empty frame)", () => {
    render(<PageTitle title="Reports" description="Weekly and monthly" />);
    expect(document.querySelector("[data-page-buttons]")).toBeNull();
    expect(document.querySelector("[data-page-filters]")).toBeNull();
  });
  it("the pages moved to the template keep it, and no page adds a hand-made heading beyond those not moved yet (a ceiling that only goes down)", () => {
    const moved = ["ProjectReports.tsx", "ProjectImportHub.tsx", "ProjectImportKind.tsx", "ProjectSetupWizard.tsx", "ProjectSite.tsx", "ProjectTeam.tsx", "LiveSchedule.tsx", "DevPlanner.tsx", "ProjectRisks.tsx", "ProjectMeetings.tsx", "ProjectSafety.tsx", "StalledUnits.tsx", "ProjectBaseline.tsx", "WeeklyReport.tsx", "MonthlyReport.tsx", "UserGuide.tsx"];
    for (const name of moved) expect(sources.find(source => source.name === name)!.text, name).toContain("<PageTitle");
    const handMade = sources.reduce((count, source) => count + (source.text.match(/<h1[\s>]/g) ?? []).length, 0);
    expect(handMade).toBeLessThanOrEqual(28);
  });
});
