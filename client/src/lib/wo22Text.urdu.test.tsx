import { describe, expect, it } from "vitest";
import { wo22Text } from "./wo22Text";

// Review of #572 (C, note 2): the refusals of an unknown phase or model read in Urdu on the Urdu screen, not in English.
describe("wo22Text: an unknown phase or model in Urdu", () => {
  it("POSITIVE: names the phase and the model in Urdu", () => {
    expect(wo22Text.ur.issues.SITE_PHASE_UNKNOWN?.(undefined, "PH9")).toContain("مرحلہ «PH9»");
    expect(wo22Text.ur.issues.SITE_MODEL_UNKNOWN?.(undefined, "Z")).toContain("ماڈل «Z»");
  });
  it("NEGATIVE: never the English text", () => {
    expect(wo22Text.ur.issues.SITE_PHASE_UNKNOWN?.(undefined, "PH9")).not.toBe(wo22Text.en.issues.SITE_PHASE_UNKNOWN?.(undefined, "PH9"));
    expect(wo22Text.ur.issues.SITE_MODEL_UNKNOWN?.(undefined, "Z")).not.toBe(wo22Text.en.issues.SITE_MODEL_UNKNOWN?.(undefined, "Z"));
  });
});
