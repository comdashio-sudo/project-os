import React from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";

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

  render() {
    if (this.state.failed) {
      return <SectionMessage title={this.props.title} isArabic={this.props.isArabic} kind="error" />;
    }
    return this.props.children;
  }
}

export function SectionMessage({ title, isArabic, kind, detail }: { title: string; isArabic: boolean; kind: "loading" | "empty" | "error" | "partial"; detail?: string }) {
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
      <div><p className="font-semibold">{title}</p><p className="mt-1">{detail ?? copy[kind]}</p></div>
    </div>
  </section>;
}
