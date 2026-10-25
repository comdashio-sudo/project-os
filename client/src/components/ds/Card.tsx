import React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, as: Tag = "section", ...rest }: React.HTMLAttributes<HTMLElement> & { as?: "section" | "article" | "div" | "aside" }) {
  return <Tag className={cn("rounded-[var(--radius)] border border-border bg-card text-card-foreground", className)} style={{ boxShadow: "var(--shadow-card)" }} {...rest} />;
}
export const CardHeader = ({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex flex-col gap-1 border-b border-border px-5 py-4", className)} {...rest} />;
export const CardTitle = ({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn("text-base font-semibold leading-tight", className)} {...rest} />;
export const CardBody = ({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("px-5 py-5", className)} {...rest} />;
export const CardFooter = ({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4", className)} {...rest} />;
