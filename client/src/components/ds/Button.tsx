import React from "react";
import { cn } from "@/lib/utils";
import { useDsText } from "./strings";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 border border-transparent",
  secondary: "bg-card text-foreground border border-input hover:bg-muted active:bg-muted/80",
  ghost: "bg-transparent text-foreground border border-transparent hover:bg-muted active:bg-muted/80",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80 border border-transparent",
};
const sizes: Record<ButtonSize, string> = { sm: "min-h-11 px-3 text-sm gap-1.5 md:min-h-9", md: "min-h-11 px-4 text-sm gap-2 md:min-h-10", lg: "min-h-12 px-6 text-base gap-2.5" };

export function Spinner({ className = "" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={cn("h-4 w-4 animate-spin motion-reduce:animate-none", className)} fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: React.ReactNode };

/** primary / secondary / ghost / danger, three sizes. `loading` keeps the label, shows a spinner, disables the click and tells assistive technology it is busy. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "primary", size = "md", loading = false, disabled, icon, className, children, type = "button", ...rest }, ref) {
  const text = useDsText();
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} data-variant={variant}
      className={cn("inline-flex items-center justify-center rounded-[var(--radius)] font-medium transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50", variants[variant], sizes[size], className)} {...rest}>
      {loading ? <><Spinner /><span className="sr-only">{text.loading}</span></> : icon}
      {children}
    </button>
  );
});
