import { describe, expect, it } from "vitest";
import { NAV_EXECUTIVE, NAV_PMO, kpiValues, levelBelow, levelHref, pickEntryLevel } from "./levels";
import { PROJECT_A, PROJECT_B, TENANT } from "@/test/levelFixtures";

const projects = [{ id: "p-b", code: "LV-02" }, { id: "p-a", code: "LV-01" }];

describe("pickEntryLevel: a person enters at the highest level they hold", () => {
  it("sends a person with the executive dashboard to the company level, even when they also hold a project", () => {
    // Two scopes at once: the company-wide executive assignment and a single project. The company wins.
    expect(pickEntryLevel({ navigationIds: [NAV_EXECUTIVE, "project-controls"], projects })).toEqual({ level: "company" });
  });

  it("sends a PMO person to the portfolio level over a single project", () => {
    expect(pickEntryLevel({ navigationIds: [NAV_PMO, "project-controls"], projects })).toEqual({ level: "portfolio" });
  });

  it("sends a project-only person to the first of their projects by code, not by the order received", () => {
    expect(pickEntryLevel({ navigationIds: ["project-controls"], projects })).toEqual({ level: "project", projectId: "p-a" });
  });

  it("gives no level to a person with no company navigation and no visible project", () => {
    expect(pickEntryLevel({ navigationIds: ["employee-registry"], projects: [] })).toBeNull();
  });

  it("never enters at the warehouse: it is reached from a project, not offered on its own", () => {
    expect(pickEntryLevel({ navigationIds: [], projects: [] })).toBeNull();
  });
});

describe("the chain of levels", () => {
  it("goes one level down at a time and ends at the warehouse", () => {
    expect(levelBelow("company")).toBe("portfolio");
    expect(levelBelow("portfolio")).toBe("project");
    expect(levelBelow("project")).toBe("warehouse");
    expect(levelBelow("warehouse")).toBeNull();
  });

  it("builds the four routes from the tenant, the project and the level", () => {
    expect(levelHref(TENANT, "company")).toBe(`/levels/${TENANT}/company`);
    expect(levelHref(TENANT, "portfolio")).toBe(`/levels/${TENANT}/portfolio`);
    expect(levelHref(TENANT, "project", "p-a")).toBe(`/levels/${TENANT}/projects/p-a`);
    expect(levelHref(TENANT, "warehouse", "p-a")).toBe(`/levels/${TENANT}/projects/p-a/warehouse`);
  });
});

describe("kpiValues: an unavailable figure is null, never zero", () => {
  it("reads the figures a project has", () => {
    expect(kpiValues(PROJECT_A)).toEqual({ profit: 120000, cpi: 0.94, spi: 0.9, vac: -57446.81, progress: 50 });
  });

  it("keeps the figures the server could not compute as null", () => {
    expect(kpiValues(PROJECT_B)).toEqual({ profit: null, cpi: null, spi: null, vac: null, progress: null });
  });
});
