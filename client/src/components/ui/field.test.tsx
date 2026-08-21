/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FieldError } from "./field";

describe("FieldError", () => {
  afterEach(() => cleanup());

  it("renders only an explicitly supplied localized message", () => {
    render(<FieldError>تعذر حفظ الحقل. تحقق من البيانات ثم أعد المحاولة.</FieldError>);

    expect(screen.getByRole("alert").textContent).toBe("تعذر حفظ الحقل. تحقق من البيانات ثم أعد المحاولة.");
  });

  it("does not render an empty alert when no localized content is supplied", () => {
    render(<FieldError />);

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
