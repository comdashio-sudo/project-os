// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Q-61 (3): the stage mapping shows what schedule.stageMapping returned, suggests by name, and saves only the groups a person changed. Synthetic data only.
const h = vi.hoisted(() => ({ data: undefined as unknown, queryError: null as unknown, can: new Set<string>(), save: vi.fn(), saveError: null as unknown }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/lib/permissions", () => ({ useCan: (permission: string) => h.can.has(permission) }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: ({ options, value, onValueChange, disabled, "aria-label": label }: { options: Array<{ value: string; label: string }>; value: string; onValueChange: (value: string) => void; disabled?: boolean; "aria-label"?: string }) => (
  <select aria-label={label} disabled={disabled} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ schedule: { stageMapping: { invalidate: vi.fn() } } }),
  schedule: {
    stageMapping: { useQuery: (_: unknown, options: { enabled: boolean }) => ({ data: options.enabled && !h.queryError ? h.data : undefined, error: options.enabled ? h.queryError : null, refetch: vi.fn() }) },
    saveStageMapping: { useMutation: () => ({ mutate: h.save, isPending: false, error: h.saveError }) },
  },
} }));

import { ScheduleStageMapping } from "./ScheduleStageMapping";

const view = {
  stages: [{ code: "Q02", name: "Substructure works", activities: 4, villas: 2 }, { code: "Q06", name: "Roof installation", activities: 2, villas: 2 }, { code: "Q20", name: "Boundary fences", activities: 2, villas: 2 }],
  groups: [
    { id: "g1", code: "Q01", name: "أعمال الأساسات", nameEn: "Substructure", weight: 8, link: null, suggestion: { groupId: "g1", stageCode: "Q02", score: 0.67 } },
    { id: "g5", code: "Q05", name: "إنتاج المصنع", nameEn: "Factory production", weight: 26.5, link: null, suggestion: null },
    { id: "g7", code: "Q07", name: "الأسوار", nameEn: "Boundary fences", weight: 3, link: { groupId: "g7", stageCodes: ["Q20"], anchor: "span", suggestedScore: 1 }, suggestion: null },
  ],
  readiness: { ready: false, unlinked: ["Q01", "Q05"], stale: [], stagesWithoutGroup: ["Q02", "Q06"] },
  differences: { activities: 10, unlinkedActivities: 1, villasMatched: 2, missingInProject: [999], withoutActivities: [702], mismatches: [{ unitNumber: 607, field: "model", schedule: "type D", project: "C", activities: 2 }] },
};
afterEach(() => { cleanup(); h.save.mockReset(); h.saveError = null; h.queryError = null; });

describe("ScheduleStageMapping (Q-61 (3))", () => {
  it("hidden for someone without project.pmc.read", () => {
    h.data = view; h.can = new Set();
    render(<ScheduleStageMapping tenantId="t" projectId="p" />);
    expect(document.querySelector("[data-stage-mapping]")).toBeNull();
  });

  it("a reader sees the groups, the unlinked weighted groups, the suggestion and Q-61 (2)'s differences, and cannot change or save", () => {
    h.data = view; h.can = new Set(["project.pmc.read"]);
    render(<ScheduleStageMapping tenantId="t" projectId="p" />);
    expect(Array.from(document.querySelectorAll("[data-group]")).map(node => node.getAttribute("data-group"))).toEqual(["Q01", "Q05", "Q07"]);
    expect(document.querySelector("[data-stage-mapping-readiness]")!.getAttribute("data-stage-mapping-readiness")).toBe("not-ready");
    expect(screen.getByText("Q01, Q05")).toBeTruthy();
    expect(document.querySelector('[data-suggestion="Q02"]')).toBeTruthy();
    expect(document.querySelector("[data-stage-mapping-readonly]")).toBeTruthy();
    expect(document.querySelector("[data-save-stage-mapping]")).toBeNull();
    expect(document.querySelector('[data-group="Q07"] [data-linked]')!.getAttribute("data-linked")).toBe("Q20");
    expect(document.querySelector("[data-edit-group]")).toBeNull();
    expect(document.querySelector("input[type=checkbox]")).toBeNull();
    expect(document.querySelector('[data-mismatch="607"]')!.textContent).toContain("type D");
  });

  it("an editor applies the suggestions, links factory production at the start of one stage, and saves only the changed groups", () => {
    h.data = view; h.can = new Set(["project.pmc.read", "project.pmc.manage"]);
    render(<ScheduleStageMapping tenantId="t" projectId="p" />);
    fireEvent.click(document.querySelector("[data-apply-suggestions]")!);
    fireEvent.click(document.querySelector('[data-edit-group="Q05"]')!);
    const factory = document.querySelector('[data-group="Q05"]')!;
    fireEvent.change(factory.querySelector("select")!, { target: { value: "start" } });
    const boxes = factory.querySelectorAll("input[type=checkbox]");
    fireEvent.click(boxes[1]); // Q06
    fireEvent.click(boxes[2]); // Q20: a start link keeps one stage, so Q20 replaces Q06
    fireEvent.click(document.querySelector("[data-save-stage-mapping]")!);
    expect(h.save).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", links: [
      { groupId: "g1", stageCodes: ["Q02"], anchor: "span" },
      { groupId: "g5", stageCodes: ["Q20"], anchor: "start" },
    ] });
  });

  it("NEGATIVE: the server's refusal is shown in the page's language, by its code", () => {
    h.data = view; h.can = new Set(["project.pmc.read", "project.pmc.manage"]);
    h.saveError = { message: "x", data: { projectError: { code: "PROJECT_OS_PMC_STAGE_LINK_INVALID" } } };
    render(<ScheduleStageMapping tenantId="t" projectId="p" />);
    expect(document.querySelector("[data-stage-mapping-error]")!.textContent).toMatch(/not in the current schedule/);
  });

  it("NEGATIVE: a failed read is said (Could not load), never shown as an empty mapping", () => {
    h.data = view; h.can = new Set(["project.pmc.read"]); h.queryError = { message: "boom" };
    render(<ScheduleStageMapping tenantId="t" projectId="p" />);
    expect(screen.getByRole("alert").textContent).toMatch(/Could not load/);
    expect(document.querySelector("[data-group]")).toBeNull();
  });
});
