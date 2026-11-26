import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRACE_FIGURES, traceText } from "./strategyTrace";

// Q-21 (b), a declared limit: the strategy model's calculation trace is said in the reader's language. Synthetic data only.
const MODEL = readFileSync(join(__dirname, "../../../server/domain/strategyModel.ts"), "utf8");
const serverFigures = Array.from(MODEL.matchAll(/\{ figure: "([A-Za-z]+)", formula: "/g)).map(match => match[1]);
// English prose words the server's formulas use; a translated formula carries none of them (the assumption codes are camelCase and are not in this list)
const ENGLISH = /\b(each|of|at|award|bill|collected|months|later|released|after|the|work|ends|from|over|along|backlog|on|its|own|shares|and|together|no|effect|net|cash|deepest|negative|cumulative|revenue)\b/i;

describe("the strategy model's calculation trace, in the reader's language", () => {
  it("POSITIVE: every step the server's model writes is in the table (a new step without words fails here)", () => {
    expect(serverFigures.length).toBeGreaterThanOrEqual(5);
    expect(serverFigures.filter(figure => !TRACE_FIGURES.includes(figure))).toEqual([]);
  });

  it("POSITIVE: in Arabic and Urdu each step's name and formula are in words of that language; the assumption codes stay codes", () => {
    for (const language of ["ar", "ur"] as const) for (const figure of serverFigures) {
      const said = traceText({ figure, formula: "server words", uses: ["winRate"] }, language);
      expect(said.figure, `${language} ${figure}`).not.toBe(figure);
      expect(said.formula, `${language} ${figure}`).not.toMatch(ENGLISH);
      expect(said.uses).toBe("winRate");
    }
    expect(traceText({ figure: "revenue", formula: "x", uses: [] }, "ar").formula).toContain("winRate"); // the code, as the register shows it
    // each run of codes and arithmetic is isolated left-to-right inside the Arabic sentence, parentheses whole: (1 − a − b) is one run, not three
    expect(traceText({ figure: "receipts", formula: "x", uses: [] }, "ar").formula).toContain("\u2066(1 − advancePercent − retentionPercent)\u2069");
    expect(traceText({ figure: "receipts", formula: "x", uses: [] }, "en").formula).not.toContain("\u2066"); // English needs none
  });

  it("NEGATIVE: a step the table does not know keeps the server's own words, never hidden or blank", () => {
    const said = traceText({ figure: "somethingNew", formula: "server words", uses: ["a", "b"] }, "ar");
    expect({ ...said, formula: said.formula.replace(/[\u2066\u2069]/g, "") }).toEqual({ figure: "somethingNew", formula: "server words", uses: "a, b" }); // the server's words, isolated left-to-right in an Arabic page
  });
});
