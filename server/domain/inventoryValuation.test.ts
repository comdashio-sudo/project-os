import { describe, expect, it } from "vitest";
import { adjustmentAtAverage, issueToWorkCost, pricedReceipt, stockPosition, transferValuation, valuedIssue } from "./inventoryValuation";

const receive = (quantity: number, unitCost: number) => ({ quantityDelta: quantity, valueDelta: pricedReceipt(quantity, unitCost).valueDelta });

describe("weighted-average stock valuation", () => {
  it("averages two receipts at different prices", () => {
    const position = stockPosition([receive(100, 10), receive(100, 20)]);
    expect(position).toMatchObject({ quantity: 200, value: 3000, averageCost: 15, unpricedQuantity: 0 });
  });

  it("values an issue at the average and leaves the average where it was", () => {
    const shelf = [receive(100, 10), receive(100, 20)];
    const issue = valuedIssue(stockPosition(shelf), 50);
    expect(issue).toEqual({ unitCost: 15, valueDelta: -750 });
    const after = stockPosition([...shelf, { quantityDelta: -50, valueDelta: issue.valueDelta }]);
    expect(after).toMatchObject({ quantity: 150, value: 2250, averageCost: 15 });
  });

  it("empties the value exactly when the priced stock is taken, whatever the rounding of the average", () => {
    const shelf = [receive(3, 33.33), receive(0.001, 1)];
    const position = stockPosition(shelf);
    const issue = valuedIssue(position, 3.001);
    expect(stockPosition([...shelf, { quantityDelta: -3.001, valueDelta: issue.valueDelta }])).toMatchObject({ quantity: 0, value: 0, averageCost: null });
  });

  it("keeps quantity that nobody priced out of the average and reports it", () => {
    const position = stockPosition([{ quantityDelta: 40, valueDelta: null }, receive(10, 8)]);
    expect(position).toMatchObject({ quantity: 50, pricedQuantity: 10, unpricedQuantity: 40, value: 80, averageCost: 8 });
  });

  it("refuses a typed-in cost while an average exists, and accepts one only while stock has no price", () => {
    const priced = stockPosition([receive(10, 12)]);
    expect(issueToWorkCost(priced, 4, 99)).toMatchObject({ basis: "weighted_average", unitCost: 12, totalCost: 48, valueDelta: -48 });
    const unpriced = stockPosition([{ quantityDelta: 10, valueDelta: null }]);
    expect(issueToWorkCost(unpriced, 4, 7)).toMatchObject({ basis: "manual", unitCost: 7, totalCost: 28, valueDelta: null });
    expect(() => issueToWorkCost(unpriced, 4, undefined)).toThrow("NO_COST_BASIS");
  });

  it("charges quantity beyond the priced part at the average but takes only the priced value off the shelf", () => {
    const position = stockPosition([{ quantityDelta: 5, valueDelta: null }, receive(5, 10)]);
    expect(issueToWorkCost(position, 8, undefined)).toMatchObject({ unitCost: 10, totalCost: 80, valueDelta: -50 });
  });

  it("moves a transfer's value across without changing the total", () => {
    const source = stockPosition([receive(30, 10), receive(30, 14)]);
    const { source: out, destination: into } = transferValuation(source, 20);
    expect(out.valueDelta).toBe(-240);
    expect(into.valueDelta).toBe(240);
    expect(into.unitCost).toBe(12);
  });

  it("prices a positive adjustment at the average, or leaves it unpriced when there is none", () => {
    expect(adjustmentAtAverage(stockPosition([receive(10, 5)]), 2)).toEqual({ unitCost: 5, valueDelta: 10 });
    expect(adjustmentAtAverage(stockPosition([]), 2)).toEqual({ unitCost: null, valueDelta: null });
  });

  it("rejects a non-finite movement instead of producing NaN", () => {
    expect(() => stockPosition([{ quantityDelta: Number.NaN, valueDelta: 1 }])).toThrow(RangeError);
  });
});
