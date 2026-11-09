/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, it, vi } from "vitest";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";
import { ProjectDocuments } from "./ProjectDocuments";
import { ProjectHse } from "./ProjectHse";

// D-65: the HSE and document registers check their forms in the page's language (Urdu and Arabic here)
const h = vi.hoisted(() => ({ language: "en" as "ar" | "en" | "ur", hse: vi.fn(), document: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/lib/trpc", () => {
  const idle = { useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null }) };
  return { trpc: {
    hse: { list: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) }, create: { useMutation: () => ({ mutate: h.hse, isPending: false, error: null }) }, transitionStatus: idle },
    documents: { getProjectRegister: { useQuery: () => ({ data: { documents: [] }, isLoading: false, error: null, refetch: vi.fn() }) }, createWithVersion: { useMutation: () => ({ mutate: h.document, mutateAsync: h.document, isPending: false, error: null }) }, addVersion: idle, transitionStatus: idle },
    directUploads: { create: idle },
  } };
});
afterEach(() => { cleanup(); h.language = "en"; h.hse.mockReset(); h.document.mockReset(); });

describe("D-65 registers behind CheckedForm", () => {
  it("an empty HSE observation records nothing and says so in Urdu under its first field", () => {
    h.language = "ur";
    render(<ProjectHse tenantId="t" projectId="p" />);
    expectEmptySubmitRefused(document.querySelector("form")!, "ur", h.hse);
  });

  it("an empty document (no number, no file) records nothing and says so in Arabic under its first field", () => {
    h.language = "ar";
    render(<ProjectDocuments tenantId="t" projectId="p" />);
    expectEmptySubmitRefused(document.querySelector("form")!, "ar", h.document);
  });
});
