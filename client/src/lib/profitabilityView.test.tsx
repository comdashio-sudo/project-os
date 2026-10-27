import { describe, expect, it } from "vitest";
import { ageSentence, formatMoney, formatPercent, sparklinePoints, trend } from "./profitabilityView";

describe("profitability view helpers", () => {
  it("formats money with a sign and the currency, in both languages", () => {
    expect(formatMoney(1234567, "SAR", false)).toBe("1,234,567 SAR");
    expect(formatMoney(-250, "SAR", false)).toBe("-250 SAR");
    expect(formatMoney(-250, "SAR", true)).toBe("\u2066-250 \u0631\u064a\u0627\u0644\u2069");
    expect(formatPercent(-95.5, true)).toMatch(/^\u2066\u200e?-95\.5%\u2069$/);
    expect(formatPercent(null, true)).toBe("—");
  });
  it("shows the riyal whatever the stored code: a legacy USD amount is still displayed in riyals", () => {
    expect(formatMoney(1500, "USD", false)).toBe("1,500 SAR");
    expect(formatMoney(250, "USD", true)).toBe("⁦250 ريال⁩");
    expect(formatMoney(1500, "USD", false)).not.toContain("USD");
  });
  it("keeps the decimals a screen asks for", () => {
    expect(formatMoney(12.5, "SAR", false, 2)).toBe("12.50 SAR");
    expect(formatMoney(12.5, "SAR", false)).toBe("13 SAR");
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

describe("sourceRoute (G-023)", () => {
  it("leads each kind of cost source to the screen that holds the document, in both languages", async () => {
    const { sourceRoute } = await import("./profitabilityView");
    expect(sourceRoute("goods_receipt_note", "t", "p")).toEqual({ href: "/projects/t/p/controls#manager-commercial", label: { ar: "إيصال استلام", en: "Goods receipt", ur: "سامان کی وصولی" } });
    expect(sourceRoute("purchase_order", "t", "p")?.href).toBe("/projects/t/p/controls#manager-commercial");
    expect(sourceRoute("material_issue", "t", "p")?.href).toBe("/projects/t/p/controls#manager-site");
    expect(sourceRoute("time_entry", "t", "p")?.href).toBe("/projects/t/p/controls#manager-site");
    expect(sourceRoute("payroll_allocation", "t", "p")?.href).toBe("/payroll/t");
    // a cost typed in by hand has no document, and an unknown kind is not guessed at
    expect(sourceRoute(null, "t", "p")).toBeNull();
    expect(sourceRoute("something_new", "t", "p")).toBeNull();
  });
});
