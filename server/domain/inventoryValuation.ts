/**
 * Stock valuation by weighted average (owner decision, work order 3).
 *
 * Every warehouse movement that has a price carries `valueDelta` (money in or out of the shelf) next to its quantity.
 * The average cost of a (warehouse, material) is the priced value divided by the priced quantity, so a receipt at a new
 * price moves the average and an issue leaves it where it was: an issue is valued at the average, never at a number typed in.
 * A movement without a price (stock that predates valuation, or a quantity-only adjustment on stock whose cost is unknown)
 * has `valueDelta = null`; it counts in the quantity but not in the average, and the screen reports that quantity beside the value
 * so nobody reads "no price" as "worth nothing".
 */

export type StockMovement = { quantityDelta: number; valueDelta: number | null };

export type StockPosition = {
  /** Everything on the shelf. */
  quantity: number;
  /** The part of it that has a price behind it. */
  pricedQuantity: number;
  /** Money held on the shelf (priced part only). */
  value: number;
  /** The shelf quantity nobody has put a price on. */
  unpricedQuantity: number;
  /** Weighted average cost per unit, or null while no priced stock is on the shelf. */
  averageCost: number | null;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const round3 = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;
const round4 = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

export function stockPosition(movements: readonly StockMovement[]): StockPosition {
  let quantity = 0; let pricedQuantity = 0; let value = 0;
  for (const movement of movements) {
    if (!Number.isFinite(movement.quantityDelta) || (movement.valueDelta !== null && !Number.isFinite(movement.valueDelta))) throw new RangeError("A stock movement is not a finite number.");
    quantity += movement.quantityDelta;
    if (movement.valueDelta !== null) { pricedQuantity += movement.quantityDelta; value += movement.valueDelta; }
  }
  quantity = round3(quantity); pricedQuantity = round3(pricedQuantity); value = round2(value);
  const averageCost = pricedQuantity > 0 && value > 0 ? round4(value / pricedQuantity) : null;
  return { quantity, pricedQuantity: Math.max(0, pricedQuantity), value: pricedQuantity > 0 ? value : 0, unpricedQuantity: Math.max(0, round3(quantity - Math.max(0, pricedQuantity))), averageCost };
}

export type PricedMovement = { unitCost: number | null; valueDelta: number | null };

/** A receipt (or a positive adjustment) at a stated unit cost. */
export function pricedReceipt(quantity: number, unitCost: number): PricedMovement & { unitCost: number; valueDelta: number } {
  if (!(quantity > 0) || !Number.isFinite(quantity)) throw new RangeError("A receipt needs a positive quantity.");
  if (!(unitCost > 0) || !Number.isFinite(unitCost)) throw new RangeError("A receipt needs a positive unit cost.");
  return { unitCost: round4(unitCost), valueDelta: round2(quantity * unitCost) };
}

/**
 * Stock leaving the shelf (an issue, a transfer out, a write-off) is valued at the average cost of what is there.
 * Taking everything priced leaves exactly zero value, so rounding never strands a few cents on an empty shelf.
 * With no priced stock the movement stays unpriced (`unitCost: null`): the caller decides whether that is acceptable.
 */
export function valuedIssue(position: StockPosition, quantity: number): PricedMovement {
  if (!(quantity > 0) || !Number.isFinite(quantity)) throw new RangeError("An issue needs a positive quantity.");
  if (position.averageCost === null) return { unitCost: null, valueDelta: null };
  const takesAllPriced = quantity >= position.pricedQuantity;
  const value = takesAllPriced ? position.value : round2(quantity * position.averageCost);
  return { unitCost: position.averageCost, valueDelta: -value };
}

/** A positive adjustment with no price takes the current average (the average does not move); with no average it stays unpriced. */
export function adjustmentAtAverage(position: StockPosition, quantity: number): PricedMovement {
  if (!(quantity > 0)) throw new RangeError("An adjustment up needs a positive quantity.");
  if (position.averageCost === null) return { unitCost: null, valueDelta: null };
  return { unitCost: position.averageCost, valueDelta: round2(quantity * position.averageCost) };
}

export type IssueCostBasis = "weighted_average" | "manual";

/**
 * The cost an issue to work is charged at. The average wins whenever one exists. A typed-in cost is accepted only while stock has no
 * price at all (older stock), and the result says which one was used so the record shows where the number came from.
 */
export function issueToWorkCost(position: StockPosition, quantity: number, manualUnitCost: number | undefined): { unitCost: number; totalCost: number; basis: IssueCostBasis; valueDelta: number | null } {
  const valued = valuedIssue(position, quantity);
  if (valued.unitCost !== null && valued.valueDelta !== null) {
    // Taking more than the priced part (the rest is unpriced stock) is still charged at the average: the shelf only gives up what it holds a price for.
    const beyondPriced = quantity > position.pricedQuantity ? round3(quantity - position.pricedQuantity) * valued.unitCost : 0;
    return { unitCost: valued.unitCost, totalCost: round2(-valued.valueDelta + beyondPriced), basis: "weighted_average", valueDelta: valued.valueDelta };
  }
  if (manualUnitCost === undefined || !(manualUnitCost > 0) || !Number.isFinite(manualUnitCost)) throw new RangeError("NO_COST_BASIS");
  return { unitCost: round4(manualUnitCost), totalCost: round2(quantity * manualUnitCost), basis: "manual", valueDelta: null };
}

/** Where a transfer moves cost: the destination receives exactly the value the source gave up, so the total never changes. */
export function transferValuation(position: StockPosition, quantity: number): { source: PricedMovement; destination: PricedMovement } {
  const out = valuedIssue(position, quantity);
  if (out.valueDelta === null) return { source: out, destination: { unitCost: null, valueDelta: null } };
  const value = -out.valueDelta;
  return { source: out, destination: { unitCost: round4(value / quantity), valueDelta: value } };
}
