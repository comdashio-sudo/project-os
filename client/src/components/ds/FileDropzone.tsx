import React, { useRef, useState } from "react";
import { CheckCircle2, FileText, UploadCloud, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { formatBytes, formatPercent } from "./format";
import { useDsText } from "./strings";

export type UploadItem = { id: string; name: string; size: number; progress?: number; status: "queued" | "uploading" | "done" | "failed"; message?: string };

/**
 * Drag-and-drop upload area. The only place in the product that holds a file input (hidden), so the browser's own "Choose File" is never shown: the visible control is a translated
 * button. Rejects the wrong type and size before anything is sent, with the reason in the language of the screen. Progress is a real progress bar for each file.
 */
export function FileDropzone({ accept, maxBytes, items, onFiles, onRemove, disabled, hint, multiple = false }: {
  accept: string[]; maxBytes: number; items: UploadItem[]; onFiles: (files: File[]) => void; onRemove?: (id: string) => void; disabled?: boolean; hint?: string; multiple?: boolean;
}) {
  const text = useDsText();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const extensions = accept.map(item => item.toLowerCase());
  const take = (list: FileList | File[]) => {
    const accepted: File[] = [];
    for (const file of Array.from(list)) {
      const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
      if (!extensions.includes(extension)) { setProblem(`${text.dropBadType}: ${file.name}`); continue; }
      if (file.size > maxBytes) { setProblem(`${text.dropTooBig}: ${file.name} (${formatBytes(file.size)} / ${formatBytes(maxBytes)})`); continue; }
      accepted.push(file);
    }
    if (accepted.length) { setProblem(null); onFiles(multiple ? accepted : accepted.slice(0, 1)); }
  };
  return (
    <div className="flex flex-col gap-3">
      <div data-dropzone data-over={over || undefined}
        onDragOver={event => { event.preventDefault(); if (!disabled) setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={event => { event.preventDefault(); setOver(false); if (!disabled) take(event.dataTransfer.files); }}
        className={cn("flex flex-col items-center gap-3 rounded-[var(--radius)] border-2 border-dashed px-4 py-8 text-center transition-colors", over ? "border-primary bg-accent" : "border-input bg-card", disabled && "opacity-60")}>
        <UploadCloud className={cn("h-8 w-8", over ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">{over ? text.dropActive : text.dropTitle}</p>
        <p className="text-xs text-muted-foreground">{text.dropOr}</p>
        <Button variant="secondary" size="md" disabled={disabled} onClick={() => input.current?.click()}>{items.length && !multiple ? text.dropReplace : text.dropChoose}</Button>
        <p className="text-xs text-muted-foreground">{hint ?? <>{text.dropTypes}: <bdi dir="ltr">{accept.map(item => item.replace(".", "").toUpperCase()).join(" · ")}</bdi> — {text.dropLimit}: <bdi dir="ltr">{formatBytes(maxBytes)}</bdi></>}</p>
        <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" multiple={multiple} accept={accept.join(",")} disabled={disabled}
          onChange={event => { if (event.target.files) take(event.target.files); event.target.value = ""; }} />
      </div>
      {problem ? <p role="alert" className="flex items-start gap-1.5 text-xs font-medium text-destructive"><XCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />{problem}</p> : null}
      {items.length ? <ul className="flex flex-col gap-2">{items.map(item => (
        <li key={item.id} className="rounded-[var(--radius)] border border-border bg-card p-3">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" dir="auto">{item.name}</p><p className="text-xs text-muted-foreground"><bdi dir="ltr">{formatBytes(item.size)}</bdi>{item.status === "uploading" && item.progress !== undefined ? <> · <bdi dir="ltr">{formatPercent(item.progress, 0)}</bdi></> : null}</p></div>
            {item.status === "done" ? <span className="flex items-center gap-1 text-xs font-medium text-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{text.dropDone}</span> : null}
            {item.status === "failed" ? <span className="flex items-center gap-1 text-xs font-medium text-destructive"><XCircle className="h-4 w-4" aria-hidden="true" />{text.dropFailed}</span> : null}
            {onRemove ? <button type="button" onClick={() => onRemove(item.id)} aria-label={`${text.dropRemove}: ${item.name}`} className="grid h-9 w-9 place-items-center rounded-[var(--radius)] text-muted-foreground hover:bg-muted"><X className="h-4 w-4" aria-hidden="true" /></button> : null}
          </div>
          {item.status === "uploading" ? <div role="progressbar" aria-label={text.dropUploading} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress ?? 0)} className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(0, Math.min(100, item.progress ?? 0))}%` }} /></div> : null}
          {item.message ? <p className="mt-1.5 text-xs text-muted-foreground">{item.message}</p> : null}
        </li>))}</ul> : null}
    </div>
  );
}
