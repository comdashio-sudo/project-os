// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Q-59 (3): the quick search. Synthetic data only.
const h = vi.hoisted(() => ({ hits: [] as unknown[], error: null as unknown, enabled: [] as boolean[] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", isArabic: false }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { search: { quick: { useQuery: (_input: unknown, options: { enabled: boolean }) => { h.enabled.push(options.enabled); return { data: options.enabled ? { hits: h.hits } : undefined, error: options.enabled ? h.error : null, isFetching: false }; } } } } }));

import { QuickSearch, matchPages } from "./QuickSearch";

afterEach(() => { cleanup(); h.hits = []; h.error = null; h.enabled = []; vi.useRealTimers(); });
const pages = [{ id: "board", label: "Project board", href: "/projects/t/p/controls" }, { id: "stalled", label: "Stalled units", href: "/projects/t/p/stalled" }, { id: "none", label: "No address" }];

describe("QuickSearch (Q-59 3)", () => {
  it("matches the menu's pages by name, ignoring case; a page without an address is never offered", () => {
    expect(matchPages(pages, "STALL").map(page => page.id)).toEqual(["stalled"]);
    expect(matchPages(pages, "no ")).toEqual([]);
    expect(matchPages(pages, "  ")).toEqual([]);
  });

  it("POSITIVE: Ctrl+K opens it; pages and the server's hits are listed by kind; Enter opens the first, the arrows move", async () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    h.hits = [{ kind: "villa", label: "101", detail: "MDL-A", href: "/m/t/p/unit/101" }];
    render(<QuickSearch tenantId="t" projectId="p" pages={pages} onOpen={onOpen} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByRole("combobox", { name: "Quick search" });
    fireEvent.change(input, { target: { value: "1" } });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(Array.from(document.querySelectorAll("[data-quick-result]")).map(node => node.getAttribute("data-quick-result"))).toEqual(["villas"]);
    fireEvent.change(input, { target: { value: "units" } });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(Array.from(document.querySelectorAll("[data-quick-result]")).map(node => node.getAttribute("data-quick-result"))).toEqual(["pages", "villas"]);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith("/m/t/p/unit/101");
  });

  it("NEGATIVE: off a project the server is not asked (pages only); a failed search says so and still shows the pages", async () => {
    vi.useFakeTimers();
    render(<QuickSearch tenantId="t" pages={pages} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Quick search" }), { target: { value: "board" } });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(h.enabled.every(value => value === false)).toBe(true);
    expect(document.querySelectorAll('[data-quick-result="pages"]')).toHaveLength(1);
    cleanup(); h.error = { message: "down" };
    render(<QuickSearch tenantId="t" projectId="p" pages={pages} onOpen={vi.fn()} />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.change(screen.getByRole("combobox", { name: "Quick search" }), { target: { value: "board" } });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole("note").textContent).toContain("could not be searched");
    expect(document.querySelectorAll('[data-quick-result="pages"]')).toHaveLength(1);
  });
});
