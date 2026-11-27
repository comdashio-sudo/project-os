// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SectionNav, StickyActionBar, TwoPane } from "./pageLayout";

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
