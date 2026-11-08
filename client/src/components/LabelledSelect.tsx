import React from "react";
import { Select } from "@/components/ds";

// "All" in a filter list: the custom list (Radix) cannot hold an empty value, so it carries this one and the screen reads it as "no filter".
export const ALL = "__all";

/** A labelled list from the design system (never the browser's own select): the label above, the list under it. For filters and pickers that sit in a row. */
export function LabelledSelect({ label, value, onValueChange, options, disabled, className = "" }: { label: string; value: string; onValueChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean; className?: string }) {
  return <div className={`text-xs ${className}`}><span className="mb-1 block">{label}</span><Select aria-label={label} value={value} onValueChange={onValueChange} options={options} disabled={disabled} className="min-w-36" /></div>;
}
