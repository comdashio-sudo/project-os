import { describe, expect, it } from "vitest";
import { compareBids, missingItems, normaliseText, unifySchedule, type BidderLines, type BidLine, type ScheduleItem } from "./bidComparison";

// Invented items and bidders only (example names, example codes).
const schedule: ScheduleItem[] = [
  { id: "i1", code: "01-001", description: "Excavation", unit: "m3", quantity: 10, estimateRate: 20 },
  { id: "i2", code: "01-002", description: "Concrete C30", unit: "m3", quantity: 5, estimateRate: 300 },
  { id: "i3", code: null, description: "Site cabin", unit: "lump", quantity: 1, estimateRate: 1000 },
];

const line = (code: string | null, description: string, unit: string, quantity: number, rate: number | string): BidLine => ({ code, description, unit, quantity, rate });
const bidder = (bidderId: string, status: string, lines: BidLine[]): BidderLines => ({ bidderId, supplierName: `Supplier ${bidderId}`, status, lines });

describe("text normalisation for matching", () => {
  it("trims, folds case, collapses spaces, and reads Arabic-Indic digits as Latin ones", () => {
    expect(normaliseText("  ITEM-٠١  ")).toBe("item-01");
    expect(normaliseText("۰۳ - ۱۲")).toBe("03 - 12");
    expect(normaliseText("Site    cabin")).toBe("site cabin");
    expect(normaliseText(null)).toBe("");
    expect(normaliseText(undefined)).toBe("");
  });
});

describe("unifying the lines with the schedule", () => {
  const bidders = [
    bidder("a", "submitted", [
      line(" 01-001 ", "Excavation", "m3", 10, 22), // code, with spaces around it
      line("01-٠٠٢", "Concrete C30", "m3", 5, 310), // code, with Arabic-Indic digits
      line(null, "Site  cabin", "lump", 1, 1000), // no code: falls back to unit and description
      line("99-999", "Unknown work", "m3", 1, 5), // a code the schedule does not have
      line("CAB", "Site cabin", "lump", 1, 1000), // an unknown code is not rescued by its description
    ]),
    bidder("b", "submitted", [
      line("01-001", "Excavation", "m3", 10, 19),
      line(null, "Excavation", "m3", 10, 18), // the same item again, by description: a duplicate
      line(null, "Concrete C30", "m3", 5, 300),
    ]),
    bidder("c", "submitted", [line("01-001", "Excavation", "m3", 10, -1)]), // a negative rate is an invalid line
  ];

  it("matches by normalised code first, and by unit and description only for a line with no code", () => {
    const { items } = unifySchedule(schedule, bidders);
    expect(items.map(item => item.itemId)).toEqual(["i1", "i2", "i3"]);
    expect(items[0].lines).toEqual([
      { bidderId: "a", rate: 22, amount: 220, matchedBy: "code" },
      { bidderId: "b", rate: 19, amount: 190, matchedBy: "code" },
    ]);
    expect(items[1].lines).toEqual([
      { bidderId: "a", rate: 310, amount: 1550, matchedBy: "code" },
      { bidderId: "b", rate: 300, amount: 1500, matchedBy: "description" },
    ]);
    expect(items[2].lines).toEqual([{ bidderId: "a", rate: 1000, amount: 1000, matchedBy: "description" }]);
  });

  it("reports every line it could not match or that is a duplicate, with the reason, and keeps the schedule's own estimate rates", () => {
    const { items, unmatched } = unifySchedule(schedule, bidders);
    expect(unmatched).toEqual([
      { bidderId: "a", code: "99-999", description: "Unknown work", amount: 5, reason: "no_schedule_item" },
      { bidderId: "a", code: "CAB", description: "Site cabin", amount: 1000, reason: "no_schedule_item" },
      { bidderId: "b", code: null, description: "Excavation", amount: 180, reason: "duplicate_line" },
      { bidderId: "c", code: "01-001", description: "Excavation", amount: 0, reason: "invalid_line" },
    ]);
    expect(items.map(item => item.estimateRate)).toEqual([20, 300, 1000]);
  });

  it("reports a line as ambiguous when two schedule items share its code, or its unit and description", () => {
    const twins: ScheduleItem[] = [
      { id: "p", code: "X", description: "Paint", unit: "m2", quantity: 3, estimateRate: null },
      { id: "q", code: "x ", description: "Paint walls", unit: "m2", quantity: 3, estimateRate: null },
      { id: "r", code: null, description: "Tiles", unit: "m2", quantity: 1, estimateRate: null },
      { id: "s", code: null, description: " tiles ", unit: "M2", quantity: 1, estimateRate: null },
    ];
    const { unmatched } = unifySchedule(twins, [bidder("a", "submitted", [line("X", "Paint", "m2", 3, 10), line(null, "TILES", "m2", 1, 40)])]);
    expect(unmatched.map(item => item.reason)).toEqual(["ambiguous", "ambiguous"]);
  });
});

describe("the items a bid left out, and the add-on the leveller would put on them", () => {
  it("values a missing item at its estimate rate, and lists a zero-priced item apart from the missing ones", () => {
    const bidders = [
      bidder("a", "submitted", [line("01-001", "Excavation", "m3", 10, 22)]), // i2 and i3 missing
      bidder("b", "submitted", [line("01-001", "Excavation", "m3", 10, 19), line("01-002", "Concrete C30", "m3", 5, 300), line(null, "Site cabin", "lump", 1, 0)]),
      bidder("c", "withdrawn", []), // missing everything, but still computed
    ];
    const { items } = unifySchedule(schedule, bidders);
    const { perBidder } = missingItems(items, bidders);
    expect(perBidder.find(row => row.bidderId === "a")).toEqual({
      bidderId: "a",
      missingItemIds: ["i2", "i3"],
      zeroItemIds: [],
      addOn: 2500,
      levelled: [
        { itemId: "i2", reason: "missing", rate: 300, rateSource: "estimate", amount: 1500 },
        { itemId: "i3", reason: "missing", rate: 1000, rateSource: "estimate", amount: 1000 },
      ],
    });
    expect(perBidder.find(row => row.bidderId === "b")).toMatchObject({ missingItemIds: [], zeroItemIds: ["i3"], addOn: 1000 });
    expect(perBidder.find(row => row.bidderId === "c")).toMatchObject({ missingItemIds: ["i1", "i2", "i3"], addOn: 2700 });
  });

  it("uses the highest rate submitted by a bid that can still win when there is no estimate, and ignores a withdrawn bid's rate", () => {
    const noEstimate: ScheduleItem[] = [{ id: "h", code: "H-1", description: "Blockwork", unit: "m2", quantity: 4, estimateRate: null }];
    const bidders = [
      bidder("a", "submitted", [line("H-1", "Blockwork", "m2", 4, 50)]),
      bidder("b", "submitted", [line("H-1", "Blockwork", "m2", 4, 40)]),
      bidder("c", "withdrawn", [line("H-1", "Blockwork", "m2", 4, 90)]),
      bidder("d", "submitted", []),
    ];
    const { items } = unifySchedule(noEstimate, bidders);
    const { perBidder, unvaluedItemIds } = missingItems(items, bidders);
    expect(perBidder.find(row => row.bidderId === "d")).toMatchObject({
      missingItemIds: ["h"],
      addOn: 200,
      levelled: [{ itemId: "h", reason: "missing", rate: 50, rateSource: "highest_submitted", amount: 200 }],
    });
    expect(unvaluedItemIds).toEqual([]);
  });

  it("lists an item that nobody priced and that has no estimate as unvalued, and adds nothing for it", () => {
    const unpriced: ScheduleItem[] = [{ id: "u", code: "U-1", description: "Unpriced item", unit: "lump", quantity: 1, estimateRate: null }];
    const bidders = [bidder("a", "submitted", []), bidder("b", "submitted", [])];
    const { items } = unifySchedule(unpriced, bidders);
    const { perBidder, unvaluedItemIds } = missingItems(items, bidders);
    expect(unvaluedItemIds).toEqual(["u"]);
    expect(perBidder.map(row => row.addOn)).toEqual([0, 0]);
  });
});

describe("the comparison table", () => {
  it("ranks on the total after levelling the missing items, so a bid cheap on its own lines can lose", () => {
    const bidders = [
      bidder("A", "submitted", [line("01-001", "Excavation", "m3", 10, 10)]), // 100 priced, i2 missing: 1,500 added
      bidder("B", "submitted", [line("01-001", "Excavation", "m3", 10, 10), line("01-002", "Concrete C30", "m3", 5, 290)]), // 1,550
      bidder("C", "submitted", [line("01-001", "Excavation", "m3", 10, 20), line("01-002", "Concrete C30", "m3", 5, 300)]), // 1,700
    ];
    const result = compareBids({ schedule: schedule.slice(0, 2), bidders });
    expect(result.bids.map(row => [row.bidderId, row.submitted, row.addOn, row.evaluated, row.rank])).toEqual([
      ["B", 1550, 0, 1550, 1],
      ["A", 100, 1500, 1600, 2],
      ["C", 1700, 0, 1700, 3],
    ]);
    expect(result.lowest).toBe(1550);
    expect(result.lowestBidderIds).toEqual(["B"]);
    expect(result.tiedForLowest).toBe(false);
    expect(result.median).toBe(1600);
    expect(result.comparable).toBe(3);
  });

  it("keeps a bid with missing items in the table, ranked and flagged", () => {
    const bidders = [
      bidder("A", "submitted", [line("01-001", "Excavation", "m3", 10, 10)]),
      bidder("B", "submitted", [line("01-001", "Excavation", "m3", 10, 10), line("01-002", "Concrete C30", "m3", 5, 290)]),
      bidder("C", "submitted", [line("01-001", "Excavation", "m3", 10, 20), line("01-002", "Concrete C30", "m3", 5, 300)]),
    ];
    const result = compareBids({ schedule: schedule.slice(0, 2), bidders });
    expect(result.bids.find(row => row.bidderId === "A")).toMatchObject({ rank: 2, flags: ["missing_items"], missingItemIds: ["i2"] });
    expect(result.bids.find(row => row.bidderId === "B")?.flags).toEqual(["lowest"]);
  });

  it("shows a tie for the lowest instead of breaking it: both bids rank first and carry the lowest flag", () => {
    const bidders = [
      bidder("A", "submitted", [line("01-001", "Excavation", "m3", 10, 10)]), // 100 + 1,500 added = 1,600
      bidder("B", "submitted", [line("01-001", "Excavation", "m3", 10, 10), line("01-002", "Concrete C30", "m3", 5, 300)]), // 1,600
      bidder("C", "submitted", [line("01-001", "Excavation", "m3", 10, 20), line("01-002", "Concrete C30", "m3", 5, 300)]), // 1,700
    ];
    const result = compareBids({ schedule: schedule.slice(0, 2), bidders });
    expect(result.lowest).toBe(1600);
    expect(result.lowestBidderIds).toEqual(["A", "B"]);
    expect(result.tiedForLowest).toBe(true);
    expect(result.bids.slice(0, 2).map(row => [row.bidderId, row.rank, row.flags.includes("lowest")])).toEqual([
      ["A", 1, true],
      ["B", 1, true],
    ]);
  });

  it("keeps a withdrawn bid in the table with no rank, and out of the lowest and the median", () => {
    const bidders = [
      bidder("A", "submitted", [line("01-001", "Excavation", "m3", 10, 10), line("01-002", "Concrete C30", "m3", 5, 300)]), // 1,600
      bidder("B", "submitted", [line("01-001", "Excavation", "m3", 10, 10), line("01-002", "Concrete C30", "m3", 5, 320)]), // 1,700
      bidder("W", "withdrawn", [line("01-001", "Excavation", "m3", 10, 1), line("01-002", "Concrete C30", "m3", 5, 1)]), // 15
    ];
    const result = compareBids({ schedule: schedule.slice(0, 2), bidders });
    expect(result.bids.map(row => [row.bidderId, row.rank])).toEqual([
      ["A", 1],
      ["B", 2],
      ["W", null],
    ]);
    expect(result.lowest).toBe(1600);
    expect(result.median).toBe(1650);
    expect(result.comparable).toBe(2);
    expect(result.bids[2].flags).toEqual([]);
  });

  it("counts a line that matches nothing in the bid total, and flags it", () => {
    const bidders = [
      bidder("A", "submitted", [line("01-001", "Excavation", "m3", 10, 10), line("XX", "Extra item", "lump", 1, 50)]),
      bidder("B", "submitted", [line("01-001", "Excavation", "m3", 10, 10)]),
    ];
    const result = compareBids({ schedule: schedule.slice(0, 1), bidders });
    expect(result.bids.find(row => row.bidderId === "A")).toMatchObject({ rank: 2, submitted: 150, evaluated: 150, unmatchedLineCount: 1, flags: ["unmatched_lines"] });
    expect(result.bids.find(row => row.bidderId === "B")?.flags).toEqual(["lowest"]);
  });

  it("adds money in cents, so three lines of 0.1 make exactly 0.3", () => {
    const three: ScheduleItem[] = [
      { id: "x1", code: "X1", description: "One", unit: "lump", quantity: 1, estimateRate: null },
      { id: "x2", code: "X2", description: "Two", unit: "lump", quantity: 1, estimateRate: null },
      { id: "x3", code: "X3", description: "Three", unit: "lump", quantity: 1, estimateRate: null },
    ];
    const result = compareBids({ schedule: three, bidders: [bidder("a", "submitted", [line("X1", "One", "lump", 1, 0.1), line("X2", "Two", "lump", 1, 0.1), line("X3", "Three", "lump", 1, 0.1)])] });
    expect(result.bids[0].submitted).toBe(0.3);
    expect(result.bids[0].evaluated).toBe(0.3);
  });
});

describe("deviation alerts", () => {
  const single: ScheduleItem[] = [{ id: "w", code: "W-1", description: "Works", unit: "lump", quantity: 1, estimateRate: null }];
  const lump = (id: string, rate: number) => bidder(id, "submitted", [line("W-1", "Works", "lump", 1, rate)]);

  it("flags a bid more than 30% above the median, and a line whose rate is far from the median rate", () => {
    const result = compareBids({ schedule: single, bidders: [lump("a", 1000), lump("b", 1020), lump("c", 1040), lump("d", 1800)] });
    expect(result.median).toBe(1030);
    expect(result.bids.find(row => row.bidderId === "d")).toMatchObject({
      flags: ["above_median"],
      rateAlerts: [{ itemId: "w", flag: "rate_above_median", rate: 1800, medianRate: 1030 }],
    });
    expect(result.bids.find(row => row.bidderId === "a")?.flags).toEqual(["lowest"]);
    expect(result.bids.find(row => row.bidderId === "b")).toMatchObject({ flags: [], rateAlerts: [] });
  });

  it("flags a bid against the estimate when it is more than 30% above it, and takes the estimate as text too", () => {
    const result = compareBids({ schedule: single, bidders: [lump("a", 1400), lump("b", 1100), lump("c", 1050)], estimate: "1000.00" });
    expect(result.bids.find(row => row.bidderId === "a")?.flags).toEqual(["above_estimate"]);
    expect(result.bids.find(row => row.bidderId === "c")?.flags).toEqual(["lowest"]);
  });

  it("uses the threshold it is given in place of 30%", () => {
    const bidders = [lump("a", 1000), lump("b", 1000), lump("c", 1000), lump("d", 1150)];
    expect(compareBids({ schedule: single, bidders }).bids.find(row => row.bidderId === "d")?.flags).toEqual([]);
    expect(compareBids({ schedule: single, bidders, threshold: 0.1 }).bids.find(row => row.bidderId === "d")?.flags).toEqual(["above_median"]);
  });

  it("raises no outlier flag with fewer than three comparable bids, the same rule as levelBids", () => {
    const result = compareBids({ schedule: single, bidders: [lump("a", 1000), lump("b", 2000)], estimate: 500 });
    expect(result.bids.find(row => row.bidderId === "a")?.flags).toEqual(["lowest"]);
    expect(result.bids.find(row => row.bidderId === "b")?.flags).toEqual([]);
    expect(result.bids.every(row => row.rateAlerts.length === 0)).toBe(true);
  });
});
