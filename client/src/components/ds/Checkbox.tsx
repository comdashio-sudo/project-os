import React from "react";
import { cn } from "@/lib/utils";

/**
 * A single on/off choice. The visible box is 20px, but the label around it is the touch target: 44 × 44 on the phone (40 from md up),
 * so a row's selection in a dense table is as easy to hit as a button. The accessible name comes from `aria-label` (or the label children).
 */
export function Checkbox({ checked, onCheckedChange, disabled, className, children, "aria-label": ariaLabel }: {
  checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean; className?: string; children?: React.ReactNode; "aria-label"?: string;
}) {
  return (
    <label className={cn("inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius)] md:min-h-10 md:min-w-10", disabled && "cursor-not-allowed opacity-50", className)}>
      <input type="checkbox" aria-label={ariaLabel} checked={checked} disabled={disabled} onChange={event => onCheckedChange(event.target.checked)}
        className="size-5 shrink-0 cursor-[inherit] rounded border-input accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
      {children}
    </label>
  );
}
