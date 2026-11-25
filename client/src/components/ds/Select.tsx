import React from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlClass } from "./Field";
import { useDsText } from "./strings";

export type SelectOption = { value: string; label: string; description?: string; disabled?: boolean; /** Q-58 (3): options that share a group are listed under its label (consecutive options, in order). */ group?: string };

const item = (option: SelectOption) => (
  <RadixSelect.Item key={option.value} value={option.value} disabled={option.disabled} data-value={option.value}
    className="relative flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-[calc(var(--radius)-2px)] py-2 ps-8 pe-3 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground">
    <RadixSelect.ItemIndicator className="absolute start-2"><Check className="h-4 w-4" aria-hidden="true" /></RadixSelect.ItemIndicator>
    <span className="flex flex-col"><RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>{option.description ? <span className="text-xs text-muted-foreground">{option.description}</span> : null}</span>
  </RadixSelect.Item>
);
/** Consecutive options with the same `group` form one group; options without one stay ungrouped. */
function groupsOf(options: SelectOption[]) {
  const groups: Array<{ label: string | undefined; items: SelectOption[] }> = [];
  for (const option of options) { const last = groups[groups.length - 1]; if (last && last.label === option.group) last.items.push(option); else groups.push({ label: option.group, items: [option] }); }
  return groups;
}

/** The custom list: never the browser's own select. Keyboard (arrows, type-ahead, Esc), screen-reader roles and RTL come from Radix; the look comes from the direction's tokens. */
/**
 * `required` (with an `id`): the list also writes its value into a hidden copy (data-list-for = the list's id) that the shared form check reads
 * (client/src/lib/formValidation.ts through CheckedForm): an empty required list stops the submit with the same translated message as a typed
 * field, under the list. The copy is out of the tab order and hidden from assistive technology; the list itself carries aria-required.
 */
export function Select({ options, value, onValueChange, placeholder, id, invalid, disabled, required, className, "aria-label": ariaLabel, "aria-describedby": describedBy, "aria-required": ariaRequired }: {
  options: SelectOption[]; value?: string; onValueChange: (value: string) => void; placeholder?: string; id?: string; invalid?: boolean; disabled?: boolean; required?: boolean; className?: string; "aria-label"?: string; "aria-describedby"?: string; "aria-required"?: boolean;
}) {
  const text = useDsText();
  return (
    <>
    {required && id ? <input id={`${id}-value`} data-list-for={id} required disabled={disabled} value={value ?? ""} onChange={() => undefined} tabIndex={-1} aria-hidden="true" className="sr-only" /> : null}
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger id={id} aria-label={ariaLabel} aria-describedby={describedBy} aria-required={ariaRequired || required || undefined} aria-invalid={invalid || undefined}
        className={cn(controlClass(invalid), "flex min-h-11 items-center justify-between gap-2 text-start data-[placeholder]:text-muted-foreground md:min-h-10 [&>span:first-child]:min-w-0 [&>span:first-child]:truncate", className)}>
        <RadixSelect.Value placeholder={placeholder ?? text.selectPlaceholder} />
        <RadixSelect.Icon><ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /></RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content position="popper" sideOffset={4} className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--radius)] border border-border bg-popover text-popover-foreground shadow-lg">
          <RadixSelect.Viewport className="p-1">
            {options.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">{text.selectEmpty}</p> : null}
            {groupsOf(options).map((group, index) => group.label === undefined ? group.items.map(item) : (
              <RadixSelect.Group key={`${group.label}-${index}`} data-select-group={group.label}>
                <RadixSelect.Label className="px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground">{group.label}</RadixSelect.Label>
                {group.items.map(item)}
              </RadixSelect.Group>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
    </>
  );
}
