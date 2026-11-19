import { describe, expect, it } from "vitest";
import { resolveColumns } from "./columnChoice";

// Q-31 (P0-02): the column choice shared by the baseline readers. Synthetic headers only.
const fields = [{ key: "month", required: true, aliases: ["month", "الشهر"] }, { key: "trade", required: false, aliases: ["trade"] }, { key: "workers", required: true, aliases: ["workers"] }];

describe("resolveColumns (Q-31)", () => {
  it("without a choice: the aliases decide, and the report says which column each field takes (null when none)", () => {
    const result = resolveColumns(fields, ["الشهر", "Crew", "Men"]);
    expect(result.columns).toEqual({ month: "الشهر", trade: undefined, workers: undefined });
    expect(result.report).toEqual({ headers: ["الشهر", "Crew", "Men"], overridden: false, fields: [{ key: "month", required: true, header: "الشهر" }, { key: "trade", required: false, header: null }, { key: "workers", required: true, header: null }] });
    expect(result.invalid).toBeUndefined();
  });

  it("POSITIVE: the person's choice wins; a column given to one field is no longer read for the field the aliases had matched; an empty header clears a field", () => {
    const result = resolveColumns(fields, ["Month", "Trade", "Men"], { workers: "Men", trade: "Month", month: "", __others__: "ignore" });
    expect(result.columns).toEqual({ month: undefined, trade: "Month", workers: "Men" });
    expect(result.report.overridden).toBe(true);
  });

  it("NEGATIVE: an unknown field, a header the file does not have, or one header for two fields is refused whole, naming it", () => {
    expect(resolveColumns(fields, ["Month", "Men"], { crew: "Men" }).invalid).toBe("crew");
    expect(resolveColumns(fields, ["Month", "Men"], { workers: "Total" }).invalid).toBe("Total");
    expect(resolveColumns(fields, ["Month", "Men"], { workers: "Men", trade: "Men" }).invalid).toBe("Men");
  });
});
