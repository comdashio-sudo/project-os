import React from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlClass } from "./Field";
import { useDsText } from "./strings";

export type SelectOption = { value: string; label: string; description?: string; disabled?: boolean };

/** The custom list: never the browser's own select. Keyboard (arrows, type-ahead, Esc), screen-reader roles and RTL come from Radix; the look comes from the direction's tokens. */
export function Select({ options, value, onValueChange, placeholder, id, invalid, disabled, className, "aria-label": ariaLabel, "aria-describedby": describedBy }: {
  options: SelectOption[]; value?: string; onValueChange: (value: string) => void; placeholder?: string; id?: string; invalid?: boolean; disabled?: boolean; className?: string; "aria-label"?: string; "aria-describedby"?: string;
}) {
  const text = useDsText();
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger id={id} aria-label={ariaLabel} aria-describedby={describedBy} aria-invalid={invalid || undefined}
        className={cn(controlClass(invalid), "flex min-h-11 items-center justify-between gap-2 text-start data-[placeholder]:text-muted-foreground md:min-h-10", className)}>
        <RadixSelect.Value placeholder={placeholder ?? text.selectPlaceholder} />
        <RadixSelect.Icon><ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /></RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content position="popper" sideOffset={4} className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--radius)] border border-border bg-popover text-popover-foreground shadow-lg">
          <RadixSelect.Viewport className="p-1">
            {options.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">{text.selectEmpty}</p> : null}
            {options.map(option => (
              <RadixSelect.Item key={option.value} value={option.value} disabled={option.disabled}
                className="relative flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-[calc(var(--radius)-2px)] py-2 ps-8 pe-3 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground">
                <RadixSelect.ItemIndicator className="absolute start-2"><Check className="h-4 w-4" aria-hidden="true" /></RadixSelect.ItemIndicator>
                <span className="flex flex-col"><RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>{option.description ? <span className="text-xs text-muted-foreground">{option.description}</span> : null}</span>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
