// Tenders before award (work order 5, item 8): the rules that need no database, so the comparison can be tested alone and the screen can
// read the same words. The service (server/tenderService.ts) applies them inside transactions.

export const TENDER_STATUSES = ["draft", "open", "closed", "awarded", "cancelled"] as const;
export type TenderStatus = (typeof TENDER_STATUSES)[number];
export const INVITEE_STATUSES = ["invited", "declined", "submitted"] as const;
export const BID_STATUSES = ["submitted", "withdrawn", "disqualified"] as const;
export type BidStatus = (typeof BID_STATUSES)[number];
/**
 * Levelling puts every bid on the same scope before the prices are compared:
 *  scope_gap  - something the tender asked for that this bidder left out (priced by the leveller, added to the bid)
 *  exclusion  - a condition the bidder excluded and the employer would have to carry (added)
 *  correction - an arithmetic or unit error found in the bid (added or subtracted)
 *  discount   - a discount offered in the covering letter (subtracted)
 */
export const ADJUSTMENT_KINDS = ["scope_gap", "exclusion", "correction", "discount"] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

export const tenderTransitions: Record<TenderStatus, readonly TenderStatus[]> = { draft: ["open", "cancelled"], open: ["closed", "cancelled"], closed: ["open", "awarded", "cancelled"], awarded: [], cancelled: [] };

const cents = (value: number | string) => Math.round(Number(value) * 100);
const fromCents = (value: number) => value / 100;

export type ComparableBid = { id: string; supplierId: string; supplierName: string; status: string; amount: string | number; durationDays: number | null };
export type ComparableAdjustment = { bidId: string; amount: string | number };

export type LevelledBid = {
  id: string; supplierId: string; supplierName: string; status: string; amount: number; adjustments: number; levelledTotal: number; durationDays: number | null;
  /** 1 = the lowest levelled total among the bids that can still win; null for a withdrawn or disqualified bid */
  rank: number | null; aboveLowest: number | null; aboveLowestPercent: number | null; versusEstimatePercent: number | null;
  flags: Array<"lowest" | "below_median_30" | "above_median_30">;
};

/**
 * The comparison table. A bid that is withdrawn or disqualified is shown (the record is kept) but has no rank and takes no part in the
 * median that the outlier flags are measured against. Ties share a rank. The estimate is optional: without one, no percentage against it.
 */
export function levelBids(bids: readonly ComparableBid[], adjustments: readonly ComparableAdjustment[], estimate?: number | string | null) {
  const byBid = new Map<string, number>();
  for (const item of adjustments) byBid.set(item.bidId, (byBid.get(item.bidId) ?? 0) + cents(item.amount));
  const rows = bids.map(bid => {
    const adjustment = byBid.get(bid.id) ?? 0;
    return { bid, adjustment, levelled: cents(bid.amount) + adjustment, eligible: bid.status === "submitted" };
  });
  const eligibleTotals = rows.filter(row => row.eligible).map(row => row.levelled).sort((a, b) => a - b);
  const lowest = eligibleTotals.length ? eligibleTotals[0] : null;
  const median = eligibleTotals.length ? (eligibleTotals.length % 2 ? eligibleTotals[(eligibleTotals.length - 1) / 2] : (eligibleTotals[eligibleTotals.length / 2 - 1] + eligibleTotals[eligibleTotals.length / 2]) / 2) : null;
  const estimateCents = estimate === null || estimate === undefined || Number(estimate) <= 0 ? null : cents(estimate);
  const ranked: LevelledBid[] = rows.map(({ bid, adjustment, levelled, eligible }) => {
    const rank = eligible ? 1 + eligibleTotals.filter(total => total < levelled).length : null;
    const flags: LevelledBid["flags"] = [];
    if (eligible && lowest !== null && levelled === lowest) flags.push("lowest");
    // an outlier is only meaningful with at least three comparable bids; two bids cannot tell which one is odd
    if (eligible && median !== null && eligibleTotals.length >= 3 && median > 0) {
      if (levelled < median * 0.7) flags.push("below_median_30");
      if (levelled > median * 1.3) flags.push("above_median_30");
    }
    return {
      id: bid.id, supplierId: bid.supplierId, supplierName: bid.supplierName, status: bid.status, amount: fromCents(cents(bid.amount)), adjustments: fromCents(adjustment), levelledTotal: fromCents(levelled), durationDays: bid.durationDays,
      rank, aboveLowest: eligible && lowest !== null ? fromCents(levelled - lowest) : null,
      aboveLowestPercent: eligible && lowest !== null && lowest > 0 ? Math.round(((levelled - lowest) / lowest) * 1000) / 10 : null,
      versusEstimatePercent: eligible && estimateCents ? Math.round(((levelled - estimateCents) / estimateCents) * 1000) / 10 : null,
      flags,
    };
  });
  // the table reads best-first; withdrawn and disqualified bids sit below the live ones
  ranked.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.supplierName.localeCompare(b.supplierName));
  return { bids: ranked, lowest: lowest === null ? null : fromCents(lowest), median: median === null ? null : fromCents(median), comparable: eligibleTotals.length };
}
