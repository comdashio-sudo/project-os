// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-25 (P-114): the meetings screen shows only what the server returned and sends exactly what was entered. Synthetic data only.
const h = vi.hoisted(() => ({ addItem: vi.fn(), create: vi.fn(), issue: vi.fn(), detail: undefined as unknown, list: [] as unknown[] }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/lib/permissions", () => ({ WriteGate: ({ children }: { children: React.ReactNode }) => <>{children}</>, useCan: () => true }));
vi.mock("@/components/OwnerSelect", () => ({ OwnerSelect: () => <span>owner</span> }));
vi.mock("@/lib/trpc", () => ({ trpc: { meetings: {
  list: { useQuery: () => ({ data: h.list, isLoading: false, error: null, refetch: vi.fn() }) },
  get: { useQuery: () => ({ data: h.detail, isLoading: false, error: null, refetch: vi.fn() }) },
  create: { useMutation: () => ({ mutate: h.create, isPending: false, error: null }) },
  addItem: { useMutation: () => ({ mutate: h.addItem, isPending: false, error: null }) },
  addAction: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
  issue: { useMutation: () => ({ mutate: h.issue, isPending: false, error: null }) },
} } }));

import ProjectMeetings, { parseAttendees } from "./ProjectMeetings";

const M1 = "11111111-1111-4111-8111-111111111111";
const meeting = (status: "draft" | "issued") => ({ id: M1, meetingType: "progress", title: "Weekly progress 2", heldAt: "2026-11-17T07:00:00Z", location: "Site office", status, previousMeetingId: null });
const detailOf = (status: "draft" | "issued") => ({
  meeting: meeting(status),
  attendees: [{ id: "a", name: "Site engineer (synthetic)", organisation: null, present: true, membershipId: "m" }, { id: "b", name: "Consultant (synthetic)", organisation: "Consultant Co.", present: true, membershipId: null }],
  items: [{ id: "i1", itemNumber: 1, topic: "Block B progress", discussion: null, decision: "Recover two days" }],
  actions: [{ id: "x1", title: "Send the recovery plan", priority: "high", dueAt: "2026-11-21T00:00:00Z", status: "open", meetingId: M1, ownerName: "Site engineer (synthetic)" }],
  broughtForward: [{ id: "x0", title: "Confirm the pump booking", priority: "medium", dueAt: null, status: "open", meetingId: "older", ownerName: "PM (synthetic)" }],
});
beforeEach(() => { h.addItem.mockReset(); h.create.mockReset(); h.issue.mockReset(); h.list = [{ ...meeting("draft"), openActions: 1 }]; });
afterEach(() => cleanup());

describe("ProjectMeetings (Q-25)", () => {
  it("shows the meeting's attendees, numbered minutes, actions and the open actions brought forward; «Add an item» sends the topic and decision", () => {
    h.detail = detailOf("draft");
    render(<ProjectMeetings />);
    expect(document.querySelector("[data-attendees]")!.textContent).toContain("Consultant (synthetic) (Consultant Co.)");
    expect(document.querySelector("[data-items]")!.textContent).toContain("1. Block B progress");
    expect(document.querySelector("[data-actions]")!.textContent).toContain("Send the recovery plan");
    expect(document.querySelector("[data-brought-forward]")!.textContent).toContain("Confirm the pump booking");
    fireEvent.change(screen.getByLabelText(/^Topic/), { target: { value: "Concrete supply" } });
    fireEvent.change(screen.getByLabelText("Decision"), { target: { value: "Order from the second plant" } });
    fireEvent.click(screen.getByRole("button", { name: "Add an item" }));
    expect(h.addItem).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", meetingId: M1, topic: "Concrete supply", discussion: undefined, decision: "Order from the second plant" });
    fireEvent.click(screen.getByRole("button", { name: "Issue the minutes" }));
    expect(h.issue).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", meetingId: M1 });
  });

  it("issued minutes offer no item, no action and no issue — they are final", () => {
    h.detail = detailOf("issued");
    render(<ProjectMeetings />);
    expect(document.querySelector("[data-add-item]")).toBeNull();
    expect(document.querySelector("[data-add-action]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Issue the minutes" })).toBeNull();
  });

  it("attendees are read one per line as «name — organisation»; empty lines are skipped", () => {
    expect(parseAttendees("Site engineer (synthetic) — Contractor Co.\n\nConsultant (synthetic)")).toEqual([{ name: "Site engineer (synthetic)", organisation: "Contractor Co." }, { name: "Consultant (synthetic)", organisation: undefined }]);
  });
});
