import React from "react";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Take a photo" on a phone: a button-sized label that opens the camera (capture="environment"). The file input is hidden and lives here, in the
 * component library, like the one in FileDropzone (the browser's own "Choose File" is never shown). The label's text names the input.
 */
export function CameraCapture({ label, onFile, disabled, className }: { label: string; onFile: (file: File) => void; disabled?: boolean; className?: string }) {
  return (
    <label aria-disabled={disabled || undefined} className={cn("flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius)] border border-input bg-card px-3 text-base font-medium text-primary hover:bg-muted", disabled && "pointer-events-none opacity-50", className)}>
      <Camera className="h-5 w-5" aria-hidden="true" />{label}
      <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onFile(file); }} />
    </label>
  );
}
