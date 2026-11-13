import React from "react";

/**
 * Q-18: what a person sees while a page is on its way. It has the shape of the page that will arrive (the product frame: the top bar, the side list on a
 * wide screen, a title and cards), in the quiet grey of the platform's lines, never the accent colour, so nothing jumps or changes colour when the page
 * lands. The pulse stops for people who asked for less motion. `frame={false}` draws only the content area, for a page loading inside a frame already shown.
 */
export function SkeletonBar({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-[calc(var(--radius)-2px)] bg-[var(--dashio-line)] motion-reduce:animate-none ${className}`} />;
}

export function ContentSkeleton() {
  return (
    <div role="status" aria-busy="true" data-skeleton="content" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <span className="sr-only">…</span>
      <SkeletonBar className="h-4 w-40" />
      <SkeletonBar className="h-8 w-64 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(index => <div key={index} className="rounded-[var(--radius-lg)] border border-border bg-card p-4"><SkeletonBar className="h-3 w-24" /><SkeletonBar className="mt-3 h-7 w-20" /></div>)}</div>
      <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">{[0, 1, 2, 3].map(index => <SkeletonBar key={index} className={`h-4 ${index ? "mt-4" : ""} ${index % 2 ? "w-3/4" : "w-full"}`} />)}</div>
    </div>
  );
}

export function ShellSkeleton({ frame = true }: { frame?: boolean }) {
  if (!frame) return <ContentSkeleton />;
  return (
    <div data-skeleton="shell" className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-3 md:px-4"><SkeletonBar className="h-7 w-24" /><span className="flex-1" /><SkeletonBar className="h-9 w-9 rounded-full" /></header>
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-e border-sidebar-border bg-sidebar p-3 md:block">{[0, 1, 2, 3, 4].map(index => <SkeletonBar key={index} className={`h-9 w-full ${index ? "mt-2" : ""}`} />)}</aside>
        <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7"><ContentSkeleton /></main>
      </div>
    </div>
  );
}
