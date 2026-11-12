import React from "react";
import { FileUp, Plus } from "lucide-react";
import { Button } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";

// Work order 21: every section of a project has the same two ways in, "+ Add" and "Upload file", and an empty section shows both.
// "+ Add" takes the person to the section's own form (its first field gets the focus); it is not shown where the section has no form
// (a read-only role sees the reason the form is missing instead). "Upload file" is the page's one upload (the smart import, or the data imports until it exists).
export const ProjectUploadContext = React.createContext<(() => void) | null>(null);

// the small desktop button, but a 44px target on a phone (the new buttons meet the touch rule; the page-wide sizes are D-76)
const PHONE_TAP = "min-h-11 md:min-h-9";
const FIELD = 'form input:not([type="hidden"]):not([disabled]), form textarea:not([disabled]), form [role="combobox"]:not([disabled])';
// the "+" of "+ Add" is the button's plus icon
const copy = { ar: { add: "إضافة", upload: "رفع ملف" }, en: { add: "Add", upload: "Upload file" }, ur: { add: "شامل کریں", upload: "فائل اپ لوڈ کریں" } };

/** The section is the nearest [data-section-scope] (or <section>) around the buttons. `onAdd` replaces the search for a form (an empty state points at the form elsewhere). */
export function SectionActions({ onAdd, onUpload, className = "" }: { onAdd?: () => void; onUpload?: () => void; className?: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, copy);
  const contextUpload = React.useContext(ProjectUploadContext);
  const upload = onUpload ?? contextUpload;
  const self = React.useRef<HTMLDivElement>(null);
  const [hasForm, setHasForm] = React.useState(false);
  const scope = () => (self.current?.closest("[data-section-scope]") ?? self.current?.closest("section")) as HTMLElement | null;
  React.useEffect(() => {
    const root = scope();
    if (!root) return;
    const check = () => setHasForm(Boolean(root.querySelector(FIELD)));
    check();
    // a section's form can arrive later (its data or the person's permissions load after the buttons)
    const observer = new MutationObserver(check);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    return () => observer.disconnect();
  }, []);
  const add = () => {
    if (onAdd) { onAdd(); return; }
    const field = scope()?.querySelector<HTMLElement>(FIELD);
    if (!field) return;
    field.scrollIntoView?.({ block: "center", behavior: "smooth" });
    field.focus();
  };
  const canAdd = Boolean(onAdd) || hasForm;
  if (!canAdd && !upload) return <div ref={self} hidden />;
  return (
    <div ref={self} data-section-actions className={`flex flex-wrap items-center gap-2 print:hidden ${className}`}>
      {canAdd ? <Button size="sm" variant="secondary" className={PHONE_TAP} icon={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={add}>{t.add}</Button> : null}
      {upload ? <Button size="sm" variant="secondary" className={PHONE_TAP} icon={<FileUp className="h-4 w-4" aria-hidden="true" />} onClick={upload}>{t.upload}</Button> : null}
    </div>
  );
}
