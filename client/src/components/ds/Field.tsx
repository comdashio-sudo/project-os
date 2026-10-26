import React, { useId } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDsText } from "./strings";

export type FieldControlProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean; "aria-required"?: boolean };

/** Label above, helper line under it, the control, then the error right beside the control (under it, with an icon and the danger colour). Wires id / aria-describedby / aria-invalid for the control. */
export function Field({ label, hint, error, required, optional, children, className }: { label: string; hint?: string; error?: string; required?: boolean; optional?: boolean; children: (props: FieldControlProps) => React.ReactNode; className?: string }) {
  const text = useDsText();
  const id = useId(); const hintId = `${id}-hint`; const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}{required ? <span className="ms-1 text-destructive" aria-label={text.required}>*</span> : null}{optional ? <span className="ms-2 text-xs font-normal text-muted-foreground">{text.optional}</span> : null}</label>
      {hint ? <p id={hintId} className="text-xs text-muted-foreground">{hint}</p> : null}
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, "aria-required": required || undefined })}
      {error ? <p id={errorId} role="alert" className="flex items-start gap-1.5 text-xs font-medium text-destructive"><AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />{error}</p> : null}
    </div>
  );
}

const controlBase = "w-full rounded-[var(--radius)] border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60";
export const controlClass = (invalid?: boolean) => cn(controlBase, invalid ? "border-destructive" : "border-input hover:border-foreground/40");

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function TextInput({ className, invalid, ...rest }, ref) {
  if (rest.type === "file") throw new Error("TextInput does not take type=file: use FileDropzone");
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(controlClass(invalid), "min-h-11 md:min-h-10", className)} {...rest} />;
});

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function TextArea({ className, invalid, ...rest }, ref) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(controlClass(invalid), "min-h-24 py-2.5", className)} {...rest} />;
});
