import { describe, expect, it } from "vitest";
import { activityName, defaultActivityNameLanguage, hasEnglishNames } from "./activityNames";

// Q-49: the activity name in the chosen language, never blank; the default follows the interface.
describe("activity names (Q-49)", () => {
  it("POSITIVE: the chosen language's name when there is one", () => {
    expect(activityName({ name: "صب القواعد", nameEn: "Footings" }, "en")).toEqual({ text: "Footings", otherLanguage: false });
    expect(activityName({ name: "صب القواعد", nameEn: "Footings" }, "ar")).toEqual({ text: "صب القواعد", otherLanguage: false });
  });

  it("NEGATIVE: a missing or blank English name falls back to the Arabic one, marked as the other language — never blank", () => {
    expect(activityName({ name: "صب القواعد", nameEn: null }, "en")).toEqual({ text: "صب القواعد", otherLanguage: true });
    expect(activityName({ name: "صب القواعد", nameEn: "  " }, "en")).toEqual({ text: "صب القواعد", otherLanguage: true });
  });

  it("the default follows the interface (Urdu reads Arabic names); the switch is offered only when some English name exists", () => {
    expect([defaultActivityNameLanguage("ar"), defaultActivityNameLanguage("en"), defaultActivityNameLanguage("ur")]).toEqual(["ar", "en", "ar"]);
    expect(hasEnglishNames([{ nameEn: null }, { nameEn: "" }])).toBe(false);
    expect(hasEnglishNames([{ nameEn: null }, { nameEn: "Footings" }])).toBe(true);
    expect(hasEnglishNames(undefined)).toBe(false);
  });
});
