import { useLanguage } from "@/contexts/LanguageContext";
import { type Language, pickLanguage, resolveLanguage } from "@/lib/language";
import React from "react";
import { Link, useLocation } from "wouter";
import { isChunkLoadError, reloadOnceForNewRelease } from "@/lib/chunkReload";

// G-100: a page that fails to render is contained to its own route. The rest of the app (navigation, the other
// workspaces) keeps working, and the person is given a way out instead of the app-wide failure screen.
type Props = { children: React.ReactNode; isArabic: boolean; language?: Language; isRtl?: boolean };
type State = { failed: boolean; code: string; updating: boolean };

// Q-56 (7): a short code the person can read out; the same code is in the server's log, so a report «I saw R-7KQ2M» finds its line.
// Letters and digits without the ones read alike (0/O, 1/I/L); never six digits in a row, which the log would take for a sign-in code.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function failureCode(random: () => number = Math.random): string {
  return `R-${Array.from({ length: 5 }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join("")}`;
}

/** Tells the server which page failed and how, by name only: an error's message can carry data, so it never leaves the browser. */
export function reportRenderFailure(report: { code: string; errorName: string; route: string; chunk: boolean }, send: typeof fetch = fetch) {
  const input = { code: report.code, errorName: report.errorName.replace(/[^A-Za-z]/g, "").slice(0, 60) || "Error", route: report.route.split(/[?#]/)[0].slice(0, 200), chunk: report.chunk };
  return send("/api/trpc/diagnostics.renderFailed", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: input }) }).catch(() => undefined);
}

class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false, code: "", updating: false };
  static getDerivedStateFromError(): Partial<State> { return { failed: true, code: failureCode() }; }
  componentDidCatch(error: Error) {
    const chunk = isChunkLoadError(error);
    console.error("[Route] render failed", error.name, this.state.code); // name only: a message can carry data
    void reportRenderFailure({ code: this.state.code, errorName: error.name, route: typeof window === "undefined" ? "" : window.location.pathname, chunk });
    // a page opened before a new release asks for a file the release removed: the new release, once, instead of the error screen
    if (chunk && reloadOnceForNewRelease()) this.setState({ updating: true });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.state.updating) {
      const u = pickLanguage(this.props.language ?? resolveLanguage(this.props.isArabic), { ar: "صدر تحديث للمنصة، جارٍ التحديث…", en: "A new version of the platform was released; updating…", ur: "پلیٹ فارم کا نیا ورژن جاری ہوا ہے؛ اپ ڈیٹ ہو رہا ہے…" });
      return <main role="status" data-release-reload="" dir={(this.props.isRtl ?? this.props.isArabic) ? "rtl" : "ltr"} className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-card p-6 text-sm">{u}</main>;
    }
    const language = this.props.language ?? resolveLanguage(this.props.isArabic);
    const t = pickLanguage(language, {
      ar: { title: "تعذّر عرض هذه الصفحة", body: "حدث خطأ أثناء العرض. بقية المنصة ما زالت تعمل ولم يضع شيء من بياناتك.", retry: "أعد المحاولة", home: "العودة إلى مساحة العمل", code: "رمز الخطأ للدعم:" },
      en: { title: "This page could not be shown", body: "Something went wrong while rendering it. The rest of the platform still works and none of your data was lost.", retry: "Try again", home: "Back to the workspace", code: "Error code for support:" },
      ur: { title: "یہ صفحہ دکھائی نہیں جا سکی", body: "صفحہ دکھاتے وقت کچھ غلط ہو گیا۔ پلیٹ فارم کا باقی حصہ کام کر رہا ہے اور آپ کا کوئی ڈیٹا ضائع نہیں ہوا۔", retry: "دوبارہ کوشش کریں", home: "ورک اسپیس پر واپس جائیں", code: "سپورٹ کے لیے خرابی کا کوڈ:" },
    });
    return (
      <main role="alert" dir={(this.props.isRtl ?? this.props.isArabic) ? "rtl" : "ltr"} className="mx-auto mt-16 max-w-md rounded-2xl border border-destructive/30 bg-danger-soft p-6 text-danger-soft-foreground">
        <h1 className="text-lg font-semibold">{t.title}</h1>
        <p className="mt-2 text-sm">{t.body}</p>
        <p className="mt-2 text-xs">{t.code} <bdi dir="ltr" data-failure-code="" className="font-mono font-semibold">{this.state.code}</bdi></p>
        <div className="mt-4 flex gap-3">
          <button type="button" className="min-h-[44px] rounded-lg border border-destructive/30 bg-white px-4 text-sm font-semibold" onClick={() => this.setState({ failed: false, code: "", updating: false })}>{t.retry}</button>
          <Link href="/" className="inline-flex min-h-[44px] items-center rounded-lg border border-destructive/30 bg-white px-4 text-sm font-semibold">{t.home}</Link>
        </div>
      </main>
    );
  }
}

/** Keyed by the location so moving to another page always starts clean. */
export function RouteBoundary({ children }: { children: React.ReactNode }) {
  const { isArabic, isRtl, language } = useLanguage();
  const [location] = useLocation();
  return <RouteErrorBoundary key={location} isArabic={isArabic} isRtl={isRtl} language={language}>{children}</RouteErrorBoundary>;
}
