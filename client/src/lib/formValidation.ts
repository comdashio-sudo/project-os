// Field checks made by the form itself, in the person's language, shown next to the field. Browsers are not asked to check: a browser check says
// its message in English whatever the language of the screen, and it cannot say what is wrong with the value.
// Every message is a catalogue entry (shared/projectErrors.ts), so the form and the server speak with the same words.
import { getProjectError, type ProjectErrorCode } from "@shared/projectErrors";
import { slugProblem, type SlugProblem } from "@shared/slug";
import type { Language } from "./language";

const SLUG_CODES: Record<SlugProblem, ProjectErrorCode> = {
  required: "PROJECT_OS_WORKSPACE_SLUG_REQUIRED",
  too_short: "PROJECT_OS_WORKSPACE_SLUG_TOO_SHORT",
  too_long: "PROJECT_OS_WORKSPACE_SLUG_TOO_LONG",
  format: "PROJECT_OS_WORKSPACE_SLUG_FORMAT",
};

export function fieldMessage(code: ProjectErrorCode, language: Language): string {
  return getProjectError(code).messages[language];
}

/** The message for an empty required field, or null when it has a value. */
export function requiredFieldError(value: string, language: Language): string | null {
  return value.trim() ? null : fieldMessage("PROJECT_OS_FIELD_REQUIRED", language);
}

/** The message for a value that is not a whole or decimal number, or null when it is one (an empty value is not checked here). */
export function numberFieldError(value: string, language: Language): string | null {
  if (!value.trim()) return null;
  return /^-?\d+(\.\d+)?$/.test(value.trim()) ? null : fieldMessage("PROJECT_OS_FIELD_NUMBER_INVALID", language);
}

/** The message for a value that is not a calendar date (yyyy-mm-dd), or null when it is one (an empty value is not checked here). */
export function dateFieldError(value: string, language: Language): string | null {
  if (!value.trim()) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  return valid ? null : fieldMessage("PROJECT_OS_FIELD_DATE_INVALID", language);
}

/** The message for a value that does not look like an e-mail address, or null when it does (an empty value is not checked here). */
export function emailFieldError(value: string, language: Language): string | null {
  if (!value.trim()) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : fieldMessage("PROJECT_OS_FIELD_EMAIL_INVALID", language);
}

/** The message for a short name (workspace slug) that breaks the rule, or null when it is valid. */
export function slugFieldError(value: string, language: Language): string | null {
  const problem = slugProblem(value);
  return problem ? fieldMessage(SLUG_CODES[problem], language) : null;
}

const FIELD_ELEMENTS = "input, select, textarea";
const UNCHECKED_INPUT_TYPES = ["button", "checkbox", "file", "hidden", "radio", "reset", "submit"];

/**
 * The message for each field of a form that the browser would have refused, keyed by field id, in the person's language. The form uses these
 * instead of browser validation (which speaks English and cannot say what is wrong): it shows each message beside its field and submits nothing
 * while any remains. Fields without an id, disabled fields and fields the browser does not check are skipped.
 */
export function formFieldErrors(form: HTMLFormElement, language: Language): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const element of Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(FIELD_ELEMENTS))) {
    if (!element.id || element.disabled) continue;
    if (element instanceof HTMLInputElement && UNCHECKED_INPUT_TYPES.includes(element.type)) continue;
    const problem = fieldProblem(element, language);
    // a design-system list's hidden value copy (data-list-for) reports under the list's own id, where its FieldError sits
    if (problem) errors[element.dataset.listFor ?? element.id] = problem;
  }
  return errors;
}

/**
 * The same checks for every field of a form, with or without an id: each problem with its element, in document order. CheckedForm
 * (client/src/components/CheckedForm.tsx) uses it to stop a submit, mark the fields and say what is wrong in the person's language.
 */
export function formFieldProblems(form: HTMLFormElement, language: Language): Array<{ element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement; message: string }> {
  const problems: Array<{ element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement; message: string }> = [];
  for (const element of Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(FIELD_ELEMENTS))) {
    if (element.disabled) continue;
    // a required file that was not chosen: the browser would refuse it in English
    if (element instanceof HTMLInputElement && element.type === "file") {
      if (element.required && !element.files?.length) problems.push({ element, message: fieldMessage("PROJECT_OS_FIELD_REQUIRED", language) });
      continue;
    }
    if (element instanceof HTMLInputElement && UNCHECKED_INPUT_TYPES.includes(element.type)) continue;
    const message = fieldProblem(element, language);
    if (message) problems.push({ element, message });
  }
  return problems;
}

const DECIMAL = /^-?\d+(\.\d+)?$/;
// trailing zeros are not decimals that matter ("2.50" has one)
const decimalsOf = (text: string) => (text.includes(".") ? text.replace(/0+$/, "").length - text.indexOf(".") - 1 : 0);
/** "71740953.27" at 2 decimals -> 7174095327: the decimal text moved into a whole number by its digits, never through a float multiplication. */
function scaled(text: string, decimals: number): number {
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const digits = Number(`${whole}${fraction.replace(/0+$/, "").padEnd(decimals, "0")}`);
  return negative ? -digits : digits;
}

/**
 * Whether a typed number sits on the field's step (default 1, "any" for none), counted from min (or 0). All in whole numbers: the value,
 * the step and min are scaled by the largest number of decimals among them (from their text), so 71740953.27 on a 0.01 step is exact.
 * A value too large to scale exactly is not refused here (the server checks it).
 */
export function onStep(value: string, stepText: string, minText: string): boolean {
  const step = stepText === "" ? "1" : stepText.trim();
  if (step.toLowerCase() === "any" || !DECIMAL.test(step) || Number(step) <= 0 || !DECIMAL.test(value)) return true;
  const min = minText !== "" && DECIMAL.test(minText.trim()) ? minText.trim() : "0";
  const decimals = Math.max(decimalsOf(step), decimalsOf(min));
  if (decimalsOf(value) > decimals) return false;
  const [v, s, m] = [scaled(value, decimals), scaled(step, decimals), scaled(min, decimals)];
  if (![v, s, m].every(Number.isSafeInteger) || !Number.isSafeInteger(v - m)) return true;
  return (v - m) % s === 0;
}

/**
 * min / max of a date ("2026-11-10"), a time ("08:30") or a local date-time ("2026-11-10T08:30"), which noValidate no longer has the browser
 * check (an assignment's end before its start, D-64). These shapes are fixed-width and zero-padded, so they compare as text; a bound in
 * another shape, or of another length, is left to the server.
 */
function outOfTextRange(value: string, element: HTMLInputElement): boolean {
  // a time or local date-time may carry seconds on one side only ("17:00" against "17:00:30"): both are read with seconds
  const minutesOnly = element.type === "time" ? 5 : element.type === "datetime-local" ? 16 : 0;
  const normal = (text: string) => (minutesOnly && text.length === minutesOnly ? `${text}:00` : text);
  const typed = normal(value);
  const comparable = (bound: string) => bound !== "" && normal(bound).length === typed.length;
  if (comparable(element.min) && typed < normal(element.min)) return true;
  if (comparable(element.max) && typed > normal(element.max)) return true;
  return false;
}

function fieldProblem(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, language: Language): string | null {
  const value = element.value;
  if (element.required) {
    const missing = requiredFieldError(value, language);
    if (missing) return missing;
  }
  // A value the person typed but that is shorter than the field's minimum (an empty optional field is not checked).
  const minLength = element instanceof HTMLSelectElement ? 0 : element.minLength;
  if (minLength > 0 && value.length > 0 && value.length < minLength) return fieldMessage("PROJECT_OS_FIELD_TOO_SHORT", language);
  if (!(element instanceof HTMLInputElement)) return null;
  if (element.type === "number") {
    const invalid = numberFieldError(value, language);
    if (invalid || !value.trim()) return invalid;
    const number = Number(value);
    const belowMin = element.min !== "" && number < Number(element.min);
    const aboveMax = element.max !== "" && number > Number(element.max);
    if (belowMin || aboveMax) return fieldMessage("PROJECT_OS_FIELD_OUT_OF_RANGE", language);
    // the step the browser no longer checks (noValidate), counted from min (or 0)
    if (!onStep(value.trim(), element.step, element.min)) return fieldMessage("PROJECT_OS_FIELD_STEP_MISMATCH", language);
    return null;
  }
  if (element.type === "date") {
    const invalid = dateFieldError(value, language);
    if (invalid || !value.trim()) return invalid;
    return outOfTextRange(value, element) ? fieldMessage("PROJECT_OS_FIELD_OUT_OF_RANGE", language) : null;
  }
  // a time or a local date-time: the browser keeps it in one fixed shape, so its bounds compare as text
  if ((element.type === "time" || element.type === "datetime-local") && value.trim()) {
    return outOfTextRange(value, element) ? fieldMessage("PROJECT_OS_FIELD_OUT_OF_RANGE", language) : null;
  }
  if (element.type === "email") return emailFieldError(value, language);
  return null;
}
