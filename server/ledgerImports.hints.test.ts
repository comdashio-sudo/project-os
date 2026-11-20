import { describe, expect, it } from "vitest";
import { readLedgerTable } from "./ledgerImports";

// Q-50 batch 3c: the ledgers' column report says where each column came from and suggests (never applies) a close header for a field not found.
const csv = (lines: string[]) => Buffer.from(lines.join("\n") + "\n");

describe("ledger column hints (Q-50 batch 3c)", () => {
  it("POSITIVE: «Cost Date» is found by its name; «Total amount paid» is offered for the amount, and the file is NOT read with it", async () => {
    const table = await readLedgerTable("costs", "csv", csv(["Cost Date,Total amount paid,WBS Code", "2026-11-01,100,W1"]));
    const field = (key: string) => table.columns?.fields.find(item => item.key === key);
    expect(field("incurredAt")).toMatchObject({ header: "Cost Date", source: "name", suggestion: null });
    expect(field("amount")).toMatchObject({ header: null, source: null, suggestion: { header: "Total amount paid" } });
    expect(table.rows).toEqual([]);
    expect(table.errors.map(error => error.code)).toContain("IMPORT_REQUIRED_COLUMN_MISSING");
  });

  it("NEGATIVE: a header nothing like the field's names is not suggested; once the person maps it, the field says «chosen»", async () => {
    const far = await readLedgerTable("costs", "csv", csv(["Cost Date,Value,WBS Code", "2026-11-01,100,W1"]));
    expect(far.columns?.fields.find(item => item.key === "amount")?.suggestion).toBeNull();
    const mapped = await readLedgerTable("costs", "csv", csv(["Cost Date,Value,WBS Code", "2026-11-01,100,W1"]), { amount: "Value", __others__: "ignore" });
    expect(mapped.columns?.fields.find(item => item.key === "amount")).toMatchObject({ header: "Value", source: "chosen", suggestion: null });
  });
});
