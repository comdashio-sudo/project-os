import { describe, expect, it } from "vitest";
import { ageSentence, formatMoney, sparklinePoints, trend } from "./profitabilityView";

describe("profitability view helpers", () => {
  it("formats money with a sign and the currency, in both languages", () => {
    expect(formatMoney(1234567, "SAR", false)).toBe("1,234,567 SAR");
    expect(formatMoney(-250, "SAR", false)).toBe("-250 SAR");
    expect(formatMoney(-250, "SAR", true)).toBe("-250 SAR");
  });
  it("reads a profit change as good, bad or flat", () => {
    expect(trend(10)).toEqual({ tone: "good", arrow: "▲" });
    expect(trend(-0.01)).toEqual({ tone: "bad", arrow: "▼" });
    expect(trend(0)).toEqual({ tone: "flat", arrow: "■" });
  });
  it("words the age of a source", () => {
    expect(ageSentence(null, false)).toBe("never recorded");
    expect(ageSentence(0, true)).toBe("اليوم");
    expect(ageSentence(18, true)).toBe("قبل 18 يومًا");
    expect(ageSentence(1, true)).toBe("قبل يوم");
    expect(ageSentence(2, true)).toBe("قبل يومين");
    expect(ageSentence(3, true)).toBe("قبل 3 أيام");
    expect(ageSentence(1, false)).toBe("1 day ago");
  });
  it("scales a trend line into its box and needs two points", () => {
    expect(sparklinePoints([5], 100, 20)).toBe("");
    expect(sparklinePoints([0, 10], 100, 20)).toBe("0,20 100,0");
    expect(sparklinePoints([3, 3, 3], 100, 20)).toBe("0,20 50,20 100,20");
  });
});
