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
    if (problem) errors[element.id] = problem;
  }
  return errors;
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
    return belowMin || aboveMax ? fieldMessage("PROJECT_OS_FIELD_OUT_OF_RANGE", language) : null;
  }
  if (element.type === "date") return dateFieldError(value, language);
  if (element.type === "email") return emailFieldError(value, language);
  return null;
}
