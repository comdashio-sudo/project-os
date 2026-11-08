// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getProjectError } from "@shared/projectErrors";
import { CheckedForm } from "./CheckedForm";
import { SectionActions } from "./SectionActions";

const lang = vi.hoisted(() => ({ language: "en" as "ar" | "en" | "ur" }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: lang.language === "ar", language: lang.language, isRtl: lang.language !== "en", setLanguage: vi.fn() }) }));
afterEach(() => { cleanup(); lang.language = "en"; });

const required = (language: "ar" | "en" | "ur") => getProjectError("PROJECT_OS_FIELD_REQUIRED").messages[language];

function Example({ onSubmit }: { onSubmit: () => void }) {
  return (
    <CheckedForm aria-label="Example" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
      <label htmlFor="name">Name</label><input id="name" required aria-describedby="name-hint" /><p id="name-hint">As on the contract</p>
      <label>Amount<input type="number" min="0" required /></label>
      <button type="submit">Send</button>
    </CheckedForm>
  );
}

describe("CheckedForm: the form checks itself in the page's language, with the message under each wrong field", () => {
  for (const language of ["ar", "en", "ur"] as const) {
    it(`an empty submit (${language}) sends nothing: each field is marked, its message is under it and named by aria-describedby, the first one has the focus`, () => {
      lang.language = language;
      const onSubmit = vi.fn();
      render(<Example onSubmit={onSubmit} />);
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      expect(onSubmit).not.toHaveBeenCalled();
      const name = document.getElementById("name") as HTMLInputElement;
      expect(name.getAttribute("aria-invalid")).toBe("true");
      const describedBy = name.getAttribute("aria-describedby")!.split(" ");
      expect(describedBy).toContain("name-hint"); // the field's own hint stays
      const note = document.getElementById(describedBy.find(id => id !== "name-hint")!)!;
      expect(note.textContent).toBe(required(language));
      expect(name.nextElementSibling).toBe(note); // right under the field
      expect(document.activeElement).toBe(name);
      const amount = screen.getAllByRole("spinbutton")[0];
      expect(amount.getAttribute("aria-invalid")).toBe("true");
      expect(document.getElementById(amount.getAttribute("aria-describedby")!)?.textContent).toBe(required(language));
      expect(screen.getByRole("alert").textContent).toContain(required(language)); // the summary stays
      expect(name.validationMessage === "" || name.form?.noValidate).toBe(true); // the browser is not asked
    });
  }

  it("a right value takes its message away at once; a valid submit sends once, with no message left and the hint kept", () => {
    const onSubmit = vi.fn();
    render(<Example onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const name = document.getElementById("name") as HTMLInputElement;
    fireEvent.input(name, { target: { value: "Pilot" } });
    expect(name.getAttribute("aria-invalid")).toBeNull();
    expect(name.getAttribute("aria-describedby")).toBe("name-hint");
    expect(document.querySelectorAll("[data-checked-error]")).toHaveLength(1); // the amount's message is still there
    fireEvent.input(screen.getAllByRole("spinbutton")[0], { target: { value: "5" } });
    expect(document.querySelectorAll("[data-checked-error]")).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(name.getAttribute("aria-describedby")).toBe("name-hint");
  });

  it("+ Add puts the focus on the first field inside a CheckedForm (#224's SectionActions finds its form)", () => {
    render(<section aria-label="Contracts"><SectionActions /><CheckedForm><input aria-label="Contract number" required /></CheckedForm></section>);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Contract number"));
  });
});

// D-63's nine forms (the list grows with D-64 and D-65): none may go back to a bare <form> that leaves the checking to the browser
const D63_FILES = ["components/MasterPlanTools.tsx", "components/TenantDataCard.tsx", "components/FieldShell.tsx", "components/AIChatBox.tsx", "pages/SupportOwnerPanel.tsx", "pages/PayrollPanel.tsx", "pages/ProjectContracts.tsx", "pages/ProjectProcurement.tsx", "pages/ProjectPurchaseOrders.tsx"];
describe("no bare <form> in the files moved to CheckedForm", () => {
  it.each(D63_FILES)("%s", file => {
    const source = readFileSync(`client/src/${file}`, "utf8");
    for (const tag of source.match(/<form\b[^>]*>/g) ?? []) expect(tag).toContain("noValidate");
    expect(source).toContain("<CheckedForm");
  });
});
