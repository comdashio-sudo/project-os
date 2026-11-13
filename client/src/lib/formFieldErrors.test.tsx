// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { formFieldErrors } from "./formValidation";
import { getProjectError } from "@shared/projectErrors";

// The form is built from markup, as the screens are; the checks read the values the person would have typed.
function formOf(markup: string): HTMLFormElement {
  const host = document.createElement("div");
  host.innerHTML = `<form>${markup}</form>`;
  document.body.appendChild(host);
  return host.querySelector("form") as HTMLFormElement;
}

describe("formFieldErrors: what the browser would have refused, in the screen's language", () => {
  it("names an empty required field in Arabic, English and Urdu", () => {
    const form = formOf('<input id="name" required value="   ">');
    expect(formFieldErrors(form, "ar")).toEqual({ name: "هذا الحقل مطلوب." });
    expect(formFieldErrors(form, "en")).toEqual({ name: "This field is required." });
    expect(formFieldErrors(form, "ur")).toEqual({ name: "یہ فیلڈ ضروری ہے۔" });
  });

  it("reports an empty required design-system list under the list's own id, where its FieldError sits (D-75)", () => {
    // the ds Select writes its value into a hidden copy (id = <list>-value, data-list-for = <list>)
    const empty = formOf('<input id="setup-plan-value" data-list-for="setup-plan" required value=""><button id="setup-plan" type="button"></button>');
    expect(formFieldErrors(empty, "en")).toEqual({ "setup-plan": "This field is required." });
    // NEGATIVE: a chosen value raises nothing, and the copy's own id never carries a message
    const chosen = formOf('<input id="setup-plan-value" data-list-for="setup-plan" required value="starter">');
    expect(formFieldErrors(chosen, "en")).toEqual({});
    expect(formFieldErrors(empty, "en")).not.toHaveProperty("setup-plan-value");
  });

  it("names a number outside its min and max, and accepts one inside them", () => {
    expect(formFieldErrors(formOf('<input id="seats" type="number" min="1" max="10" value="12">'), "en"))
      .toEqual({ seats: "The value is outside the allowed range." });
    expect(formFieldErrors(formOf('<input id="seats" type="number" min="1" max="10" value="5">'), "en")).toEqual({});
  });

  it("names an e-mail address that does not look like one", () => {
    expect(formFieldErrors(formOf('<input id="mail" type="email" value="owner example">'), "en"))
      .toEqual({ mail: "Enter a valid email address." });
  });

  it("names a value shorter than the field's minimum, and lets an empty optional field through", () => {
    expect(formFieldErrors(formOf('<input id="code" minlength="2" value="A">'), "en")).toEqual({ code: "The value is shorter than the minimum." });
    expect(formFieldErrors(formOf('<input id="code" minlength="2" value="">'), "en")).toEqual({});
    expect(formFieldErrors(formOf('<select id="plan"><option value="x" selected>x</option></select>'), "en")).toEqual({});
  });

  it("checks nothing a person cannot be blamed for: disabled, id-less and button-like fields are skipped", () => {
    const form = formOf('<input id="off" required disabled><input required><input id="go" type="submit" required><input id="ok" value="x">');
    expect(formFieldErrors(form, "en")).toEqual({});
  });
});

describe("onStep: the step checked in whole numbers (no float tolerance)", () => {
  it("accepts large money amounts and values on the step", async () => {
    const { onStep } = await import("./formValidation");
    for (const value of ["71740953.27", "9036615.70", "99999999.99", "0.01", "1200", "0"]) expect(onStep(value, "0.01", ""), value).toBe(true);
    expect(onStep("2.5", "0.5", "")).toBe(true);
    expect(onStep("2.50", "0.5", "")).toBe(true);
    expect(onStep("12", "1", "0")).toBe(true);
    expect(onStep("7", "5", "2")).toBe(true); // counted from min
    expect(onStep("1.5", "any", "")).toBe(true);
  });
  it("refuses a value off the step", async () => {
    const { onStep } = await import("./formValidation");
    expect(onStep("10.255", "0.01", "")).toBe(false);
    expect(onStep("1.5", "1", "")).toBe(false);
    expect(onStep("1.5", "", "")).toBe(false); // the browser's default step is 1
    expect(onStep("2.25", "0.5", "")).toBe(false);
    expect(onStep("6", "5", "2")).toBe(false);
  });
  it("every amount from 0.01 to 100,000,000 in hundredths sits on a 0.01 step (a sample of 20,000)", async () => {
    const { onStep } = await import("./formValidation");
    for (let i = 0; i < 20000; i++) {
      const cents = Math.floor((i / 20000) * 10_000_000_000) + (i % 97);
      const text = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
      expect(onStep(text, "0.01", ""), text).toBe(true);
    }
  });
});

describe("onStep: signs, a fractional min, and exponent text (review notes on #228)", () => {
  it("counts negative values and minus zero from min like positive ones", async () => {
    const { onStep } = await import("./formValidation");
    expect(onStep("-2", "1", "")).toBe(true);
    expect(onStep("-1.5", "1", "")).toBe(false);
    expect(onStep("-0", "1", "")).toBe(true);
    expect(onStep("-0.00", "0.01", "")).toBe(true);
    expect(onStep("-12.34", "0.01", "-100")).toBe(true);
  });
  it("a fractional min moves the steps: 0.25 + n × 0.5", async () => {
    const { onStep } = await import("./formValidation");
    expect(onStep("0.75", "0.5", "0.25")).toBe(true);
    expect(onStep("1", "0.5", "0.25")).toBe(false);
  });
  it("exponent text such as 1e3 is not judged by the step (the number check refuses it first)", async () => {
    const { onStep, numberFieldError } = await import("./formValidation");
    expect(onStep("1e3", "1", "")).toBe(true);
    expect(numberFieldError("1e3", "en")).toBe(getProjectError("PROJECT_OS_FIELD_NUMBER_INVALID").messages.en);
  });
});

describe("dates, times and local date-times keep their min and max under noValidate (D-64)", () => {
  it("an end before the start, a time before opening and a date-time after the cut-off are refused in the page's language", async () => {
    const { formFieldProblems } = await import("./formValidation");
    const form = formOf('<input id="finish" type="date" min="2026-11-10" value="2026-11-01" /><input id="opens" type="time" min="08:00" value="07:30" /><input id="cut" type="datetime-local" max="2026-11-10T17:00" value="2026-11-10T18:00" /><input id="ok" type="date" min="2026-11-10" max="2026-12-31" value="2026-11-10" />');
    const problems = formFieldProblems(form, "ur");
    expect(problems.map(problem => problem.element.id)).toEqual(["finish", "opens", "cut"]);
    for (const problem of problems) expect(problem.message).toBe(getProjectError("PROJECT_OS_FIELD_OUT_OF_RANGE").messages.ur);
  });
  it("an empty optional date is not judged by its bounds", async () => {
    const { formFieldProblems } = await import("./formValidation");
    expect(formFieldProblems(formOf('<input id="d" type="date" min="2026-11-10" value="" />'), "en")).toEqual([]);
  });
});

describe("times with seconds on one side only (review note on #232)", () => {
  it("17:00:30 is after a 17:00 maximum, and 2026-11-10T17:00 is within a max given with seconds", async () => {
    const { formFieldProblems } = await import("./formValidation");
    const form = formOf('<input id="late" type="time" max="17:00" value="17:00:30" /><input id="ok" type="datetime-local" max="2026-11-10T17:00:00" value="2026-11-10T17:00" />');
    expect(formFieldProblems(form, "en").map(problem => problem.element.id)).toEqual(["late"]);
  });
});
