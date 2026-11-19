import { describe, expect, it } from "vitest";
import { cellFor, matrixColumns } from "./roleMatrix";

// Q-39 (P1-07): the management viewer — read-only codes only. Read from the role matrix that server/domain/roleMatrix.test.ts holds against the code.
const VIEWERS = { executive: ["executive.read"], pmo: ["pmo.read"], project: ["project.read"], all: ["executive.read", "pmo.read", "project.read"] } as const;

describe("Q-39: the management viewer edits and approves nothing", () => {
  for (const [name, codes] of Object.entries(VIEWERS)) {
    it(`${name}: no column of the matrix lets it edit or approve (negative for every write and approval)`, () => {
      for (const column of matrixColumns) expect([column.id, cellFor(column, codes)]).not.toEqual([column.id, expect.stringMatching(/^(edit|approve)$/)]);
    });
  }
  it("project.read and pmo.read see no pay, people, beneficiaries, costs or contract values; profit only comes with executive.read", () => {
    const cell = (codes: readonly string[], id: string) => cellFor(matrixColumns.find(column => column.id === id)!, codes);
    for (const id of ["payroll", "people", "beneficiaries", "costs", "contracts", "approvals", "profit"]) expect([id, cell(["project.read", "pmo.read"], id)]).toEqual([id, "none"]);
    expect(cell(["executive.read"], "profit")).toBe("see");
  });
});
