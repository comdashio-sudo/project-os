/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectAdvisor } from "./ProjectAdvisor";

const state = vi.hoisted(() => ({ mutate: vi.fn(), data: null as unknown }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized advisory error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { advisor: { project: { useMutation: (options: { onSuccess: (value: unknown) => void }) => ({ mutate: (input: unknown) => { state.mutate(input); if (state.data) options.onSuccess(state.data); }, isPending: false, error: null }) } } } }));

describe("ProjectAdvisor", () => {
  beforeEach(() => { cleanup(); state.mutate.mockReset(); state.data = { generatedAt: new Date(), model: "gpt-5-mini", facts: { actual: { actualCost: 50 }, calculated: { remainingBudget: 30 }, forecast: { eac: 120 } }, advisory: { summary: "Review the current exposure.", items: [{ kind: "actual", statement: "Actual cost is 50.", basis: "actualCost" }, { kind: "calculated", statement: "Remaining budget is 30.", basis: "remainingBudget" }, { kind: "forecast", statement: "EAC is 120.", basis: "eac" }, { kind: "assumption", statement: "Validate the cost trend.", basis: "No external data" }, { kind: "recommendation", statement: "Review the cost plan.", basis: "Current snapshot" }] } }; });

  it("requests a project-scoped advisory and displays classified output", async () => {
    const user = userEvent.setup(); render(<ProjectAdvisor tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "Generate advisory read" }));
    expect(state.mutate).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", locale: "en" });
    expect(screen.getByText("Actual")).toBeTruthy(); expect(screen.getByText("Calculated")).toBeTruthy(); expect(screen.getByText("Forecast")).toBeTruthy(); expect(screen.getByText("Assumption")).toBeTruthy(); expect(screen.getByText("Recommendation")).toBeTruthy();
  });
});
