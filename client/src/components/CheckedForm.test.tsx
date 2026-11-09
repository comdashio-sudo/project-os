// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getProjectError } from "@shared/projectErrors";
import { CheckedForm, LONG_FORM_FIELDS } from "./CheckedForm";
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
      // the summary is one line that counts the wrong fields; the messages are under the fields, not repeated in a list
      expect(screen.getByRole("alert").textContent).toBe({ ar: "صحّح حقلين ثم أعد الإرسال.", en: "Correct 2 fields, then send again.", ur: "2 خانے درست کریں، پھر دوبارہ بھیجیں۔" }[language]);
      expect(screen.getByRole("alert").querySelector("ul")).toBeNull();
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

describe("CheckedForm: long forms, the step, and fields that leave", () => {
  it(`a form of more than ${LONG_FORM_FIELDS} fields keeps, under the count, a list of its wrong fields as 44px links on a phone`, () => {
    const onSubmit = vi.fn();
    render(<CheckedForm onSubmit={onSubmit}>{Array.from({ length: LONG_FORM_FIELDS + 1 }, (_, index) => <input key={index} aria-label={`Field ${index + 1}`} required />)}<button type="submit">Send</button></CheckedForm>);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("alert").querySelector("p")?.textContent).toBe(`Correct ${LONG_FORM_FIELDS + 1} fields, then send again.`);
    const links = screen.getAllByRole("button", { name: /^Field \d+: / });
    expect(links).toHaveLength(LONG_FORM_FIELDS + 1);
    for (const link of links) expect(link.className).toContain("min-h-11");
    fireEvent.click(links[3]);
    expect(document.activeElement).toBe(screen.getByLabelText("Field 4"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("a fraction in a whole-number field (step 1) is refused in the page's language; a value on the step passes", () => {
    lang.language = "ar";
    const onSubmit = vi.fn();
    render(<CheckedForm onSubmit={event => { event.preventDefault(); onSubmit(); }}><input aria-label="Units" type="number" step="1" min="0" defaultValue="12.5" /><input aria-label="Amount" type="number" step="0.01" defaultValue="10.25" /><button type="submit">Send</button></CheckedForm>);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).not.toHaveBeenCalled();
    const units = screen.getByLabelText("Units");
    expect(document.getElementById(units.getAttribute("aria-describedby")!)?.textContent).toBe(getProjectError("PROJECT_OS_FIELD_STEP_MISMATCH").messages.ar);
    expect(screen.getByLabelText("Amount").getAttribute("aria-invalid")).toBeNull(); // 10.25 is on the 0.01 step
    fireEvent.change(units, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("in a grid of two columns a wrong field and its message take the whole row, one under the other, until it is right", () => {
    render(<CheckedForm style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}><input aria-label="Number" required /><input aria-label="Title" required /><button type="submit">Send</button></CheckedForm>);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const number = screen.getByLabelText("Number");
    const note = number.nextElementSibling as HTMLElement;
    expect(note.hasAttribute("data-checked-error")).toBe(true);
    expect(number.style.gridColumn).toBe("1 / -1");
    expect(note.style.gridColumn).toBe("1 / -1");
    fireEvent.input(number, { target: { value: "N-1" } });
    expect(number.style.gridColumn).toBe("");
  });

  it("a wrong field that leaves the form takes its message with it", () => {
    const Conditional = () => { const [shown, setShown] = React.useState(true); return <CheckedForm><button type="button" onClick={() => setShown(false)}>Hide</button>{shown ? <input aria-label="Extra" required /> : null}<input aria-label="Kept" defaultValue="x" /><button type="submit">Send</button></CheckedForm>; };
    render(<Conditional />);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(document.querySelectorAll("[data-checked-error]")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    fireEvent.input(screen.getByLabelText("Kept"), { target: { value: "y" } });
    expect(document.querySelectorAll("[data-checked-error]")).toHaveLength(0);
  });
});

// D-63, D-64 and D-65 put every form of the client behind CheckedForm or its own noValidate check. The scan covers client/src whole; a
// form left to the browser must be named here with its reason.
const BARE_FORM_EXCEPTIONS: Record<string, string> = {
  "client/src/components/MfaGate.tsx": "the two-step code checks itself and says so beside the field (D-3 part 1, #216)",
};
describe("no form in client/src is left to the browser's checks", () => {
  const files = readdirSync("client/src", { recursive: true, encoding: "utf8" }).filter(file => file.endsWith(".tsx") && !file.includes(".test."));
  it.each(files)("client/src/%s", file => {
    const path = `client/src/${file}`;
    if (BARE_FORM_EXCEPTIONS[path]) return;
    const source = readFileSync(path, "utf8");
    // the tag runs to its first ">" that is not the arrow of an inline handler ("=>")
    for (const start of source.split("<form").slice(1)) expect(start.slice(0, start.search(/[^=]>/) + 2), path).toContain("noValidate");
  });
  it("the scan reaches the forms of D-63, D-64 and D-65", () => {
    for (const file of ["components/MasterPlanTools.tsx", "pages/ProjectNcrs.tsx", "pages/ProjectControls.tsx", "pages/TenantAdministration.tsx", "pages/UserProfile.tsx"]) expect(files).toContain(file);
  });
});
