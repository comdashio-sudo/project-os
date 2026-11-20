import { describe, expect, it } from "vitest";
import { defaultCommercialPlans } from "../../../server/domain/commercialCatalog";
import { planLabel, TRANSLATED_PLAN_CODES } from "./planNames";

describe("plan names in the interface language (G-213, Q-47)", () => {
  it("every shipped plan has an Arabic and an Urdu name, with no Latin letters in them", () => {
    for (const plan of defaultCommercialPlans) {
      expect(TRANSLATED_PLAN_CODES).toContain(plan.code);
      for (const language of ["ar", "ur"] as const) {
        const label = planLabel(plan, language);
        expect(label).not.toBe(plan.name);
        expect(label).not.toMatch(/[A-Za-z]/);
      }
    }
  });

  it("names the example plan the way the owner wrote it", () => {
    expect(planLabel({ code: "ALL_IN_ONE_STANDARD", name: "All-In-One Standard" }, "ar")).toBe("الشاملة — القياسية");
  });

  it("keeps the stored name in English, for a code it does not know, and when the code is missing", () => {
    expect(planLabel({ code: "ALL_IN_ONE_STANDARD", name: "All-In-One Standard" }, "en")).toBe("All-In-One Standard");
    expect(planLabel({ code: "SOMETHING_NEW", name: "Something New" }, "ar")).toBe("Something New");
    expect(planLabel({ code: null, name: "Legacy plan" }, "ur")).toBe("Legacy plan");
  });

  it("gives each plan a distinct name in each language", () => {
    for (const language of ["ar", "ur"] as const) {
      const names = defaultCommercialPlans.map(plan => planLabel(plan, language));
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
