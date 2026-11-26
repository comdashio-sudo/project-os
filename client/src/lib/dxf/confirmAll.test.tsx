import { describe, expect, it } from "vitest";
import { confirmAllProposals, type ReviewItem } from "./dxfReview";

// Q-62 batch 3: «confirm all» on a vector plan — every clear proposal confirmed at once; anything doubtful left for a person.
const item = (polygonId: string, state: ReviewItem["state"], unitId: string | null): ReviewItem => ({ polygonId, layer: "PDF", unitId, unitCode: unitId, state, reason: null, candidateUnitIds: [] });

describe("confirming every proposal at once (Q-62 batch 3)", () => {
  it("POSITIVE: every proposal with one shape for its villa is confirmed as proposed; unlinked and confirmed shapes stay as they are", () => {
    const result = confirmAllProposals([item("p1", "proposed", "700"), item("p2", "proposed", "701"), item("p3", "unlinked", null), item("p4", "confirmed", "702")]);
    expect(result).toMatchObject({ confirmed: 2, leftForPerson: 0 });
    expect(result.items.map(entry => [entry.polygonId, entry.state, entry.unitId])).toEqual([["p1", "confirmed", "700"], ["p2", "confirmed", "701"], ["p3", "unlinked", null], ["p4", "confirmed", "702"]]);
  });

  it("NEGATIVE: a villa already confirmed elsewhere, or proposed on two shapes, is never guessed — left proposed for a person", () => {
    const result = confirmAllProposals([item("p1", "proposed", "700"), item("p2", "proposed", "700"), item("p3", "proposed", "702"), item("p4", "confirmed", "702"), item("p5", "proposed", "703")]);
    expect(result).toMatchObject({ confirmed: 1, leftForPerson: 3 });
    expect(result.items.filter(entry => entry.state === "proposed").map(entry => entry.polygonId)).toEqual(["p1", "p2", "p3"]);
  });
});
