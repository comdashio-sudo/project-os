import React from "react";

// The design system's Select is a Radix list that needs pointer and scroll APIs jsdom does not have. In a screen's test it is replaced by this
// native stand-in with the SAME contract (value, options, placeholder, id for a Field's label, aria-label), so the screen's own logic is what is
// tested. The real component is tested where it lives (client/src/components/ds/ds.test.tsx). Use:
//   vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
export function NativeSelect({ id, value, onValueChange, options, placeholder, disabled, className, "aria-label": ariaLabel, "aria-describedby": describedBy, "aria-required": ariaRequired, invalid }: {
  id?: string; className?: string; value?: string; onValueChange: (value: string) => void; options: Array<{ value: string; label: string; disabled?: boolean }>; placeholder?: string; disabled?: boolean; "aria-label"?: string; "aria-describedby"?: string; "aria-required"?: boolean; invalid?: boolean;
}) {
  const hasValue = options.some(option => option.value === value);
  return (
    <select id={id} className={className} aria-label={ariaLabel} aria-describedby={describedBy} aria-required={ariaRequired || undefined} aria-invalid={invalid || undefined} disabled={disabled} value={hasValue ? value : ""} onChange={event => onValueChange(event.target.value)}>
      {hasValue ? null : <option value="">{placeholder ?? ""}</option>}
      {options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
  );
}
