import React from "react";
import { cn } from "@/lib/utils";

/**
 * A button that opens the file picker, for screens that take one file and act on it at once (a drawing, a plan). The file input is hidden and lives
 * here, in the component library, like FileDropzone's and CameraCapture's: the browser's own "Choose File" is never shown. The change event is the
 * input's own, so a screen keeps its handler.
 */
export function FileButton({ label, accept, onChange, disabled, className }: { label: React.ReactNode; accept: string; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void; disabled?: boolean; className?: string }) {
  return (
    <label aria-disabled={disabled || undefined} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-input bg-card px-4 text-sm font-medium text-foreground hover:bg-muted", disabled && "pointer-events-none opacity-50", className)}>
      {label}
      <input type="file" accept={accept} className="sr-only" onChange={onChange} disabled={disabled} />
    </label>
  );
}
