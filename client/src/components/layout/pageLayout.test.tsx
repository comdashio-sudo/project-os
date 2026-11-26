// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EntityCombobox, SectionNav, StickyActionBar, TwoPane } from "./pageLayout";

// Q-69: the shared page layout. Synthetic options only.
beforeAll(() => {
  // cmdk and Radix need these in jsdom
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
  Element.prototype.scrollIntoView ??= vi.fn();
});
afterEach(() => cleanup());
const activities = [
  { value: "IP-001", label: "IP-001 · قواعد خرسانية", hint: "4.5%", group: "Q02 الأساسات", keywords: ["foundations"] },
  { value: "IP-002", label: "IP-002 · أعمدة", hint: "3%", group: "Q02 الأساسات" },
  { value: "IP-120", label: "IP-120 · دهان داخلي", hint: "2%", group: "Q09 التشطيبات", keywords: ["paint"] },
];

describe("TwoPane", () => {
  it("two panes with the companion beside the work; one pane when there is no companion", () => {
    render(<TwoPane main={<p>form</p>} aside={<p>preview</p>} asideLabel="Selected villas" />);
    expect(document.querySelector('[data-pane="main"]')!.textContent).toBe("form");
    expect(screen.getByRole("complementary", { name: "Selected villas" }).textContent).toBe("preview");
    cleanup();
    render(<TwoPane main={<p>only</p>} />);
    expect(document.querySelector("[data-pane]")).toBeNull();
  });
});

describe("StickyActionBar and SectionNav", () => {
  it("the action bar holds its summary and buttons; the section row lists the sections and hides with one", () => {
    render(<StickyActionBar summary="42 villas → complete"><button type="button">Save</button></StickyActionBar>);
    expect(document.querySelector("[data-action-summary]")!.textContent).toBe("42 villas → complete");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    cleanup();
    render(<SectionNav label="On this page" sections={[{ id: "a", label: "Schedule" }, { id: "b", label: "Cost" }]} />);
    expect(screen.getByRole("link", { name: "Cost" }).getAttribute("href")).toBe("#b");
    cleanup();
    const { container } = render(<SectionNav label="On this page" sections={[{ id: "a", label: "Only" }]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("EntityCombobox", () => {
  const open = () => fireEvent.click(screen.getByRole("combobox", { name: "Activity" }));
  const renderBox = (onChange = vi.fn(), recent: string[] = []) => render(<EntityCombobox label="Activity" options={activities} value={null} onChange={onChange} placeholder="Choose an activity" searchPlaceholder="Search by code or name" emptyText="No activity" recentLabel="Last used" recent={recent} />);
  it("shows the placeholder, then the options grouped, and a choice is reported", () => {
    const onChange = vi.fn(); renderBox(onChange);
    expect(screen.getByRole("combobox", { name: "Activity" }).textContent).toContain("Choose an activity");
    open();
    expect(screen.getByText("Q02 الأساسات")).toBeTruthy();
    fireEvent.click(screen.getByText("IP-120 · دهان داخلي"));
    expect(onChange).toHaveBeenCalledWith("IP-120");
  });
  it("search narrows by part of the name, the code, or a keyword («قواعد», «IP-00», «paint»)", () => {
    renderBox(); open();
    const input = screen.getByPlaceholderText("Search by code or name");
    fireEvent.change(input, { target: { value: "قواعد" } });
    expect(screen.queryByText("IP-002 · أعمدة")).toBeNull();
    expect(screen.getByText("IP-001 · قواعد خرسانية")).toBeTruthy();
    fireEvent.change(input, { target: { value: "paint" } });
    expect(screen.getByText("IP-120 · دهان داخلي")).toBeTruthy();
    expect(screen.queryByText("IP-001 · قواعد خرسانية")).toBeNull();
  });
  it("NEGATIVE: a search that matches nothing says so instead of an empty list", () => {
    renderBox(); open();
    fireEvent.change(screen.getByPlaceholderText("Search by code or name"), { target: { value: "zzz" } });
    expect(screen.getByText("No activity")).toBeTruthy();
  });
  it("the last-used activity is offered first, under its own heading", () => {
    renderBox(vi.fn(), ["IP-120"]); open();
    const headings = Array.from(document.querySelectorAll("[cmdk-group-heading]")).map(node => node.textContent);
    expect(headings[0]).toBe("Last used");
  });
});
