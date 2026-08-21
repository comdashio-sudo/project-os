/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionMessage } from "./SectionResilience";

describe("SectionMessage", () => {
  it("distinguishes the four localized section states", () => {
    const { rerender } = render(<SectionMessage title="Section" isArabic={false} kind="loading" />);
    expect(screen.getByText("Loading this section…")).toBeTruthy();
    rerender(<SectionMessage title="Section" isArabic={false} kind="empty" />);
    expect(screen.getByText("No data is available for this section in the current access scope.")).toBeTruthy();
    rerender(<SectionMessage title="Section" isArabic={false} kind="error" />);
    expect(screen.getByText("This section could not be loaded. The rest of the dashboard remains available.")).toBeTruthy();
    rerender(<SectionMessage title="القسم" isArabic kind="partial" />);
    expect(screen.getByText("تتوفر بيانات جزئية فقط؛ يُشار إلى المصادر الناقصة أدناه.")).toBeTruthy();
  });
});
