import React from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { isRefusal, refusalSentence } from "@/components/ScreenStates";

type SectionErrorBoundaryProps = {
  children: React.ReactNode;
  title: string;
  isArabic: boolean;
};

type SectionErrorBoundaryState = { failed: boolean };

export class SectionErrorBoundary extends React.Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  state: SectionErrorBoundaryState = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previousProps: SectionErrorBoundaryProps) {
    if (previousProps.title !== this.props.title && this.state.failed) this.setState({ failed: false });
  }

  componentDidCatch(error: Error) { console.error("[Section] render failed", error.name); } // name only: a message can carry data

  render() {
    if (this.state.failed) {
      return <SectionMessage title={this.props.title} isArabic={this.props.isArabic} kind="error" onRetry={() => this.setState({ failed: false })} />;
    }
    return this.props.children;
  }
}

/**
 * Every panel in a composed page gets its own boundary (G-100): a panel that fails to render says so in its own place, with a retry, and its
 * neighbours keep working. `titles` names the panels by their component name, so the message says which one failed.
 */
export function GuardedPanels({ children, isArabic, titles }: { children: React.ReactNode; isArabic: boolean; titles?: Record<string, { ar: string; en: string }> }) {
  return <>{React.Children.map(children, (child, index) => {
    if (!React.isValidElement(child)) return child;
    const type = child.type as { displayName?: string; name?: string };
    const label = titles?.[type.displayName ?? type.name ?? ""];
    const title = label ? label[isArabic ? "ar" : "en"] : isArabic ? "هذا القسم" : "This section";
    return <SectionErrorBoundary key={child.key ?? index} title={title} isArabic={isArabic}>{child}</SectionErrorBoundary>;
  })}</>;
}

/** `error` is the source's error: a refusal says so in a sentence (the server's, when it sent one) instead of the generic failure copy. */
export function SectionMessage({ title, isArabic, kind, detail, onRetry, error }: { title: string; isArabic: boolean; kind: "loading" | "empty" | "error" | "partial"; detail?: string; onRetry?: () => void; error?: unknown }) {
  const copy = isArabic
    ? {
        loading: "جارٍ تحميل هذا القسم…",
        empty: "لا توجد بيانات لهذا القسم ضمن نطاق الوصول الحالي.",
        error: "تعذّر تحميل هذا القسم. بقية اللوحة ما زالت متاحة.",
        partial: "تتوفر بيانات جزئية فقط؛ يُشار إلى المصادر الناقصة أدناه.",
      }
    : {
        loading: "Loading this section…",
        empty: "No data is available for this section in the current access scope.",
        error: "This section could not be loaded. The rest of the dashboard remains available.",
        partial: "Only partial data is available; missing sources are identified below.",
      };
  const tone = kind === "error" ? "border-red-200 bg-red-50 text-red-800" : kind === "partial" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-border bg-muted/30 text-muted-foreground";
  return <section aria-label={title} className={`rounded-[var(--radius-lg)] border p-5 ${tone}`}>
    <div className="flex items-center gap-2 text-sm">
      {kind === "loading" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
      <div><p className="font-semibold">{title}</p><p className="mt-1">{detail ?? (kind === "error" && isRefusal(error) ? refusalSentence(error, isArabic, "section") : copy[kind])}</p>{onRetry && <button type="button" className="mt-2 min-h-[44px] rounded-lg border border-current bg-white px-4 text-sm font-semibold" onClick={onRetry}>{isArabic ? "أعد المحاولة" : "Try again"}</button>}</div>
    </div>
  </section>;
}

/** The part of a tRPC query result a failure notice needs. */
export type SourceQuery = { error: unknown; isFetching?: boolean; refetch?: () => unknown };

/**
 * A data source that failed says so, in its own place, with the reason and a retry (G-100): before, a failed query left its list
 * empty, which looked exactly like "nothing here yet". `fallback` says what the person can still do without it (type the name by hand,
 * carry on without the chart). Renders nothing while the source is healthy.
 */
export function SourceNotice({ query, isArabic, title, fallback, className = "" }: { query: SourceQuery; isArabic: boolean; title: string; fallback?: string; className?: string }) {
  if (!query.error) return null;
  return <div role="alert" aria-label={title} className={`rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 ${className}`}>
    <p className="font-semibold">{isArabic ? `تعذّر تحميل: ${title}` : `Could not load: ${title}`}</p>
    <p className="mt-1">{getLocalizedProjectError(query.error, isArabic)}{fallback ? ` ${fallback}` : ""}</p>
    {query.refetch && <button type="button" disabled={query.isFetching} className="mt-2 min-h-[44px] rounded-lg border border-amber-700 bg-white px-4 font-semibold disabled:opacity-60" onClick={() => void query.refetch?.()}>{isArabic ? "أعد المحاولة" : "Try again"}</button>}
  </div>;
}
