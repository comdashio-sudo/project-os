// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WbsTree } from "./WbsTree";
import { buildWbsTree, searchWbsTree, visibleWbsRows } from "@/lib/wbsTree";

// Q-64: the work structure is a tree. A project imported from a P6 file has 1,413 nodes, all at 0%: the planner must not meet a flat list of them.
let language: "ar" | "en" | "ur" = "ar";
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: language === "ar", language, isRtl: language !== "en", setLanguage: vi.fn() }) }));
afterEach(() => { cleanup(); language = "ar"; });

// a SYNTHETIC tree with the owner's size: a root, 12 zones, the rest villas under the zones (1,413 nodes), every progress 0 and no planned value
const items = (() => {
  const list: Array<{ id: string; code: string; name: string; parentId: string | null; plannedValue: string; progressPercent: string }> = [{ id: "root", code: "SYN", name: "Synthetic project", parentId: null, plannedValue: "0.00", progressPercent: "0.00" }];
  for (let z = 1; z <= 12; z++) list.push({ id: `z${z}`, code: `ZN${String(z).padStart(2, "0")}`, name: `Zone ${z}`, parentId: "root", plannedValue: "0.00", progressPercent: "0.00" });
  for (let v = 1; list.length < 1413; v++) list.push({ id: `v${v}`, code: `V${String(v).padStart(3, "0")}`, name: `Villa ${v}`, parentId: `z${1 + (v % 12)}`, plannedValue: "0.00", progressPercent: "0.00" });
  return list;
})();
const activities = items.filter(item => item.id.startsWith("v")).flatMap((item, index) => [{ wbsItemId: item.id, plannedStartAt: "2026-03-01", plannedFinishAt: "2026-04-10" }, { wbsItemId: item.id, plannedStartAt: "2026-04-11", plannedFinishAt: index % 2 ? "2026-06-30" : "2026-05-20" }]);

describe("the work-structure tree (Q-64)", () => {
  it("1,413 nodes open as the first level only: the root, not a thousand lines — and no «0.00%» anywhere", () => {
    render(<WbsTree items={items} activities={activities} empty="empty" />);
    const rows = document.querySelectorAll("[data-wbs-row]");
    expect(rows.length).toBe(1 + 12); // the root and its 12 zones (the root is open, the zones are closed)
    expect(document.body.textContent).not.toMatch(/0\.00\s?%/);
    expect(rows[0].textContent).toContain("12 بندًا فرعيًا");
    expect(rows[0].textContent).toContain(`${activities.length.toLocaleString("en-US")} نشاطًا`); // every villa's two activities, counted up the tree
  });

  it("opening a zone shows its villas, and closing it hides them again", () => {
    render(<WbsTree items={items} activities={activities} empty="empty" />);
    const zone = screen.getByText(/ZN01 · Zone 1/).closest("[data-wbs-row]") as HTMLElement;
    fireEvent.click(within(zone).getByRole("button"));
    const afterOpen = document.querySelectorAll("[data-wbs-row]").length;
    expect(afterOpen).toBeGreaterThan(13);
    expect(zone.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(within(zone).getByRole("button"));
    expect(document.querySelectorAll("[data-wbs-row]").length).toBe(13);
  });

  it("a search by code keeps the match and the path to it, nothing else", () => {
    render(<WbsTree items={items} activities={activities} empty="empty" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "V606" } });
    const lines = Array.from(document.querySelectorAll("[data-wbs-row]")).map(row => row.querySelector("p")!.textContent);
    expect(lines).toEqual(["SYN · Synthetic project", "ZN07 · Zone 7", "V606 · Villa 606"]); // villa 606 sits under zone 1 + 606 % 12 = 7
  });

  it("NEGATIVE: a search that matches nothing says so, and draws no row", () => {
    render(<WbsTree items={items} activities={activities} empty="empty" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no such item" } });
    expect(document.querySelectorAll("[data-wbs-row]").length).toBe(0);
    expect(screen.getByRole("status").textContent).toBe("لا بند يطابق البحث");
  });

  it("an empty project says so (no tree, no search box)", () => {
    render(<WbsTree items={[]} activities={[]} empty="لا هيكل عمل بعد" />);
    expect(screen.getByText("لا هيكل عمل بعد")).toBeTruthy();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("a measured progress and a planned value are shown; an unmeasured zero is not", () => {
    render(<WbsTree items={[{ id: "a", code: "A", name: "Measured", parentId: null, plannedValue: "250000.00", progressPercent: "37.5" }, { id: "b", code: "B", name: "Unmeasured", parentId: null, plannedValue: "0.00", progressPercent: "0.00" }]} activities={[]} empty="" />);
    const [a, b] = Array.from(document.querySelectorAll("[data-wbs-row]"));
    expect(a.textContent).toContain("37.50%"); expect(a.textContent).toContain("250,000");
    expect(b.textContent).not.toMatch(/%|القيمة المخططة/);
  });

  it("the pure tree: dates and counts are over everything below a node; a node whose parent is missing is still shown; a cycle cannot loop", () => {
    const roots = buildWbsTree([{ id: "x", code: "X", name: "x", parentId: "gone" }, { id: "y", code: "Y", name: "y", parentId: "z" }, { id: "z", code: "Z", name: "z", parentId: "y" }, { id: "c", code: "C", name: "c", parentId: "x" }], [{ wbsItemId: "c", plannedStartAt: "2026-01-05", plannedFinishAt: "2026-02-01" }, { wbsItemId: "x", plannedStartAt: "2026-01-01", plannedFinishAt: "2026-01-20" }]);
    expect(roots.map(node => node.item.id)).toEqual(["X"].map(() => "x")); // y and z form a cycle: neither is a root, and the build ends
    expect(roots[0]).toMatchObject({ activities: 2, start: "2026-01-01", finish: "2026-02-01" });
    expect(searchWbsTree(roots, "").visible).toBeNull();
    expect(visibleWbsRows(roots, { open: new Set(), visible: null, firstLevelOpen: true }).map(row => row.node.item.id)).toEqual(["x", "c"]);
  });
});
