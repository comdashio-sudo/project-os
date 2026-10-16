import { describe, expect, it } from "vitest";
import { levelBids, tenderTransitions } from "./tenders";

const bid = (id: string, amount: number, status = "submitted", durationDays: number | null = 90) => ({ id, supplierId: `s-${id}`, supplierName: `Supplier ${id}`, status, amount, durationDays });

describe("bid levelling", () => {
  it("puts every bid on the same scope before ranking: a cheap bid with a scope gap can lose to a dearer complete one", () => {
    const result = levelBids([bid("a", 1000), bid("b", 1100), bid("c", 1200)], [{ bidId: "a", amount: 250 }, { bidId: "b", amount: -20 }]);
    expect(result.bids.map(item => [item.id, item.levelledTotal, item.rank])).toEqual([["b", 1080, 1], ["c", 1200, 2], ["a", 1250, 3]]);
    expect(result.bids[0]).toMatchObject({ amount: 1100, adjustments: -20, aboveLowest: 0, flags: ["lowest"] });
    expect(result.bids[2]).toMatchObject({ aboveLowest: 170, aboveLowestPercent: 15.7 });
    expect(result.lowest).toBe(1080);
  });

  it("sums several adjustments on one bid, and ties share a rank", () => {
    const result = levelBids([bid("a", 500), bid("b", 450)], [{ bidId: "b", amount: 30 }, { bidId: "b", amount: 20 }]);
    expect(result.bids.map(item => [item.id, item.rank])).toEqual([["a", 1], ["b", 1]]);
    expect(result.bids.every(item => item.flags.includes("lowest"))).toBe(true);
  });

  it("keeps a withdrawn or disqualified bid in the table with no rank, and out of the median and the lowest", () => {
    const result = levelBids([bid("a", 1000), bid("b", 900, "withdrawn"), bid("c", 1100), bid("d", 10, "disqualified")], []);
    expect(result.comparable).toBe(2);
    expect(result.lowest).toBe(1000);
    expect(result.bids.map(item => [item.id, item.rank])).toEqual([["a", 1], ["c", 2], ["b", null], ["d", null]]);
    expect(result.bids.find(item => item.id === "b")).toMatchObject({ aboveLowest: null, flags: [] });
  });

  it("flags a bid 30% off the median, but only with three comparable bids (two cannot say which is odd)", () => {
    const two = levelBids([bid("a", 1000), bid("b", 2000)], []);
    expect(two.bids.flatMap(item => item.flags).filter(flag => flag !== "lowest")).toEqual([]);
    const four = levelBids([bid("a", 1000), bid("b", 1020), bid("c", 1040), bid("d", 1800)], []);
    expect(four.bids.find(item => item.id === "d")?.flags).toEqual(["above_median_30"]);
    const low = levelBids([bid("a", 1000), bid("b", 1020), bid("c", 1040), bid("d", 500)], []);
    expect(low.bids.find(item => item.id === "d")?.flags).toEqual(["lowest", "below_median_30"]);
  });

  it("reads each bid against the estimate when there is one, and says nothing when there is none", () => {
    const withEstimate = levelBids([bid("a", 900), bid("b", 1100)], [], 1000);
    expect(withEstimate.bids.map(item => item.versusEstimatePercent)).toEqual([-10, 10]);
    expect(levelBids([bid("a", 900)], [], null).bids[0].versusEstimatePercent).toBeNull();
    expect(levelBids([bid("a", 900)], [], 0).bids[0].versusEstimatePercent).toBeNull();
  });

  it("handles no bids, and money in fractions without drifting", () => {
    expect(levelBids([], [])).toMatchObject({ bids: [], lowest: null, median: null, comparable: 0 });
    const result = levelBids([bid("a", 0.1), bid("b", 0.2)], [{ bidId: "a", amount: 0.2 }]);
    expect(result.bids.find(item => item.id === "a")?.levelledTotal).toBe(0.3); // 0.1 + 0.2 in floating point is 0.30000000000000004
  });
});

describe("tender status flow", () => {
  it("opens, closes, may reopen for a late bidder, and ends in an award or a cancellation that nothing leaves", () => {
    expect(tenderTransitions.draft).toEqual(["open", "cancelled"]);
    expect(tenderTransitions.closed).toContain("open");
    expect(tenderTransitions.awarded).toEqual([]);
    expect(tenderTransitions.cancelled).toEqual([]);
    expect(tenderTransitions.open).not.toContain("awarded"); // an award needs the bids closed first
  });
});
