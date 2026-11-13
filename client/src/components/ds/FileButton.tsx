import React, { useState } from "react";
import { FileUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDsText } from "./strings";

/**
 * The compact file control: one translated button (a label holding the hidden file input) and, once chosen, the file's name. Where a whole
 * drop area (FileDropzone) is too much — a toolbar, a row of filters. The browser's own «Choose File / No file chosen» never shows.
 * The input keeps `aria-label` so it stays reachable for assistive technology and tests; the visible text is the label.
 */
export function FileButton({ label, accept, onFile, disabled, showName = true, className }: {
  label: string; accept: string; onFile: (file: File | null) => void; disabled?: boolean; showName?: boolean; className?: string;
}) {
  const text = useDsText();
  const [name, setName] = useState<string | null>(null);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <label data-file-button className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-ring", disabled && "pointer-events-none opacity-50")}>
        <FileUp className="h-4 w-4" aria-hidden="true" />
        <span>{label}</span>
        <input type="file" aria-label={label} accept={accept} disabled={disabled} className="sr-only"
          onChange={event => { const file = event.target.files?.[0] ?? null; setName(file?.name ?? null); onFile(file); event.target.value = ""; }} />
      </label>
      {showName ? <span className="max-w-[16rem] truncate text-xs text-muted-foreground" dir="auto">{name ?? text.dropChoose}</span> : null}
    </span>
  );
}
