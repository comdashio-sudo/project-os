// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
import { VillaMap } from "./VillaMap";

// Q-67 (6): the map as a way to choose villas. Synthetic shapes only.
const square = (villa: string, x: number) => ({ villa, points: [{ x, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 10 }, { x, y: 10 }] });
const villas = [
  { villa: "700", number: 700, block: "BLK 33", phase: "PH1", model: "C", status: "COMPLETE" }, { villa: "701", number: 701, block: "BLK 33", phase: "PH1", model: "C", status: "IN_PROGRESS" },
  { villa: "702", number: 702, block: "BLK 34", phase: "PH2", model: "D", status: "NOT_STARTED" },
];
afterEach(() => cleanup());

function Harness({ models, onSent }: { models: string[] | null; onSent?: (villas: string[]) => void }) {
  const [chosen, setChosen] = React.useState<string[]>([]);
  return <VillaMap shapes={[square("700", 0), square("701", 20), square("702", 40)]} yUp={false} villas={villas} models={models} chosen={chosen} onChosen={next => { setChosen(next); onSent?.(next); }} />;
}

describe("VillaMap (Q-67 6)", () => {
  it("POSITIVE: each villa is coloured by the item's status; a tap chooses and a second tap un-chooses; a block's name chooses its villas; the bar counts them", () => {
    const sent = vi.fn();
    render(<Harness models={["C", "D"]} onSent={sent} />);
    const villa = (number: string) => document.querySelector(`[data-map-villa="${number}"]`)!;
    expect(villa("700").querySelector("polygon")!.getAttribute("class")).toContain("fill-success");
    expect(villa("701").querySelector("polygon")!.getAttribute("class")).toContain("fill-info");
    expect(villa("702").querySelector("polygon")!.getAttribute("class")).toContain("fill-muted-foreground/35");
    fireEvent.click(villa("702"));
    expect(villa("702").getAttribute("aria-pressed")).toBe("true");
    expect(villa("702").textContent).toBe("✓");
    fireEvent.click(screen.getByRole("button", { name: "BLK 33" }));
    expect(sent).toHaveBeenLastCalledWith(["702", "700", "701"]);
    expect(document.querySelector("[data-map-chosen]")!.textContent).toBe("3 villas chosen");
    fireEvent.click(villa("702"));
    expect(sent).toHaveBeenLastCalledWith(["700", "701"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(sent).toHaveBeenLastCalledWith([]);
  });

  it("NEGATIVE: a villa the item does not apply to (its model) is faded and cannot be chosen, by a tap or with its block", () => {
    const sent = vi.fn();
    render(<Harness models={["C"]} onSent={sent} />);
    const off = document.querySelector('[data-map-villa="702"]')!;
    expect(off.getAttribute("aria-disabled")).toBe("true");
    expect(off.querySelector("polygon")!.getAttribute("class")).toContain("fill-transparent");
    fireEvent.click(off);
    expect(sent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "BLK 34" }));
    expect(sent).toHaveBeenLastCalledWith([]);
  });
});
