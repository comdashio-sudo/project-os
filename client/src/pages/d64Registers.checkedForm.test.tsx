/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";
import { ProjectChanges } from "./ProjectChanges";
import { ProjectNcrs } from "./ProjectNcrs";
import { ProjectRfis } from "./ProjectRfis";

// D-64: the NCR, RFI and change-request registers check their forms in the page's language (Urdu, Arabic and English here)
const h = vi.hoisted(() => ({ language: "en" as "ar" | "en" | "ur", ncr: vi.fn(), rfi: vi.fn(), change: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/lib/trpc", () => {
  const list = () => ({ useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) });
  const transition = { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) };
  return { trpc: {
    ncrs: { list: list(), create: { useMutation: () => ({ mutate: h.ncr, isPending: false, error: null }) }, transitionStatus: transition },
    rfis: { list: list(), create: { useMutation: () => ({ mutate: h.rfi, isPending: false, error: null }) }, transitionStatus: transition },
    changes: { list: list(), create: { useMutation: () => ({ mutate: h.change, isPending: false, error: null }) }, transitionStatus: transition },
  } };
});
afterEach(() => { cleanup(); h.language = "en"; h.ncr.mockReset(); h.rfi.mockReset(); h.change.mockReset(); });

describe("D-64 registers behind CheckedForm", () => {
  it("an empty NCR records nothing and says so in Urdu under its first field", () => {
    h.language = "ur";
    render(<ProjectNcrs tenantId="t" projectId="p" />);
    expectEmptySubmitRefused(document.querySelector("form")!, "ur", h.ncr);
  });

  it("an empty RFI records nothing and says so in Arabic under its first field", () => {
    h.language = "ar";
    render(<ProjectRfis tenantId="t" projectId="p" />);
    expectEmptySubmitRefused(document.querySelector("form")!, "ar", h.rfi);
  });

  it("an empty change request records nothing; once its fields are right it is sent once, with no message left", () => {
    render(<ProjectChanges tenantId="t" projectId="p" />);
    const form = document.querySelector("form")!;
    expectEmptySubmitRefused(form, "en", h.change);
    fireEvent.change(screen.getByLabelText("Request number"), { target: { value: "CO-9" } });
    fireEvent.change(screen.getByLabelText("Change title"), { target: { value: "Extra scope" } });
    fireEvent.change(screen.getByLabelText("Change description"), { target: { value: "Extra scope instructed on site" } });
    for (const field of Array.from(form.querySelectorAll<HTMLInputElement>('[aria-invalid="true"]'))) fireEvent.change(field, { target: { value: field.type === "number" ? "0" : "x" } });
    expect(form.querySelector("[data-checked-error]")).toBeNull();
    fireEvent.submit(form);
    expect(h.change).toHaveBeenCalledTimes(1);
  });
});
