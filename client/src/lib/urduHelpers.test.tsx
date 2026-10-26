/** @vitest-environment jsdom */
// Each shared helper and screen part that takes a language must produce Urdu when Urdu is chosen, not English.
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { formatMoney, formatPercent, riyalLabel } from "@/lib/profitabilityView";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { LoadingState, ErrorState, NoPermission } from "@/components/ScreenStates";
import { SourceNotice } from "@/components/SectionResilience";
import { LevelDashboard } from "@/components/LevelDashboard";

vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => null }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));

const forbidden = {
  data: {
    code: "FORBIDDEN",
    projectError: {
      code: "PROJECT_OS_PERMISSION_DENIED",
      messages: {
        ar: "لا تملك الصلاحية المطلوبة لإتمام هذه العملية.",
        en: "You do not have the required permission to complete this operation.",
        ur: "اس عمل کو مکمل کرنے کے لیے درکار صلاحیت آپ کے پاس نہیں ہے۔",
      },
    },
  },
};

const urdu = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

beforeEach(() => {
  window.localStorage.setItem("project-os-language", "ur");
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("money and percentage helpers in Urdu", () => {
  it("riyalLabel gives the Urdu name of the riyal", () => {
    expect(riyalLabel("ur")).toBe("ریال");
    expect(riyalLabel("en")).toBe("SAR");
  });

  it("formatMoney writes the amount with the Urdu riyal", () => {
    const text = formatMoney(1500, "SAR", "ur");
    expect(text).toContain("ریال");
    expect(text).not.toContain("SAR");
  });

  it("formatPercent writes a percentage that is not the English placeholder", () => {
    const text = formatPercent(12.5, "ur");
    expect(text).toContain("%");
    expect(text).not.toBe("—");
  });
});

describe("the project-error sentence in Urdu", () => {
  it("returns the catalogue's Urdu message for a server refusal", () => {
    expect(getLocalizedProjectError(forbidden, "ur")).toBe("اس عمل کو مکمل کرنے کے لیے درکار صلاحیت آپ کے پاس نہیں ہے۔");
  });

  it("returns the Urdu connection sentence when no answer came from the server", () => {
    const networkError = new TypeError("Failed to fetch");
    const text = getLocalizedProjectError(networkError, "ur");
    expect(text).toContain("سرور");
    expect(text).not.toContain("Could not reach");
  });

  it("keeps accepting the older boolean form (Arabic for true)", () => {
    expect(getLocalizedProjectError(forbidden, true)).toBe("لا تملك الصلاحية المطلوبة لإتمام هذه العملية.");
  });
});

describe("screen states in Urdu", () => {
  it("LoadingState says the screen is loading in Urdu", () => {
    urdu(<LoadingState isArabic={false} />);
    expect(screen.getByRole("status").textContent).toContain("لوڈ ہو رہا ہے");
  });

  it("ErrorState offers the retry in Urdu", () => {
    urdu(<ErrorState isArabic={false} error={{ data: { code: "BAD_REQUEST" } }} onRetry={() => undefined} />);
    expect(screen.getByRole("button").textContent).toBe("دوبارہ کوشش کریں");
  });

  it("NoPermission says the screen is not allowed and gives the next step in Urdu", () => {
    urdu(<NoPermission isArabic={false} error={forbidden} />);
    expect(screen.getByText("اس اسکرین کو دیکھنے کی اجازت نہیں")).toBeTruthy();
    expect(screen.getByText(/مالک یا اپنی ٹیم کی صلاحیتیں/)).toBeTruthy();
  });

  it("SourceNotice names the failed source in Urdu", () => {
    urdu(<SourceNotice query={{ error: forbidden }} isArabic={false} title="المشاريع" />);
    expect(screen.getByRole("alert").textContent).toContain("لوڈ نہیں ہو سکا: المشاريع");
  });

  it("LevelDashboard says where the level goes down to, in Urdu", () => {
    urdu(<LevelDashboard level="company" tenantId="t" title="Company">{null}</LevelDashboard>);
    expect(screen.getByText(/سطح پر جائیں/)).toBeTruthy();
    expect(screen.queryByText(/Go to the level/)).toBeNull();
  });
});
