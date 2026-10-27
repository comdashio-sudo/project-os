import React from "react";
import { AlertCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formFieldProblems } from "@/lib/formValidation";
import { pickLanguage } from "@/lib/language";

// A form that checks itself in the person's language instead of the browser (whose messages are English and cannot say what is wrong):
// noValidate, then on submit every field is checked by the shared rules (client/src/lib/formValidation.ts: required, minimum length, number
// range, date, e-mail). If anything is wrong nothing is submitted: the fields are marked (aria-invalid), the first one gets the focus, and the
// form lists each one by its label with what is wrong; a click on a line goes to its field. Work order 21 put the remaining forms behind it.
const copy = { ar: "صحّح الحقول التالية ثم أعد الإرسال:", en: "Correct these fields, then send again:", ur: "یہ خانے درست کریں، پھر دوبارہ بھیجیں:" };

type Problem = { element: HTMLElement; label: string; message: string };

/** A label's own words, without the text of the controls inside it (a wrapped list would add its options or its current choice). */
function labelText(label: HTMLLabelElement | undefined): string {
  if (!label) return "";
  const copy = label.cloneNode(true) as HTMLElement;
  for (const control of Array.from(copy.querySelectorAll("select, button, input, textarea, [role=combobox]"))) control.remove();
  return copy.textContent?.trim() ?? "";
}

/** The name a person sees for a field: its label, else its aria-label, else its placeholder. A design-system list's hidden value copy (data-list-for) is named by its list. */
function fieldName(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  const list = element.dataset.listFor ? document.getElementById(element.dataset.listFor) as HTMLButtonElement | null : null;
  if (list) return labelText(list.labels?.[0]) || list.getAttribute("aria-label") || "";
  const label = labelText(element.labels?.[0]);
  return label || element.getAttribute("aria-label") || ("placeholder" in element ? element.placeholder : "") || "";
}

export const CheckedForm = React.forwardRef<HTMLFormElement, React.FormHTMLAttributes<HTMLFormElement>>(function CheckedForm({ onSubmit, children, ...rest }, ref) {
  const { language } = useLanguage();
  const [problems, setProblems] = React.useState<Problem[]>([]);
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    for (const marked of Array.from(form.querySelectorAll("[data-checked-invalid]"))) { marked.removeAttribute("aria-invalid"); marked.removeAttribute("data-checked-invalid"); }
    const found = formFieldProblems(form, language);
    if (found.length) {
      event.preventDefault();
      for (const { element } of found) { element.setAttribute("aria-invalid", "true"); element.setAttribute("data-checked-invalid", ""); }
      setProblems(found.map(({ element, message }) => ({ element, label: fieldName(element), message })));
      found[0].element.focus();
      return;
    }
    setProblems([]);
    onSubmit?.(event);
  };
  return (
    <form ref={ref} noValidate {...rest} onSubmit={submit}>
      {problems.length ? (
        <div role="alert" data-form-problems className="col-span-full mb-1 rounded-[var(--radius)] bg-danger-soft p-3 text-sm text-danger-soft-foreground">
          <p className="flex items-center gap-1.5 font-medium"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{pickLanguage(language, copy)}</p>
          <ul className="mt-1 list-inside list-disc">{problems.map((problem, index) => <li key={index}><button type="button" className="underline-offset-2 hover:underline" onClick={() => problem.element.focus()}>{problem.label ? `${problem.label}: ` : ""}{problem.message}</button></li>)}</ul>
        </div>
      ) : null}
      {children}
    </form>
  );
});
