// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckedForm } from "./CheckedForm";

const state = vi.hoisted(() => ({ language: "en" as "ar" | "en" | "ur" }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.language === "ar", language: state.language, isRtl: state.language !== "en", setLanguage: vi.fn() }) }));
afterEach(() => { cleanup(); state.language = "en"; });

const Form = ({ onSubmit }: { onSubmit: () => void }) => (
  <CheckedForm onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <label>Code<input required /></label>
    <input aria-label="Quantity" type="number" min="1" />
    <button type="submit">Save</button>
  </CheckedForm>
);

describe("CheckedForm (the forms' own check, never the browser's)", () => {
  it("submits nothing while a field is wrong: marks it, focuses the first, and names each in the page's language", () => {
    const onSubmit = vi.fn();
    render(<Form onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.querySelector("form")!.noValidate).toBe(true);
    const code = screen.getByLabelText("Code");
    expect(code.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(code);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Code: ");
    expect(alert.textContent).toContain("Quantity: ");
  });

  it("clears the marks and submits once the fields are right", () => {
    const onSubmit = vi.fn();
    render(<Form onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "WH-1" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Code").getAttribute("aria-invalid")).toBeNull();
  });

  it("speaks Arabic in an Arabic page", () => {
    state.language = "ar";
    render(<Form onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toContain("صحّح الحقول التالية");
    expect(screen.getByRole("alert").textContent).not.toMatch(/Please fill|required/i);
  });

  it("a required file that was not chosen is named too (the documents form)", () => {
    const onSubmit = vi.fn();
    render(<CheckedForm onSubmit={onSubmit}><label>Document file<input type="file" required /></label><button type="submit">Upload</button></CheckedForm>);
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Document file: ");
  });
});
