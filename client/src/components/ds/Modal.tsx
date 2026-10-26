import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { useDsText } from "./strings";

/** A dialog: focus is trapped and returned, Esc closes, the title and one line are announced. `danger` styles the confirm button as destructive. */
export function Modal({ open, onOpenChange, title, line, children, confirmLabel, onConfirm, danger, loading }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; line?: string; children?: React.ReactNode; confirmLabel?: string; onConfirm?: () => void; danger?: boolean; loading?: boolean;
}) {
  const text = useDsText();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
        <Dialog.Content className={cn("fixed start-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-y-1/2 rounded-[var(--radius)] border border-border bg-popover p-5 text-popover-foreground shadow-xl ltr:-translate-x-1/2 rtl:translate-x-1/2")}>
          <div className="flex items-start justify-between gap-3">
            <div><Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>{line ? <Dialog.Description className="mt-1 text-sm text-muted-foreground">{line}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}</div>
            <Dialog.Close aria-label={text.close} className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] text-muted-foreground hover:bg-muted"><X className="h-4 w-4" aria-hidden="true" /></Dialog.Close>
          </div>
          {children ? <div className="mt-4">{children}</div> : null}
          {onConfirm ? <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>{text.cancel}</Button><Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel ?? text.confirm}</Button></div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
