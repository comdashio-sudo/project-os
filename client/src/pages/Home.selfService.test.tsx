// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const state = vi.hoisted(() => ({ signup: vi.fn(), refetch: vi.fn() }));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { name: "Pilot Owner", email: "owner@example.test" }, loading: false, isAuthenticated: true, logout: vi.fn() }),
}));
vi.mock("@/components/BrandMark", () => ({ BrandIcon: () => <span>Dashio icon</span>, BrandMark: () => <span>Dashio</span> }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/const", () => ({ startLogin: vi.fn() }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Safe error" }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => <select aria-label="Plan" value={value} onChange={event => onValueChange(event.target.value)}>{children}</select>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <option value="">{placeholder}</option>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    tenant: { mine: { useQuery: () => ({ data: [], isLoading: false, refetch: state.refetch }) } },
    selfService: {
      plans: { useQuery: () => ({ data: [{ code: "PROJECT_STANDARD", name: "Project Standard", packageCode: "PROJECT" }], isLoading: false }) },
      signup: { useMutation: () => ({ mutate: state.signup, isPending: false, error: null }) },
    },
  },
}));

afterEach(() => { cleanup(); state.signup.mockClear(); state.refetch.mockClear(); });

describe("Home self-service", () => {
  it("submits the server-catalog plan with company and seat boundaries", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByLabelText("Legal name"), "Pilot Company");
    await user.type(screen.getByLabelText("Workspace slug"), "pilot-company");
    await user.selectOptions(screen.getByLabelText("Plan"), "PROJECT_STANDARD");
    await user.clear(screen.getByLabelText("Seats"));
    await user.type(screen.getByLabelText("Seats"), "5");
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    expect(state.signup).toHaveBeenCalledWith({ legalName: "Pilot Company", slug: "pilot-company", planCode: "PROJECT_STANDARD", seats: 5 });
  });
});

void React;
