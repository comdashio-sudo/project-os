import React from "react";
import { AlertCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formFieldProblems } from "@/lib/formValidation";
import { pickLanguage } from "@/lib/language";

// A form that checks itself in the person's language instead of the browser (whose messages are English and cannot say what is wrong):
// noValidate, then on submit every field is checked by the shared rules (client/src/lib/formValidation.ts: required, minimum length, number
// range, date, e-mail). If anything is wrong nothing is submitted:
//   - each wrong field is marked (aria-invalid) and gets its message right under it, linked by aria-describedby (the field's own hint stays);
//   - the first wrong field gets the focus;
//   - a summary at the top lists each field by its label; a click on a line goes to its field.
// A field's message goes as soon as its value is right; the summary follows. Work order 21 / D-63 put the forms behind it.
const copy = { ar: "صحّح الحقول التالية ثم أعد الإرسال:", en: "Correct these fields, then send again:", ur: "یہ خانے درست کریں، پھر دوبارہ بھیجیں:" };

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Problem = { element: Field; label: string; message: string };

let generatedIds = 0;

/** A label's own words, without the text of the controls inside it (a wrapped list would add its options or its current choice). */
function labelText(label: HTMLLabelElement | undefined): string {
  if (!label) return "";
  const clone = label.cloneNode(true) as HTMLElement;
  for (const control of Array.from(clone.querySelectorAll("select, button, input, textarea, [role=combobox], [data-checked-error]"))) control.remove();
  return clone.textContent?.trim() ?? "";
}

/** The name a person sees for a field: its label, else its aria-label, else its placeholder. A design-system list's hidden value copy (data-list-for) is named by its list. */
function fieldName(element: Field): string {
  const list = element.dataset.listFor ? document.getElementById(element.dataset.listFor) as HTMLButtonElement | null : null;
  if (list) return labelText(list.labels?.[0]) || list.getAttribute("aria-label") || "";
  const label = labelText(element.labels?.[0]);
  return label || element.getAttribute("aria-label") || ("placeholder" in element ? element.placeholder : "") || "";
}

const errorIdOf = (element: Field) => `${element.id}-checked-error`;

/** Removes a field's mark, its message and the message's id from aria-describedby (whatever was there before stays). */
function clearField(element: Field) {
  if (!element.hasAttribute("data-checked-invalid")) return;
  const errorId = errorIdOf(element);
  element.removeAttribute("aria-invalid");
  element.removeAttribute("data-checked-invalid");
  const rest = (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(token => token && token !== errorId);
  if (rest.length) element.setAttribute("aria-describedby", rest.join(" ")); else element.removeAttribute("aria-describedby");
  element.ownerDocument.getElementById(errorId)?.remove();
}

/** Marks a field and writes its message right under it. */
function markField(element: Field, message: string) {
  if (!element.id) element.id = `checked-field-${++generatedIds}`;
  const errorId = errorIdOf(element);
  element.setAttribute("aria-invalid", "true");
  element.setAttribute("data-checked-invalid", "");
  const tokens = (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  if (!tokens.includes(errorId)) element.setAttribute("aria-describedby", [...tokens, errorId].join(" "));
  let note = element.ownerDocument.getElementById(errorId);
  if (!note) {
    note = element.ownerDocument.createElement("p");
    note.id = errorId;
    note.setAttribute("data-checked-error", "");
    note.className = "mt-1 basis-full text-sm font-medium text-destructive";
    // under the control: after it (or after the design-system list button a hidden value copy stands for); when the control sits in a row
    // that does not wrap (a value beside its currency, a box beside its button), after that row, so the message is under it and not beside it
    let anchor: Element = (element.dataset.listFor ? element.ownerDocument.getElementById(element.dataset.listFor) : null) ?? element;
    const row = anchor.parentElement;
    const view = element.ownerDocument.defaultView;
    if (row && view && !row.matches("form") && row.closest("form")) {
      const style = view.getComputedStyle(row);
      const rowOfFlex = style.display.includes("flex") && style.flexDirection.startsWith("row") && style.flexWrap === "nowrap";
      // a small grid of a value and its unit (not the form's own layout grid, which is the form itself or holds whole fields)
      const rowOfGrid = style.display.includes("grid") && style.gridTemplateColumns.trim().split(/\s+/).length > 1 && row.children.length <= 3;
      if (rowOfFlex || rowOfGrid) anchor = row;
    }
    anchor.insertAdjacentElement("afterend", note);
  }
  note.textContent = message;
}

export const CheckedForm = React.forwardRef<HTMLFormElement, React.FormHTMLAttributes<HTMLFormElement>>(function CheckedForm({ onSubmit, onInput, onChange, children, ...rest }, ref) {
  const { language } = useLanguage();
  const [problems, setProblems] = React.useState<Problem[]>([]);
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    for (const marked of Array.from(form.querySelectorAll<Field>("[data-checked-invalid]"))) clearField(marked);
    const found = formFieldProblems(form, language);
    if (found.length) {
      event.preventDefault();
      for (const { element, message } of found) markField(element, message);
      setProblems(found.map(({ element, message }) => ({ element, label: fieldName(element), message })));
      found[0].element.focus();
      return;
    }
    setProblems([]);
    onSubmit?.(event);
  };
  // once a marked field is right, its message goes (a new problem only shows on the next submit)
  const recheck = (form: HTMLFormElement) => {
    if (!problems.length) return;
    const still = new Set(formFieldProblems(form, language).map(problem => problem.element));
    const left = problems.filter(problem => still.has(problem.element));
    for (const problem of problems) if (!still.has(problem.element)) clearField(problem.element);
    if (left.length !== problems.length) setProblems(left);
  };
  return (
    <form ref={ref} noValidate {...rest} onSubmit={submit}
      onInput={event => { recheck(event.currentTarget); onInput?.(event); }}
      onChange={event => { recheck(event.currentTarget); onChange?.(event); }}>
      {problems.length ? (
        <div role="alert" data-form-problems className="col-span-full mb-1 basis-full rounded-[var(--radius)] bg-danger-soft p-3 text-sm text-danger-soft-foreground">
          <p className="flex items-center gap-1.5 font-medium"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{pickLanguage(language, copy)}</p>
          <ul className="mt-1 list-inside list-disc">{problems.map((problem, index) => <li key={index}><button type="button" className="underline-offset-2 hover:underline" onClick={() => problem.element.focus()}>{problem.label ? `${problem.label}: ` : ""}{problem.message}</button></li>)}</ul>
        </div>
      ) : null}
      {children}
    </form>
  );
});
