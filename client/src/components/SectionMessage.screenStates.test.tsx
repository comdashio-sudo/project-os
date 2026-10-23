/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SectionMessage } from "./SectionResilience";

// A dashboard section that fails says so in its own place, with a retry. A refusal says that the person may not see the section, in
// a sentence (the server's when it sent one), instead of the generic "could not be loaded" line.
const FORBIDDEN_EN = "You do not have the required permission to complete this operation.";
const forbidden = { message: "PROJECT_OS_PERMISSION_DENIED", data: { code: "FORBIDDEN", projectError: { code: "PROJECT_OS_PERMISSION_DENIED", messages: { ar: "لا تملك الصلاحية المطلوبة لإتمام هذه العملية.", en: FORBIDDEN_EN } } } };

afterEach(cleanup);

describe("SectionMessage error state", () => {
  it("a failed section keeps the generic line and offers a retry", () => {
    const onRetry = vi.fn();
    render(<SectionMessage title="Cash flow" isArabic={false} kind="error" onRetry={onRetry} error={{ message: "network down" }} />);
    expect(screen.getByText("This section could not be loaded. The rest of the dashboard remains available.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("a refused section says it is not visible to this person, with the server's sentence, and no retry", () => {
    render(<SectionMessage title="Cash flow" isArabic={false} kind="error" error={forbidden} />);
    expect(screen.getByText(FORBIDDEN_EN)).toBeTruthy();
    expect(screen.queryByText("This section could not be loaded. The rest of the dashboard remains available.")).toBeNull();
  });

  it("a refused section with no server message still states the reason in the section's words", () => {
    render(<SectionMessage title="Cash flow" isArabic={true} kind="error" error={{ data: { code: "FORBIDDEN" } }} />);
    expect(screen.getByText("لا تملك الصلاحية اللازمة لعرض هذا القسم.")).toBeTruthy();
  });

  it("an explicit detail still wins over the refusal copy, so the caller's wording is kept", () => {
    render(<SectionMessage title="Risks" isArabic={false} kind="error" error={forbidden} detail="Custom caller text." />);
    expect(screen.getByText("Custom caller text.")).toBeTruthy();
  });
});
