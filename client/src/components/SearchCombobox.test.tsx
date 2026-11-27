// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
import { SearchCombobox } from "./SearchCombobox";

// Q-67 (1): the one searchable list of the field screens — typed search, groups, «last used» first, the keyboard. Synthetic data only.
const options = [
  { value: "IP-001", code: "IP-001", label: "Excavation", group: "Q01 — Earthworks" },
  { value: "IP-002", code: "IP-002", label: "Footings", group: "Q02 — Structure" },
  { value: "IP-003", code: "IP-003", label: "Columns", group: "Q02 — Structure" },
];
afterEach(() => cleanup());

describe("SearchCombobox (Q-67)", () => {
  it("POSITIVE: opens on a press, filters as you type, and Enter chooses the highlighted option; arrows move the highlight", () => {
    const onChange = vi.fn();
    render(<SearchCombobox options={options} onChange={onChange} placeholder="Activity" />);
    fireEvent.click(screen.getByRole("combobox"));
    const search = screen.getByRole("textbox", { name: "Activity" });
    fireEvent.change(search, { target: { value: "Q02" } });
    expect(screen.getAllByRole("option").map(option => option.getAttribute("data-value"))).toEqual(["IP-002", "IP-003"]);
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("IP-003");
  });

  it("POSITIVE: «last used» comes first while nothing is typed, and the groups are headed", () => {
    render(<SearchCombobox options={options} onChange={vi.fn()} recent={["IP-003", "GONE"]} placeholder="Activity" />);
    fireEvent.click(screen.getByRole("combobox"));
    const list = screen.getByRole("listbox");
    expect(list.textContent).toMatch(/^Last used.*Columns.*Q01 — Earthworks.*Excavation.*Q02 — Structure.*Footings.*Columns/);
    fireEvent.change(screen.getByRole("textbox", { name: "Activity" }), { target: { value: "col" } });
    expect(list.textContent).not.toContain("Last used");
  });

  it("POSITIVE: several can be chosen; the button then says how many", () => {
    const onChangeMany = vi.fn();
    const { rerender } = render(<SearchCombobox multiple options={options} values={[]} onChangeMany={onChangeMany} placeholder="Blocks" />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: /Columns/ }));
    expect(onChangeMany).toHaveBeenLastCalledWith(["IP-003"]);
    rerender(<SearchCombobox multiple options={options} values={["IP-001", "IP-003"]} onChangeMany={onChangeMany} placeholder="Blocks" />);
    expect(screen.getByRole("combobox").textContent).toBe("Excavation, Columns");
    const many = Array.from({ length: 5 }, (_, index) => ({ value: `B${index}`, label: `BLK ${index}` }));
    rerender(<SearchCombobox multiple options={many} values={many.map(option => option.value)} onChangeMany={onChangeMany} placeholder="Blocks" />);
    expect(screen.getByRole("combobox").textContent).toBe("5 chosen");
  });

  it("NEGATIVE: a search that matches nothing says so and chooses nothing on Enter", () => {
    const onChange = vi.fn();
    render(<SearchCombobox options={options} onChange={onChange} placeholder="Activity" />);
    fireEvent.click(screen.getByRole("combobox"));
    const search = screen.getByRole("textbox", { name: "Activity" });
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByRole("listbox").textContent).toBe("No results");
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("review of main's accessibility check (#586): a list with no label is named by its placeholder; inside a labelled field its label names it, not the placeholder", () => {
    render(<SearchCombobox options={options} onChange={vi.fn()} placeholder="Unit card" />);
    expect(screen.getByRole("combobox", { name: "Unit card" })).toBeTruthy();
    cleanup();
    render(<><label htmlFor="pick">Activity</label><SearchCombobox id="pick" options={options} onChange={vi.fn()} placeholder="Choose" /></>);
    expect(screen.getByRole("combobox", { name: "Activity" })).toBeTruthy();
  });
});
