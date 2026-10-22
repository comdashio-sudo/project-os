// Tender comparison beyond levelBids (work order 5, item 8): the lines of each bid against the tender's schedule of items, the items a bid
// left out, the lowest evaluated bid once those items are levelled, and the deviation alerts. No database. levelBids (tenders.ts) keeps the
// bid totals and their adjustments; this module reads the lines inside each bid. Money is integer cents inside and major units out.

export const DEVIATION_THRESHOLD = 0.3; // the same 30% band as levelBids

export type ScheduleItem = { id: string; code?: string | null; description: string; unit: string; quantity: number | string; estimateRate?: number | string | null };
export type BidLine = { code?: string | null; description: string; unit: string; quantity: number | string; rate: number | string };
/** status is the bid's status (tenders.ts): only a "submitted" bid can win, and only those bids set the reference rates and the median */
export type BidderLines = { bidderId: string; supplierName: string; status: string; lines: readonly BidLine[] };

export type UnmatchedReason = "no_schedule_item" | "ambiguous" | "duplicate_line" | "invalid_line";
export type UnifiedLine = { bidderId: string; rate: number; amount: number; matchedBy: "code" | "description" };
export type UnifiedItem = { itemId: string; code: string | null; description: string; unit: string; quantity: number; estimateRate: number | null; lines: UnifiedLine[] };
export type UnmatchedLine = { bidderId: string; code: string | null; description: string; amount: number; reason: UnmatchedReason };

const cents = (value: number | string) => Math.round(Number(value) * 100);
const fromCents = (value: number) => value / 100;
const lineCents = (quantity: number | string, rate: number | string) => Math.round(Number(quantity) * Number(rate) * 100);
const isValidLine = (line: BidLine) => Number.isFinite(Number(line.quantity)) && Number(line.quantity) >= 0 && Number.isFinite(Number(line.rate)) && Number(line.rate) >= 0;

/** Trims, folds case, makes runs of spaces single, and turns Arabic-Indic and Extended Arabic-Indic digits into Latin digits. */
export function normaliseText(value: string | null | undefined): string {
  return (value ?? "").replace(/[٠-٩]/g, ch => String(ch.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, ch => String(ch.charCodeAt(0) - 0x06f0)).replace(/\s+/g, " ").trim().toLowerCase();
}

const codeKey = (code: string | null | undefined) => normaliseText(code) || null;
const descriptionKey = (unit: string, description: string) => `${normaliseText(unit)}|${normaliseText(description)}`;

/**
 * Matches every bidder's lines to the schedule. A line with a code matches the schedule item with the same normalised code, and no other:
 * an unknown code is reported, never guessed at. Only a line WITHOUT a code falls back to the unit and description. When two schedule items
 * share the code (or the key), the line is reported as ambiguous. A bidder's second line for the same item is reported as a duplicate; the
 * first one stands. Invalid lines (negative or not a number) are reported and left out of the bid totals. A line that is reported still
 * counts in its bid's total (compareBids), because the bidder did price it.
 */
export function unifySchedule(schedule: readonly ScheduleItem[], bidders: readonly BidderLines[]): { items: UnifiedItem[]; unmatched: UnmatchedLine[] } {
  const items: UnifiedItem[] = schedule.map(item => ({
    itemId: item.id,
    code: item.code ?? null,
    description: item.description,
    unit: item.unit,
    quantity: Number(item.quantity),
    estimateRate: item.estimateRate === null || item.estimateRate === undefined || Number(item.estimateRate) <= 0 ? null : Number(item.estimateRate),
    lines: [],
  }));
  const byCode = new Map<string, number[]>();
  const byKey = new Map<string, number[]>();
  schedule.forEach((item, index) => {
    const code = codeKey(item.code);
    if (code) byCode.set(code, [...(byCode.get(code) ?? []), index]);
    const key = descriptionKey(item.unit, item.description);
    byKey.set(key, [...(byKey.get(key) ?? []), index]);
  });
  const unmatched: UnmatchedLine[] = [];
  for (const bidder of bidders) {
    for (const line of bidder.lines) {
      const report = { bidderId: bidder.bidderId, code: line.code ?? null, description: line.description, amount: isValidLine(line) ? fromCents(lineCents(line.quantity, line.rate)) : 0 };
      if (!isValidLine(line)) {
        unmatched.push({ ...report, reason: "invalid_line" });
        continue;
      }
      const code = codeKey(line.code);
      const candidates = code ? byCode.get(code) ?? [] : byKey.get(descriptionKey(line.unit, line.description)) ?? [];
      if (candidates.length === 0) {
        unmatched.push({ ...report, reason: "no_schedule_item" });
        continue;
      }
      if (candidates.length > 1) {
        unmatched.push({ ...report, reason: "ambiguous" });
        continue;
      }
      const target = items[candidates[0]];
      if (target.lines.some(existing => existing.bidderId === bidder.bidderId)) {
        unmatched.push({ ...report, reason: "duplicate_line" });
        continue;
      }
      target.lines.push({ bidderId: bidder.bidderId, rate: Number(line.rate), amount: fromCents(lineCents(line.quantity, line.rate)), matchedBy: code ? "code" : "description" });
    }
  }
  return { items, unmatched };
}

export type ItemLevelling = { itemId: string; reason: "missing" | "zero"; rate: number; rateSource: "estimate" | "highest_submitted"; amount: number };
export type BidLevelling = { bidderId: string; missingItemIds: string[]; zeroItemIds: string[]; addOn: number; levelled: ItemLevelling[] };

/**
 * The leveller's add-on for each schedule item a bid did not price: "missing" when the bid has no line for it, "zero" when the line is priced
 * at zero (listed apart, not called missing). The value is the schedule quantity times a reference rate: the estimate rate when the tender has
 * one, otherwise the highest rate submitted for that item by a bid that can still win (status submitted). An item with no reference rate at
 * all is listed in unvaluedItemIds and adds nothing: the leveller cannot price it, and the comparison says so rather than guessing.
 */
export function missingItems(items: readonly UnifiedItem[], bidders: readonly BidderLines[]): { perBidder: BidLevelling[]; unvaluedItemIds: string[] } {
  const eligible = new Set(bidders.filter(bidder => bidder.status === "submitted").map(bidder => bidder.bidderId));
  const reference = new Map<string, { rate: number; rateSource: "estimate" | "highest_submitted" } | null>();
  for (const item of items) {
    if (item.estimateRate !== null) {
      reference.set(item.itemId, { rate: item.estimateRate, rateSource: "estimate" });
      continue;
    }
    const rates = item.lines.filter(line => eligible.has(line.bidderId) && cents(line.amount) > 0).map(line => line.rate);
    reference.set(item.itemId, rates.length ? { rate: Math.max(...rates), rateSource: "highest_submitted" } : null);
  }
  const unvalued = new Set<string>();
  const perBidder = bidders.map(bidder => {
    const levelled: ItemLevelling[] = [];
    const missingIds: string[] = [];
    const zeroIds: string[] = [];
    for (const item of items) {
      const line = item.lines.find(candidate => candidate.bidderId === bidder.bidderId);
      if (line && cents(line.amount) > 0) continue;
      const reason = line ? "zero" : "missing";
      (reason === "zero" ? zeroIds : missingIds).push(item.itemId);
      const ref = reference.get(item.itemId);
      if (!ref) {
        unvalued.add(item.itemId);
        continue;
      }
      levelled.push({ itemId: item.itemId, reason, rate: ref.rate, rateSource: ref.rateSource, amount: fromCents(lineCents(item.quantity, ref.rate)) });
    }
    const addOn = levelled.reduce((sum, item) => sum + cents(item.amount), 0);
    return { bidderId: bidder.bidderId, missingItemIds: missingIds, zeroItemIds: zeroIds, addOn: fromCents(addOn), levelled };
  });
  return { perBidder, unvaluedItemIds: Array.from(unvalued) };
}

export type BidFlag = "lowest" | "missing_items" | "zero_items" | "unmatched_lines" | "below_median" | "above_median" | "below_estimate" | "above_estimate";
export type RateAlert = { itemId: string; flag: "rate_below_median" | "rate_above_median"; rate: number; medianRate: number };

const medianOf = (sorted: readonly number[]): number | null => {
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * The comparison table. Each bid's evaluated total is its priced lines plus the add-on for the items it left out or priced at zero. Only a
 * submitted bid is ranked; a withdrawn or disqualified bid is shown with no rank and takes no part in the lowest, the median or the rates.
 * Ties for the lowest are shown: every tied bid carries rank 1 and the flag "lowest", and lowestBidderIds lists them all.
 * Deviation flags (against the median, the estimate, and each line's rate against the item's median) need at least three comparable (submitted)
 * bids, the same rule as levelBids. A bid with missing items is still ranked; it carries the flag "missing_items".
 */
export function compareBids(input: { schedule: readonly ScheduleItem[]; bidders: readonly BidderLines[]; estimate?: number | string | null; threshold?: number }) {
  const threshold = input.threshold ?? DEVIATION_THRESHOLD;
  const { items, unmatched } = unifySchedule(input.schedule, input.bidders);
  const { perBidder, unvaluedItemIds } = missingItems(items, input.bidders);
  const eligible = eligibleIds(input.bidders);
  const comparable = eligible.size;
  const enoughToFlag = comparable >= 3;
  const estimateCents = input.estimate === null || input.estimate === undefined || Number(input.estimate) <= 0 ? null : cents(input.estimate);

  const totals = input.bidders.map(bidder => {
    const priced = bidder.lines.filter(isValidLine).reduce((sum, line) => sum + lineCents(line.quantity, line.rate), 0);
    const levelling = perBidder.find(candidate => candidate.bidderId === bidder.bidderId)!;
    const unmatchedCount = unmatched.filter(line => line.bidderId === bidder.bidderId).length;
    return { bidder, priced, levelling, unmatchedCount, evaluated: priced + cents(levelling.addOn), isEligible: eligible.has(bidder.bidderId) };
  });
  const eligibleTotals = totals.filter(row => row.isEligible).map(row => row.evaluated).sort((a, b) => a - b);
  const lowest = eligibleTotals.length ? eligibleTotals[0] : null;
  const median = medianOf(eligibleTotals);

  // the median rate of each item, over the submitted bids that priced it above zero
  const medianRateOf = new Map<string, number | null>();
  for (const item of items) {
    const samples = item.lines.filter(line => cents(line.amount) > 0 && eligible.has(line.bidderId)).map(line => line.rate).sort((a, b) => a - b);
    medianRateOf.set(item.itemId, medianOf(samples));
  }

  const rows = totals.map(({ bidder, priced, levelling, unmatchedCount, evaluated, isEligible }) => {
    const rank = isEligible ? 1 + eligibleTotals.filter(total => total < evaluated).length : null;
    const flags: BidFlag[] = [];
    if (isEligible && lowest !== null && evaluated === lowest) flags.push("lowest");
    if (levelling.missingItemIds.length) flags.push("missing_items");
    if (levelling.zeroItemIds.length) flags.push("zero_items");
    if (unmatchedCount) flags.push("unmatched_lines");
    if (isEligible && enoughToFlag && median !== null && median > 0) {
      if (evaluated < median * (1 - threshold)) flags.push("below_median");
      if (evaluated > median * (1 + threshold)) flags.push("above_median");
    }
    if (isEligible && enoughToFlag && estimateCents !== null) {
      if (evaluated < estimateCents * (1 - threshold)) flags.push("below_estimate");
      if (evaluated > estimateCents * (1 + threshold)) flags.push("above_estimate");
    }
    const rateAlerts: RateAlert[] = [];
    if (isEligible && enoughToFlag) {
      for (const item of items) {
        const line = item.lines.find(candidate => candidate.bidderId === bidder.bidderId);
        const medianRate = medianRateOf.get(item.itemId) ?? null;
        if (!line || cents(line.amount) === 0 || medianRate === null || medianRate <= 0) continue;
        if (line.rate < medianRate * (1 - threshold)) rateAlerts.push({ itemId: item.itemId, flag: "rate_below_median", rate: line.rate, medianRate });
        if (line.rate > medianRate * (1 + threshold)) rateAlerts.push({ itemId: item.itemId, flag: "rate_above_median", rate: line.rate, medianRate });
      }
    }
    return {
      bidderId: bidder.bidderId, supplierName: bidder.supplierName, status: bidder.status, eligible: isEligible,
      submitted: fromCents(priced), addOn: levelling.addOn, evaluated: fromCents(evaluated),
      missingItemIds: levelling.missingItemIds, zeroItemIds: levelling.zeroItemIds, unmatchedLineCount: unmatchedCount,
      rank, flags, rateAlerts,
    };
  });
  // the table reads best-first; bids that cannot win sit below the ranked ones
  rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.supplierName.localeCompare(b.supplierName));
  const lowestBidderIds = lowest === null ? [] : rows.filter(row => row.eligible && row.rank === 1).map(row => row.bidderId);
  return {
    bids: rows,
    schedule: items,
    unmatched,
    unvaluedItemIds,
    lowest: lowest === null ? null : fromCents(lowest),
    lowestBidderIds,
    tiedForLowest: lowestBidderIds.length > 1,
    median: median === null ? null : fromCents(median),
    comparable,
  };
}

/** The bids that can win: status submitted. Withdrawn and disqualified bids are shown, but not compared. */
function eligibleIds(bidders: readonly BidderLines[]): Set<string> {
  return new Set(bidders.filter(bidder => bidder.status === "submitted").map(bidder => bidder.bidderId));
}
