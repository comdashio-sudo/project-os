/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectChanges } from "./ProjectChanges";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { changes: {
  list: { useQuery: () => ({ data: [{ id: "c1", changeNumber: "CO-1", title: "Variation", description: "d", impactScheduleDays: 0, impactCost: "10", contractValueImpact: "250.00", currency: "SAR", status: "draft" }], isLoading: false, error: null, refetch: vi.fn() }) },
  create: { useMutation: () => ({ mutate, isPending: false, error: null }) },
  transitionStatus: { useMutation: () => ({ mutate: vi.fn(), error: null }) },
} } }));
afterEach(() => { cleanup(); mutate.mockReset(); });

describe("change request contract value impact", () => {
  it("is sent with the request and shown in the register", () => {
    render(<ProjectChanges tenantId="t" projectId="p" />);
    expect(screen.getByText(/Contract value impact \(counts only once approved\): 250.00 SAR/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Request number"), { target: { value: "CO-9" } });
    fireEvent.change(screen.getByLabelText("Change title"), { target: { value: "Extra scope" } });
    fireEvent.change(screen.getByLabelText("Change description"), { target: { value: "Extra scope instructed on site" } });
    fireEvent.change(screen.getByLabelText("Contract value impact (counts only once approved)"), { target: { value: "150" } });
    fireEvent.click(screen.getByText("Register change request"));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ changeNumber: "CO-9", contractValueImpact: 150, impactCost: 0 }));
  });
});
