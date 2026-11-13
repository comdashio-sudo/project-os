import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PMC_FIELD_LABELS, pmcImportReason } from "./pmcImportMessages";

// G-150 (D-30): the PMC import report named a missing column by its internal key. Every key the server's importer has is named in the three languages.
const serverKeys = Array.from(new Set(Array.from(readFileSync(new URL("../../../server/domain/pmcImport.ts", import.meta.url), "utf8").matchAll(/key: "([a-zA-Z]+)"/g), match => match[1])));

describe("PMC import reasons name the column, not its key (G-150)", () => {
  it("every field key of the server importer has a label in Arabic, English and Urdu", () => {
    expect(serverKeys.length).toBeGreaterThan(15);
    for (const language of ["ar", "en", "ur"] as const) for (const key of serverKeys) expect((PMC_FIELD_LABELS[language] as Record<string, string>)[key], `${language} ${key}`).toMatch(/\S{2}/);
  });

  it("a missing required column is said in the page's language", () => {
    expect(pmcImportReason({ code: "IMPORT_REQUIRED_COLUMN_MISSING", field: "zoneCode" }, "ar")).toBe("عمود مطلوب غير موجود في الملف · رمز المنطقة");
    expect(pmcImportReason({ code: "IMPORT_REQUIRED_COLUMN_MISSING", field: "unitNumber" }, "en")).toBe("A required column is missing from the file · Villa number");
    expect(pmcImportReason({ code: "IMPORT_REQUIRED_COLUMN_MISSING", field: "blockCode" }, "ur")).toContain("بلاک کوڈ");
  });

  it("NEGATIVE: an unknown column keeps the file's own header as written, even when it looks like a key", () => {
    expect(pmcImportReason({ code: "IMPORT_UNSUPPORTED_COLUMN", field: "zoneCode" }, "ar")).toBe("عمود غير معروف · zoneCode");
    expect(pmcImportReason({ code: "IMPORT_UNSUPPORTED_COLUMN", field: "Remarks" }, "en")).toBe("Unknown column · Remarks");
  });
});
