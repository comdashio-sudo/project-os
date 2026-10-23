/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, LoadingState, NoPermission, isRefusal, refusalSentence, shouldRetryQuery } from "./ScreenStates";

// Client test of the four screen states. The server's refusal shape is the tRPC error: data.code and data.projectError.messages.
const FORBIDDEN_EN = "You do not have the required permission to complete this operation.";
const FORBIDDEN_AR = "لا تملك الصلاحية المطلوبة لإتمام هذه العملية.";
const forbidden = { message: "PROJECT_OS_PERMISSION_DENIED", data: { code: "FORBIDDEN", projectError: { code: "PROJECT_OS_PERMISSION_DENIED", messages: { ar: FORBIDDEN_AR, en: FORBIDDEN_EN } } } };
const network = new TypeError("Failed to fetch");

afterEach(cleanup);

describe("refusal and retry policy", () => {
  it("recognises a refusal by the tRPC code only", () => {
    expect(isRefusal(forbidden)).toBe(true);
    expect(isRefusal({ data: { code: "INTERNAL_SERVER_ERROR" } })).toBe(false);
    expect(isRefusal(network)).toBe(false);
    expect(isRefusal(null)).toBe(false);
  });

  it("never retries a refusal or a rejected request, and retries network and server failures up to three times", () => {
    expect(shouldRetryQuery(0, forbidden)).toBe(false);
    expect(shouldRetryQuery(0, { data: { code: "BAD_REQUEST" } })).toBe(false);
    expect(shouldRetryQuery(0, network)).toBe(true);
    expect(shouldRetryQuery(2, { data: { code: "INTERNAL_SERVER_ERROR" } })).toBe(true);
    expect(shouldRetryQuery(3, network)).toBe(false);
  });

  it("uses the server's sentence for a refusal, and the fixed sentence when the server sent none", () => {
    expect(refusalSentence(forbidden, false)).toBe(FORBIDDEN_EN);
    expect(refusalSentence(forbidden, true)).toBe(FORBIDDEN_AR);
    expect(refusalSentence({ data: { code: "FORBIDDEN" } }, false)).toBe("You do not have the permission needed to view this screen.");
    expect(refusalSentence({ data: { code: "FORBIDDEN" } }, false, "section")).toBe("You do not have the permission needed to view this section.");
    expect(refusalSentence({ data: { code: "FORBIDDEN" } }, true)).toBe("لا تملك الصلاحية اللازمة لعرض هذه الشاشة.");
  });
});

describe("LoadingState", () => {
  it("names the wait in a status line, so the place is never blank", () => {
    render(<LoadingState isArabic={false} label="Loading the register…" />);
    expect(screen.getByRole("status").textContent).toContain("Loading the register…");
  });

  it("has an Arabic default", () => {
    render(<LoadingState isArabic={true} />);
    expect(screen.getByRole("status").textContent).toContain("جارٍ التحميل");
  });
});

describe("EmptyState", () => {
  it("says what is empty and links to the next action on the page", () => {
    render(<EmptyState isArabic={false} title="No projects yet" body="Create the first project from the form beside it." action={{ label: "Go to the new project form", href: "#project-create" }} />);
    expect(screen.getByText("No projects yet")).toBeTruthy();
    expect(screen.getByText("Create the first project from the form beside it.")).toBeTruthy();
    const action = screen.getByRole("link", { name: "Go to the new project form" });
    expect(action.getAttribute("href")).toBe("#project-create");
  });

  it("shows no action when none is passed, and says so in its body rather than inventing a button", () => {
    render(<EmptyState isArabic={true} title="لا توجد بيانات" body="يضيفها من يملك الصلاحية." />);
    expect(screen.getByText("لا توجد بيانات")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("ErrorState", () => {
  it("shows the server's sentence and a retry that calls the same query's refetch", () => {
    const refetch = vi.fn();
    render(<ErrorState isArabic={false} error={{ message: "boom" }} onRetry={refetch} />);
    expect(screen.getByRole("alert").textContent).toContain("We could not complete the request");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("offers the retry in Arabic too", () => {
    render(<ErrorState isArabic={true} error={{ message: "boom" }} onRetry={vi.fn()} />);
    expect(screen.getByRole("button", { name: "أعد المحاولة" })).toBeTruthy();
  });

  it("gives no retry when the caller passes none", () => {
    render(<ErrorState isArabic={false} error={{ message: "boom" }} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not offer a retry for a refusal: it states the no-permission sentence instead", () => {
    render(<ErrorState isArabic={false} error={forbidden} onRetry={vi.fn()} />);
    expect(screen.getByText(FORBIDDEN_EN)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("NoPermission", () => {
  it("states the server's reason with a next step, and never a bare error code", () => {
    render(<NoPermission isArabic={false} error={forbidden} />);
    expect(screen.getByText("No permission to view this screen")).toBeTruthy();
    expect(screen.getByText(FORBIDDEN_EN)).toBeTruthy();
    expect(screen.getByText(/Ask the company owner/)).toBeTruthy();
    expect(screen.queryByText(/FORBIDDEN/)).toBeNull();
  });

  it("falls back to a fixed sentence when the refusal has no server message", () => {
    render(<NoPermission isArabic={true} error={{ data: { code: "FORBIDDEN" } }} />);
    expect(screen.getByText("لا صلاحية لعرض هذه الشاشة")).toBeTruthy();
    expect(screen.getByText("لا تملك الصلاحية اللازمة لعرض هذه الشاشة.")).toBeTruthy();
  });
});
