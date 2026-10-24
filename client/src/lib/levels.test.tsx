import { describe, expect, it } from "vitest";
import { kpiValues, levelBelow, levelHref } from "./levels";
import { PROJECT_A, PROJECT_B, TENANT } from "@/test/levelFixtures";

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
