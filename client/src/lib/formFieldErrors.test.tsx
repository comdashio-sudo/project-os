// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { formFieldErrors } from "./formValidation";

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

  it("names a number outside its min and max, and accepts one inside them", () => {
    expect(formFieldErrors(formOf('<input id="seats" type="number" min="1" max="10" value="12">'), "en"))
      .toEqual({ seats: "The value is outside the allowed range." });
    expect(formFieldErrors(formOf('<input id="seats" type="number" min="1" max="10" value="5">'), "en")).toEqual({});
  });

  it("names an e-mail address that does not look like one", () => {
    expect(formFieldErrors(formOf('<input id="mail" type="email" value="owner example">'), "en"))
      .toEqual({ mail: "Enter a valid email address." });
  });

  it("checks nothing a person cannot be blamed for: disabled, id-less and button-like fields are skipped", () => {
    const form = formOf('<input id="off" required disabled><input required><input id="go" type="submit" required><input id="ok" value="x">');
    expect(formFieldErrors(form, "en")).toEqual({});
  });
});
