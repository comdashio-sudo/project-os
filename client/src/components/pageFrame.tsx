import React, { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

// A page inside the product frame (ProductShell) must not draw a second frame: the frame owns the one <main>, the one top bar (<header>, the banner)
// and the one language switch (work order 21 step 1; code review of #156, item 2). The same pages still open on their own in tests and in the
// unframed routes, where they keep their own landmarks. These three pieces choose by the context ProductShell provides.
const InShellContext = createContext(false);

export function InShellProvider({ children }: { children: React.ReactNode }) {
  return <InShellContext.Provider value>{children}</InShellContext.Provider>;
}

export function useInShell() {
  return useContext(InShellContext);
}

type BlockProps = React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode };

/** The page's root. Alone: <main>. Inside the frame: a plain block without its own page background or full-screen height (the frame has both). */
export function PageMain({ className, ...rest }: BlockProps) {
  if (useInShell()) return <div data-page-root="" {...rest} className={cn(className, "min-h-0 bg-transparent")} />;
  return <main {...rest} className={className} />;
}

/** The page's top row. Alone: <header>. Inside the frame: a toolbar row in the content, without the bar's border and background. */
export function PageHeader({ className, ...rest }: BlockProps) {
  if (useInShell()) return <div data-page-toolbar="" {...rest} className={cn(className, "border-0 bg-transparent shadow-none")} />;
  return <header {...rest} className={className} />;
}

/** Drawn only when the page is not inside the frame (for example a second logo the frame already shows). */
export function OutsideShell({ children }: { children: React.ReactNode }) {
  return useInShell() ? null : <>{children}</>;
}
