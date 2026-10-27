import React from "react";
import type { ListSelectProps, optionsOf as OptionsOf } from "@/components/ds/ListSelect";

// ListSelect draws the design system's custom list (Radix), which jsdom cannot drive. In the screens' tests it is this native <select> with the
// same contract (value, onChange with event.target.value, Option children, id, aria-label, className, disabled, required), so the screens' own
// logic is what is tested. listSelect.setup.ts installs it for every test, passing the real optionsOf (this file imports nothing from the mocked
// module, which would import itself); the real component is tested in components/ds/ListSelect.test.tsx.
export function makeNativeListSelect(optionsOf: typeof OptionsOf) {
  return function ListSelect({ value, onChange, children, id, className, disabled, required, placeholder, "aria-label": ariaLabel, "aria-describedby": describedBy }: ListSelectProps) {
    const options = optionsOf(children);
    const current = value === null || value === undefined ? "" : String(value);
    return (
      <select id={id} className={className} disabled={disabled} required={required} aria-label={ariaLabel} aria-describedby={describedBy} value={current}
        onChange={event => onChange?.({ target: { value: event.target.value }, currentTarget: { value: event.target.value } })}>
        {options.some(option => option.value === current) ? null : <option value={current}>{placeholder ?? ""}</option>}
        {options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
      </select>
    );
  };
}
