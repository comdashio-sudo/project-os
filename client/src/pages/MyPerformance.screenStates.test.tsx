/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyPerformance from "./MyPerformance";

// The indicators page (/projects/:t/:p/my-performance): a failed read is not a refusal, so it offers a retry that refetches the same query.
// A refusal keeps its own test in MyPerformance.access.test.tsx.
const state = vi.hoisted(() => ({ query: {} as unknown }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav aria-label="navigation" /> }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { performance: {
  get: { useQuery: () => state.query },
  objections: { create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } },
} } }));

beforeEach(() => {
  state.query = { data: undefined, error: { message: "network down" }, isLoading: false, isFetching: false, refetch: vi.fn() };
});

describe("MyPerformance screen states", () => {
  afterEach(cleanup);

  it("a failed read says the indicators could not be loaded, and retries the same query", () => {
    render(<MyPerformance />);
    expect(screen.getByText("Your indicators could not be loaded right now.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect((state.query as { refetch: () => void }).refetch).toHaveBeenCalledTimes(1);
  });

  it("while the indicators are calculated, it says so", () => {
    state.query = { data: undefined, error: null, isLoading: true, isFetching: true, refetch: vi.fn() };
    render(<MyPerformance />);
    expect(screen.getByText("Calculating your indicators from operating sources…")).toBeTruthy();
  });
});
