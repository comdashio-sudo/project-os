/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.unmock("@/components/ds/ListSelect"); // this file tests the real list, not the stand-in the other tests get
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
import { EMPTY_VALUE, ListSelect, Option } from "./ListSelect";
import { CheckedForm } from "@/components/CheckedForm";

beforeAll(() => {
  // Radix Select uses pointer and scroll APIs jsdom lacks
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => undefined);
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => undefined);
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
  globalThis.ResizeObserver = globalThis.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => cleanup());

describe("ListSelect (the custom list, written like a native select)", () => {
  it("draws the custom list (no browser select), reads Option children through arrays, and hands back event.target.value", async () => {
    const onChange = vi.fn();
    const items = [{ id: "w1", name: "Main" }, { id: "w2", name: "Yard" }];
    render(<ListSelect aria-label="Warehouse" value="w1" onChange={onChange}><Option value="">All</Option>{items.map(item => <Option key={item.id} value={item.id}>{item.name} ({item.id})</Option>)}</ListSelect>);
    expect(document.querySelector("select")).toBeNull();
    const trigger = screen.getByRole("combobox", { name: "Warehouse" });
    expect(trigger.textContent).toContain("Main (w1)");
    await act(async () => { fireEvent.keyDown(trigger, { key: "ArrowDown" }); });
    await act(async () => { fireEvent.click(await screen.findByRole("option", { name: "Yard (w2)" })); });
    expect(onChange).toHaveBeenCalledWith({ target: { value: "w2" }, currentTarget: { value: "w2" } });
  });

  it("an empty choice ('' = all / none) shows its label and comes back as an empty string", async () => {
    const onChange = vi.fn();
    render(<ListSelect aria-label="Zone" value="" onChange={onChange}><Option value="">All zones</Option><Option value="z1">Z1</Option></ListSelect>);
    const trigger = screen.getByRole("combobox", { name: "Zone" });
    expect(trigger.textContent).toContain("All zones");
    await act(async () => { fireEvent.keyDown(trigger, { key: "ArrowDown" }); });
    expect(document.querySelector(`[role="option"][data-value="${EMPTY_VALUE}"]`)).toBeTruthy();
    await act(async () => { fireEvent.click(await screen.findByRole("option", { name: "Z1" })); });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ target: { value: "z1" } }));
  });

  it("a required list leaves a hidden copy of its value, so the form check names the missing choice by the list's label", () => {
    const onSubmit = vi.fn();
    render(<CheckedForm onSubmit={onSubmit}><label>Supplier<ListSelect value="" onChange={vi.fn()} required><Option value="">Choose</Option><Option value="s1">S1</Option></ListSelect></label><button type="submit">Save</button></CheckedForm>);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Supplier: ");
  });
});
