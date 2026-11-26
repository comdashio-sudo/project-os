import { describe, expect, it } from "vitest";
import { alreadyImportedWhen } from "./DirectImportRunner";

// Q-62: «already imported» says when and under which file name (the server's ALREADY_IMPORTED entry in data.issues)
describe("an «already imported» refusal says when (Q-62)", () => {
  it("POSITIVE: the date and the file name follow the sentence", () => {
    expect(alreadyImportedWhen({ data: { issues: [{ code: "ALREADY_IMPORTED", detail: "2026-11-26 08:10 UTC · villas.csv" }] } }, "Imported on")).toBe(" Imported on: 2026-11-26 08:10 UTC · villas.csv");
  });
  it("NEGATIVE: any other refusal adds nothing", () => {
    expect(alreadyImportedWhen({ data: { issues: [{ code: "ROW_INVALID", detail: "x" }] } }, "Imported on")).toBe("");
    expect(alreadyImportedWhen(new Error("Failed to fetch"), "Imported on")).toBe("");
    expect(alreadyImportedWhen(null, "Imported on")).toBe("");
  });
});
