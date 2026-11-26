import { describe, expect, it } from "vitest";
import { offlineReasons } from "./offlineReasons";
import { wo22Text } from "./wo22Text";

// Review of #557 by programmer C, note 1: a progress save of more than 100 villas kept offline is refused on replay for its missing count — the queue must say
// what to do, not show the raw code.
describe("an offline save refused for its count (review of #557, note 1)", () => {
  it("POSITIVE: names the action in each language — discard it, then save again online", () => {
    expect(offlineReasons("SITE_CONFIRM_COUNT", wo22Text.en.issues, "en")[0]).toContain("save it again while online");
    expect(offlineReasons("SITE_CONFIRM_COUNT", wo22Text.ar.issues, "ar")[0]).toContain("وأنت متصل");
    expect(offlineReasons("SITE_CONFIRM_COUNT", wo22Text.ur.issues, "ur")[0]).toContain("کنکشن پر");
  });
  it("NEGATIVE: the raw code is never what the person reads", () => {
    for (const language of ["ar", "en", "ur"] as const) expect(offlineReasons("SITE_CONFIRM_COUNT", wo22Text[language].issues, language)).not.toContain("SITE_CONFIRM_COUNT");
  });
});
