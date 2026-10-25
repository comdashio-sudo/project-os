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
