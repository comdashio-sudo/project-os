// The export and template languages (Arabic, English, Urdu). An export is written in the language asked for; an import template keeps the
// English header row the importer matches (an Urdu header in a template would not import back); the importer accepts the Urdu header of a
// ledger column, so an Urdu export imports with no mapping.
import { describe, expect, it } from "vitest";
import { EXPORT_LOCALES } from "@shared/exportLocale";
import { acceptedHeaders, ledgerColumns, ledgerHeaders } from "@shared/ledgerImportColumns";
import { importTemplateHeaders, templateHeadersIn } from "@shared/importTemplateHeaders";
import { replyCodeLabelUr } from "./consultantSubmittals";

describe("export and template languages", () => {
  it("the locale enum accepts Urdu next to Arabic and English", () => {
    expect([...EXPORT_LOCALES]).toEqual(["ar", "en", "ur"]);
  });

  it("a ledger export carries the Urdu header of each column", () => {
    expect(ledgerHeaders("costs", "ur")[0]).toBe("WBS کوڈ");
    expect(ledgerHeaders("costs", "en")[0]).toBe("WBS Code");
    expect(ledgerHeaders("costs", "ar")[0]).toBe("رمز WBS");
  });

  it("the importer accepts the Urdu header of a ledger column, so an Urdu export imports back", () => {
    for (const column of ledgerColumns.costs) {
      expect(acceptedHeaders(column)).toContain(column.ur);
    }
  });

  it("an import template in Urdu keeps the English header row the importer matches", () => {
    expect(templateHeadersIn("wbs", "ur")).toEqual(importTemplateHeaders.wbs.en);
    expect(templateHeadersIn("wbs", "ur")).toEqual(["WBS Code", "WBS Name", "Planned Value"]);
  });

  it("an import template in Arabic and English keeps its own header row", () => {
    expect(templateHeadersIn("budget", "ar")).toEqual(importTemplateHeaders.budget.ar);
    expect(templateHeadersIn("budget", "en")).toEqual(importTemplateHeaders.budget.en);
  });
});

describe("the reply-code labels in Urdu", () => {
  it("the four default codes have their Urdu names", () => {
    expect(replyCodeLabelUr("A", "Approved")).toBe("منظور");
    expect(replyCodeLabelUr("D", "Rejected")).toBe("مسترد");
  });

  it("a company's own code keeps its English name until it is given an Urdu one", () => {
    expect(replyCodeLabelUr("X", "Custom reply")).toBe("Custom reply");
  });
});
