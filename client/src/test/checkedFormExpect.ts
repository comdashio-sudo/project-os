import { fireEvent } from "@testing-library/react";
import { expect } from "vitest";
import { getProjectError } from "@shared/projectErrors";

/**
 * D-63: a form behind CheckedForm, submitted empty, sends nothing; its first wrong field is marked, has the focus, and its message, in the
 * page's language, sits under it and is named by aria-describedby. Shared by the tests of every form the batch moved to CheckedForm.
 */
export function expectEmptySubmitRefused(form: HTMLFormElement, language: "ar" | "en" | "ur", sent: { mock: { calls: unknown[] } }) {
  expect(form.noValidate).toBe(true);
  const before = sent.mock.calls.length;
  fireEvent.submit(form);
  expect(sent.mock.calls.length).toBe(before);
  const first = form.querySelector<HTMLElement>('[aria-invalid="true"]');
  expect(first).toBeTruthy();
  expect(document.activeElement).toBe(first);
  const noteId = first!.getAttribute("aria-describedby")!.split(" ").find(id => id.endsWith("-checked-error"))!;
  const note = document.getElementById(noteId)!;
  expect(note.textContent).toBe(getProjectError("PROJECT_OS_FIELD_REQUIRED").messages[language]);
  return first!;
}
