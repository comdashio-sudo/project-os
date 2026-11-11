// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UserProfile from "./UserProfile";
import { TYPING_TEST } from "@/test/typing";

const state = vi.hoisted(() => ({ isArabic: false, user: { name: "Project Manager", email: "pm@example.test" } }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user, loading: false, logout: vi.fn() }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic, language: (state.isArabic) ? "ar" : "en", isRtl: state.isArabic }) }));
vi.mock("@/components/BrandMark", () => ({ BrandIcon: () => <span>Dashio icon</span>, BrandMark: () => <span>Dashio</span> }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));

beforeEach(() => { localStorage.clear(); state.isArabic = false; });
afterEach(() => cleanup());

// D-85: the first test types into four fields, which under load measured past the 5 s test limit; the typing has no delay and the describe a
// deliberate limit (TYPING_TEST). The second waits for the task form to be drawn before it reaches into it, so a slow render is waited for, not misread.
describe("UserProfile", TYPING_TEST, () => {
  it("updates profile details and adds a follow-up task", async () => {
    const user = userEvent.setup({ delay: null });
    render(<UserProfile />);
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    await user.type(screen.getByLabelText("Job title"), "Project Manager");
    await user.click(screen.getByRole("button", { name: "Save details" }));
    expect(screen.getAllByText("Project Manager").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.type(screen.getByLabelText("Task name"), "Review cost report");
    await user.type(screen.getByLabelText("Project or scope"), "Warehouse project");
    await user.click(screen.getByRole("button", { name: /^Add$/ }));
    expect(screen.getAllByText("Review cost report").length).toBeGreaterThan(0);
    expect(screen.getByText("Follow-up task added")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("project-os-profile-tasks") ?? "[]")).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("project-os-profile-activity") ?? "[]")).toHaveLength(2);
  });

  it("names a task with no name beside its field and adds nothing", async () => {
    const user = userEvent.setup({ delay: null });
    render(<UserProfile />);
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await screen.findByLabelText("Task name");
    await user.click((document.getElementById("task-title")?.closest("form") as HTMLFormElement).querySelector("button[type=submit]") as HTMLButtonElement);
    expect(screen.getByText("This field is required.")).toBeTruthy();
    expect(localStorage.getItem("project-os-profile-tasks")).toBeNull();
  });

  it("renders the complete profile experience in Arabic", () => {
    state.isArabic = true;
    render(<UserProfile />);
    expect(screen.getByRole("heading", { name: "الملف الشخصي" })).toBeTruthy();
    expect(screen.getByText("الأدوار والصلاحيات")).toBeTruthy();
    expect(screen.getByText("مهام المتابعة")).toBeTruthy();
    expect(screen.getByText("سجل النشاطات")).toBeTruthy();
  });
});
