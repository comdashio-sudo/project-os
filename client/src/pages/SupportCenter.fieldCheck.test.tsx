/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SupportCenter from "./SupportCenter";

const state = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1" }), Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("./SupportOwnerPanel", () => ({ SupportOwnerPanel: () => <section>owner</section> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ support: { tickets: { invalidate: vi.fn() } } }),
  support: {
    tickets: { useQuery: () => ({ isLoading: false, isFetching: false, error: null, data: [], refetch: vi.fn() }) },
    knowledge: { list: { useQuery: () => ({ isLoading: false, isFetching: false, error: null, data: [], refetch: vi.fn() }) }, sources: { useQuery: () => ({ data: undefined, error: null }) } },
    ticket: { useQuery: () => ({ isLoading: false, error: null, data: undefined, refetch: vi.fn() }) },
    create: { useMutation: () => ({ mutate: state.create, isPending: false, error: null }) },
    reply: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    transition: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
  },
} }));

beforeEach(() => { state.create.mockReset(); });

describe("SupportCenter ticket form checks its own fields", () => {
  it("names an empty subject and message beside their fields and opens no ticket", () => {
    render(<SupportCenter />);
    const form = screen.getByLabelText("Subject").closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    expect(screen.getAllByText("This field is required.")).toHaveLength(2);
    expect(state.create).not.toHaveBeenCalled();
  });
});
