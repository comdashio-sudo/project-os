import React from "react";
import { Toaster as Sonner, toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDirection } from "./direction";
import { useDsText } from "./strings";

/** A plain illustration for "nothing here yet": a tray with a dashed outline and a plus mark. Token colours only, so it follows the direction. */
export function EmptyIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 88" className={cn("h-24 w-auto", className)} role="presentation" aria-hidden="true" focusable="false">
      <rect x="14" y="26" width="92" height="52" rx="8" fill="var(--muted)" />
      <path d="M14 52h26l6 10h28l6-10h26" fill="none" stroke="var(--border)" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="34" y="8" width="52" height="30" rx="5" fill="var(--card)" stroke="var(--input)" strokeWidth="2" strokeDasharray="5 4" />
      <path d="M60 17v12M54 23h12" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({ title, line, action }: { title: string; line?: string; action?: React.ReactNode }) {
  return (
    <div role="status" data-empty className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-dashed border-input bg-card px-6 py-10 text-center">
      <EmptyIllustration />
      <p className="text-base font-semibold">{title}</p>
      {line ? <p className="max-w-sm text-sm text-muted-foreground">{line}</p> : null}
      {action}
    </div>
  );
}

/** A loading placeholder shaped like what will arrive. The pulse stops for people who asked for less motion. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block animate-pulse rounded-[calc(var(--radius)-2px)] bg-muted motion-reduce:animate-none", className)} />;
}
export function SkeletonRows({ rows = 4, label }: { rows?: number; label?: string }) {
  const text = useDsText();
  return <div role="status" aria-busy="true" className="flex flex-col gap-3"><span className="sr-only">{label ?? text.loading}</span>{Array.from({ length: rows }, (_, index) => <div key={index} className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>)}</div>;
}

/** The toast host: mount once per screen. Colours, radius and font come from the direction's tokens. */
export function Toaster() {
  const { isRtl } = useLanguage(); const { mode } = useDirection(); const text = useDsText();
  return <Sonner theme={mode} dir={isRtl ? "rtl" : "ltr"} position={isRtl ? "bottom-left" : "bottom-right"} containerAriaLabel={text.notifications} closeButton
    toastOptions={{ style: { background: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontFamily: "inherit" } }} />;
}
export const notify = {
  success: (message: string, description?: string) => toast.success(message, { description }),
  error: (message: string, description?: string) => toast.error(message, { description }),
  info: (message: string, description?: string) => toast(message, { description }),
};
