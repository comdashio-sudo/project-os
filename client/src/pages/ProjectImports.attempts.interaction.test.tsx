/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ProjectImports } from "./ProjectImports";

// The import log lists ATTEMPTS (owner order 2026-10-27): each says plainly what happened, a refused or unconfirmed one can be deleted, a confirmed one can be rolled back or replaced.
const ids = { rejected: "00000000-0000-4000-8000-0000000000a1", awaiting: "00000000-0000-4000-8000-0000000000a2", imported: "00000000-0000-4000-8000-0000000000a3" };
const state = vi.hoisted(() => ({
  mock: {
    list: [] as unknown[], detail: null as unknown, progress: undefined as unknown, createUpload: vi.fn(), registerUpload: vi.fn(), reanalyze: vi.fn(), confirm: vi.fn(), discard: vi.fn(async () => ({ discarded: true })), rollback: vi.fn(async () => ({ rolledBack: true })),
  },
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized import error" }));
vi.mock("@/components/SectionResilience", () => ({ SourceNotice: () => null }));
vi.mock("@/lib/trpc", async () => ({ trpc: (await import("../test/importsTrpcMock")).importsTrpc(state.mock) }));

const row = (id: string, fileName: string, status: string, errorCount: number, moduleCode = "wbs") => ({ id, fileName, moduleCode, status, errorCount, duplicateMode: "fail_on_duplicate", createdRows: status === "completed" ? 5 : 0, updatedRows: 0, skippedRows: 0 });
afterEach(() => { cleanup(); vi.restoreAllMocks(); state.mock.discard.mockClear(); state.mock.rollback.mockClear(); });

describe("the import log shows what each attempt is and what can be done with it", () => {
  const setup = () => { state.mock.list = [row(ids.rejected, "2234-21.xer", "uploaded", 14, "schedule"), row(ids.awaiting, "wbs.xlsx", "validated", 0), row(ids.imported, "done.xlsx", "completed", 0)]; render(<ProjectImports tenantId="tenant-1" projectId="project-1" />); };

  it("labels a refused attempt «Rejected — nothing was written», an unconfirmed one «Waiting for confirmation», a written one «Imported»", () => {
    setup();
    expect(within(screen.getByTestId("import-attempt-rejected")).getByText("Rejected — nothing was written")).toBeTruthy();
    expect(within(screen.getByTestId("import-attempt-awaiting")).getByText("Waiting for confirmation")).toBeTruthy();
    expect(within(screen.getByTestId("import-attempt-imported")).getByText("Imported")).toBeTruthy();
  });

  it("offers «Delete this attempt» on the refused and the unconfirmed one only, and asks before it deletes", async () => {
    setup();
    const user = userEvent.setup();
    expect(screen.getAllByRole("button", { name: "Delete this attempt" })).toHaveLength(2);
    expect(within(screen.getByTestId("import-attempt-imported")).queryByRole("button", { name: "Delete this attempt" })).toBeNull();
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(within(screen.getByTestId("import-attempt-rejected")).getByRole("button", { name: "Delete this attempt" }));
    expect(state.mock.discard).not.toHaveBeenCalled(); // declined: nothing happens
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await user.click(within(screen.getByTestId("import-attempt-rejected")).getByRole("button", { name: "Delete this attempt" }));
    expect(state.mock.discard).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", importId: ids.rejected });
  });

  it("offers «Roll back this import» and «Replace with a newer version» on an imported one, and rolls back only after confirmation", async () => {
    setup();
    const user = userEvent.setup();
    const imported = within(screen.getByTestId("import-attempt-imported"));
    expect(imported.getByRole("button", { name: "Replace with a newer version" })).toBeTruthy();
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await user.click(imported.getByRole("button", { name: "Roll back this import" }));
    expect(state.mock.rollback).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", importId: ids.imported });
    await user.click(imported.getByRole("button", { name: "Replace with a newer version" }));
    expect(screen.getByTestId("replace-note").textContent).toContain("differences are shown before anything is written");
  });

  it("never offers «Delete this attempt» on a rolled-back import (it is history), nor «Roll back» on a module that cannot be rolled back", () => {
    state.mock.list = [row("00000000-0000-4000-8000-0000000000a4", "undone.xlsx", "cancelled", 0), row("00000000-0000-4000-8000-0000000000a5", "stock.csv", "completed", 0, "openingBalances")];
    render(<ProjectImports tenantId="tenant-1" projectId="project-1" />);
    const undone = within(screen.getByTestId("import-attempt-undone"));
    expect(undone.getByText("Rolled back")).toBeTruthy();
    expect(undone.queryByRole("button", { name: "Delete this attempt" })).toBeNull();
    const ledger = within(screen.getByTestId("import-attempt-imported"));
    expect(ledger.queryByRole("button", { name: "Roll back this import" })).toBeNull();
    expect(ledger.queryByRole("button", { name: "Replace with a newer version" })).toBeNull();
  });
});

describe("the attempt rows follow the design system (design review of #157)", () => {
  const setup = () => { state.mock.list = [row(ids.rejected, "2234-21.xer", "uploaded", 14, "schedule"), row(ids.awaiting, "wbs.xlsx", "validated", 0), row(ids.imported, "done.xlsx", "completed", 0)]; render(<ProjectImports tenantId="tenant-1" projectId="project-1" />); };

  it("shows each state as a badge with words and an icon, so «Rejected» is never colour alone", () => {
    setup();
    const tones: Record<string, string> = { rejected: "danger", awaiting: "warning", imported: "success" };
    for (const [attempt, tone] of Object.entries(tones)) {
      const badge = screen.getByTestId(`import-attempt-${attempt}`).querySelector(`[data-tone="${tone}"]`);
      expect(badge, attempt).not.toBeNull();
      expect(badge!.querySelector("svg[aria-hidden='true']"), attempt).not.toBeNull();
      expect(badge!.textContent!.trim().length, attempt).toBeGreaterThan(0);
    }
  });

  it("gives every row action a 44px touch target on phones (min-h-11)", () => {
    setup();
    const buttons = ["rejected", "awaiting", "imported"].flatMap(attempt => within(screen.getByTestId(`import-attempt-${attempt}`)).getAllByRole("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(6);
    for (const button of buttons) expect(button.className, button.textContent ?? "").toContain("min-h-11");
  });

  it("uses no raw palette colours on the import screen (negative: a red-700 would fail)", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/ProjectImports.tsx"), "utf8");
    const raw = /\b(?:text|bg|border)-(?:red|amber|slate|gray|green|yellow)-\d{2,3}\b/;
    expect(raw.test("text-red-700")).toBe(true);
    expect(source.match(new RegExp(raw.source, "g")) ?? []).toEqual([]);
  });
});
