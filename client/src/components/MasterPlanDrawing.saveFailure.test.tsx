import { describe, expect, it } from "vitest";
import { saveFailure } from "./MasterPlanDrawing";

// Q-62 (2): «could not save» said nothing more (the owner saw «تعذر حفظ التخطيط» and no reason). It now carries the server's own sentence for the refusal.
describe("a failed save says why (Q-62)", () => {
  it("POSITIVE: a known refusal is said in the reader's language", () => {
    const message = saveFailure("PROJECT_OS_MASTER_PLAN_UNIT_ALREADY_LINKED");
    expect(message.ar.startsWith("تعذّر حفظ الرسم:")).toBe(true);
    expect(message.ar.length).toBeGreaterThan("تعذّر حفظ الرسم:".length + 10);
    expect(message.en).toMatch(/^The drawing could not be saved: \S/);
    expect(message.ur.startsWith("ڈرائنگ محفوظ نہیں ہو سکی:")).toBe(true);
    expect(message.en).not.toContain("PROJECT_OS_");
  });
  it("NEGATIVE: an unknown failure still names its code, never the bare sentence alone", () => {
    expect(saveFailure("Failed to fetch").en).toBe("The drawing could not be saved: Reason from the server: Failed to fetch");
    expect(saveFailure("PROJECT_OS_SOMETHING_NEW").ar).toContain("PROJECT_OS_SOMETHING_NEW");
  });
});
