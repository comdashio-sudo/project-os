// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GridEditor, gridRowProblem, parseClipboardGrid, type GridColumn } from "./GridEditor";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
afterEach(() => cleanup());

const columns: GridColumn[] = [{ key: "code", label: "Code", required: true }, { key: "name", label: "Name", required: true, minLength: 2 }, { key: "value", label: "Planned value", kind: "number", min: 0 }];
const pasteInto = (element: HTMLElement, text: string) => fireEvent.paste(element, { clipboardData: { getData: () => text } });

describe("GridEditor (work order 21: paste from Excel, each row checked)", () => {
  it("reads Excel's clipboard: lines are rows, tabs separate cells", () => {
    expect(parseClipboardGrid("A1\tFoundations\t1,250.5\r\nA2\tWalls\t300\r\n")).toEqual([["A1", "Foundations", "1,250.5"], ["A2", "Walls", "300"]]);
  });

  it("a block pasted into the first cell fills the sheet from there and adds rows as needed", () => {
    render(<GridEditor label="WBS sheet" columns={columns} initialRows={1} onSaveRow={vi.fn()} />);
    pasteInto(screen.getByLabelText("Code (Row 1)"), "A1\tFoundations\t100\nA2\tWalls\t200\nA3\tRoof\t300");
    expect((screen.getByLabelText("Name (Row 3)") as HTMLInputElement).value).toBe("Roof");
    expect((screen.getByLabelText("Planned value (Row 2)") as HTMLInputElement).value).toBe("200");
  });

  it("checks every row before sending anything: a wrong row is named on its own line and nothing is saved", async () => {
    const onSaveRow = vi.fn(async () => undefined);
    render(<GridEditor label="WBS sheet" columns={columns} initialRows={1} onSaveRow={onSaveRow} />);
    pasteInto(screen.getByLabelText("Code (Row 1)"), "A1\tFoundations\t100\nA2\tW\t-5\n\tRoof\t300");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save rows" })); });
    expect(onSaveRow).not.toHaveBeenCalled();
    const states = Array.from(document.querySelectorAll("tbody tr")).map(row => row.getAttribute("data-row-state"));
    expect(states).toEqual(["idle", "invalid", "invalid"]);
    expect(document.querySelectorAll("tbody tr")[1].textContent).toContain("Name: ");
    expect(document.querySelectorAll("tbody tr")[2].textContent).toContain("Code: ");
    // D-74 (b): and again under the sheet, which can scroll sideways
    expect(Array.from(document.querySelectorAll("[data-grid-problems] li")).map(item => item.textContent?.split(":")[0])).toEqual(["Row 2", "Row 3"]);
  });

  it("saves the rows one by one and shows each row's result; a refused row says why, the others are saved", async () => {
    const onSaveRow = vi.fn(async (row: Record<string, string>) => { if (row.code === "A2") throw new Error("The code is already used."); });
    render(<GridEditor label="WBS sheet" columns={columns} initialRows={1} onSaveRow={onSaveRow} />);
    pasteInto(screen.getByLabelText("Code (Row 1)"), "A1\tFoundations\t1,250.5\nA2\tWalls\t200");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save rows" })); });
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("1 saved, 1 not saved."));
    expect(onSaveRow.mock.calls.map(call => call[0].code)).toEqual(["A1", "A2"]);
    expect(document.querySelectorAll("tbody tr")[0].getAttribute("data-row-state")).toBe("saved");
    expect(document.querySelectorAll("tbody tr")[1].textContent).toContain("The code is already used.");
  });

  it("the row check speaks the page's language and reads grouped Western digits", () => {
    expect(gridRowProblem(columns, { code: "A1", name: "Walls", value: "1,250.50" }, "ar")).toBeNull();
    expect(gridRowProblem(columns, { code: "", name: "Walls", value: "" }, "ar")).toMatch(/^Code: /);
  });
});
