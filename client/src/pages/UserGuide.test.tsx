// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UserGuide from "./UserGuide";
import { userGuide } from "@/lib/userGuide";

const hoisted = vi.hoisted(() => ({ state: { arabic: true } }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useParams: () => ({ tenantId: "t1", projectId: "p1" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: hoisted.state.arabic }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));

describe("UserGuide", () => {
  beforeEach(() => { hoisted.state.arabic = true; window.history.replaceState(null, "", "/"); }); afterEach(cleanup);

  it("opens on the first role and lists its steps with a picture, the permission needed and a link into the project", () => {
    render(<UserGuide />);
    const steps = screen.getAllByRole("heading", { level: 3 });
    expect(steps).toHaveLength(userGuide[0]!.steps.length);
    const first = steps[0]!.closest("li")!;
    expect(within(first).getByRole("img").getAttribute("src")).toBe("/guide/cost-control-1.jpg");
    expect(within(first).getByRole("link", { name: "افتح الشاشة" }).getAttribute("href")).toBe("/projects/t1/p1/controls");
    expect(first.textContent).toContain("الصلاحية المطلوبة");
  });

  it("groups the steps by cadence, daily first, and numbers them in the order the reader meets them", () => {
    const { container } = render(<UserGuide />);
    expect(Array.from(container.querySelectorAll("[data-cadence]")).map(group => group.getAttribute("data-cadence"))).toEqual(["daily", "weekly"]);
    const headings = screen.getAllByRole("heading", { level: 3 }).map(heading => heading.textContent ?? "");
    const total = userGuide[0]!.steps.length;
    expect(headings[0]).toContain(`الخطوة 1 من ${total}`);
    expect(headings[total - 1]).toContain(`الخطوة ${total} من ${total}`);
  });

  it("switches role from the keyboard-reachable buttons and honours the address hash", async () => {
    window.history.replaceState(null, "", "/#contracts");
    const user = userEvent.setup(); render(<UserGuide />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("العقود");
    await user.click(screen.getByRole("button", { name: "التخطيط" }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("التخطيط");
    expect(window.location.hash).toBe("#planning");
    expect(screen.getByRole("button", { name: "التخطيط" }).getAttribute("aria-current")).toBe("true");
  });

  it("states what the role must not do, and renders in English", () => {
    hoisted.state.arabic = false;
    render(<UserGuide />);
    expect(screen.getByText(/What is not yours/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Cost control");
    expect(screen.getAllByRole("link", { name: "Open the screen" })).toHaveLength(userGuide[0]!.steps.length);
  });
});
