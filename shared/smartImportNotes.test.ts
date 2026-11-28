import { describe, expect, it } from "vitest";
import { smartNoteText } from "./smartImportNotes";

// Q-66 (4): the smart reader's notes in words, in three languages, with their values; an unknown note is kept as written.
describe("smartNoteText", () => {
  it("says a note with its values in each language", () => {
    expect(smartNoteText("BOQ_SECTION_DIFFERS:1:1500:1800", "en")).toBe("Section 1 says 1,500 and its items add up to 1,800; neither was changed.");
    expect(smartNoteText("BOQ_SECTION_DIFFERS:1:1500:1800", "ar")).toBe("القسم 1 كتب 1,500 ومجموع بنوده 1,800؛ لم يُغيَّر أيٌّ منهما.");
    expect(smartNoteText("XER_TABLES_NOT_KEPT:RSRC,TASKRSRC", "ur")).toContain("RSRC,TASKRSRC");
    expect(smartNoteText("REPORT_DATE_MISSING", "en")).toBe("The file has no report date.");
  });
  it("NEGATIVE: a note it does not know is shown as written, never dropped", () => {
    expect(smartNoteText("NOT_A_KNOWN_NOTE:7", "ar")).toBe("NOT_A_KNOWN_NOTE:7");
    expect(smartNoteText("", "en")).toBe("");
  });
});
