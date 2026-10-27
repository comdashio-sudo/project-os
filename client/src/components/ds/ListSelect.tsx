import React, { useId } from "react";
import { Select } from "./Select";

// The same list as Select, written the way a native <select> is written: <ListSelect value onChange={event => set(event.target.value)}> with
// <Option value>label</Option> children. Work order 21 moved the remaining screens' browser lists onto it without rewriting each handler. An empty
// value ("" = "none" / "all") is carried as EMPTY_VALUE inside the custom list (Radix cannot hold ""), and comes back to the screen as "".
// `required` puts a hidden copy of the value next to the list, so CheckedForm (client/src/components/CheckedForm.tsx) can name a missing choice.
export const EMPTY_VALUE = "__empty";

type OptionProps = { value: string | number; disabled?: boolean; children?: React.ReactNode };
/** A choice inside ListSelect. It draws nothing itself: ListSelect reads its value and its text. */
export function Option(_props: OptionProps): null {
  return null;
}

export type ListSelectChange = { target: { value: string }; currentTarget: { value: string } };
export type ListSelectProps = {
  value?: string | number | null; onChange?: (event: ListSelectChange) => void; children?: React.ReactNode; id?: string; className?: string; disabled?: boolean; required?: boolean;
  placeholder?: string; "aria-label"?: string; "aria-describedby"?: string; "aria-invalid"?: boolean;
};

const textOf = (node: React.ReactNode): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return "";
};

/** The Option elements among the children, through fragments and arrays (the usual `{list.map(item => <Option …/>)}`). */
export function optionsOf(children: React.ReactNode): Array<{ value: string; label: string; disabled?: boolean }> {
  const found: Array<{ value: string; label: string; disabled?: boolean }> = [];
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) { found.push(...optionsOf((child.props as { children?: React.ReactNode }).children)); return; }
    if (child.type === Option) { const props = child.props as OptionProps; found.push({ value: String(props.value), label: textOf(props.children), disabled: props.disabled }); }
  });
  return found;
}

export function ListSelect({ value, onChange, children, id, className, disabled, required, placeholder, "aria-label": ariaLabel, "aria-describedby": describedBy, "aria-invalid": invalid }: ListSelectProps) {
  const generated = useId();
  const triggerId = id ?? `list-${generated}`;
  const options = optionsOf(children).map(option => ({ ...option, value: option.value === "" ? EMPTY_VALUE : option.value }));
  const raw = value === null || value === undefined ? "" : String(value);
  const current = raw === "" ? EMPTY_VALUE : raw;
  const known = options.some(option => option.value === current);
  const change = (next: string) => { const plain = next === EMPTY_VALUE ? "" : next; onChange?.({ target: { value: plain }, currentTarget: { value: plain } }); };
  return (
    <>
      <Select id={triggerId} aria-label={ariaLabel} aria-describedby={describedBy} invalid={invalid} disabled={disabled} className={className} placeholder={placeholder}
        value={known ? current : undefined} onValueChange={change} options={options} />
      {required ? <input tabIndex={-1} aria-hidden="true" className="sr-only" required readOnly value={raw} aria-label={ariaLabel} data-list-for={triggerId} onFocus={() => document.getElementById(triggerId)?.focus()} /> : null}
    </>
  );
}
