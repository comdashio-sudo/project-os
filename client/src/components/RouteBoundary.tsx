import { useLanguage } from "@/contexts/LanguageContext";
import { type Language, pickLanguage } from "@/lib/language";
import React from "react";
import { Link, useLocation } from "wouter";

// G-100: a page that fails to render is contained to its own route. The rest of the app (navigation, the other
// workspaces) keeps working, and the person is given a way out instead of the app-wide failure screen.
type Props = { children: React.ReactNode; isArabic: boolean; language?: Language; isRtl?: boolean };
type State = { failed: boolean };

class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("[Route] render failed", error.name); } // name only: a message can carry data
  render() {
    if (!this.state.failed) return this.props.children;
    const language = this.props.language ?? (this.props.isArabic ? "ar" : "en");
    const t = pickLanguage(language, {
      ar: { title: "تعذّر عرض هذه الصفحة", body: "حدث خطأ أثناء العرض. بقية المنصة ما زالت تعمل ولم يضع شيء من بياناتك.", retry: "أعد المحاولة", home: "العودة إلى مساحة العمل" },
      en: { title: "This page could not be shown", body: "Something went wrong while rendering it. The rest of the platform still works and none of your data was lost.", retry: "Try again", home: "Back to the workspace" },
      ur: { title: "یہ صفحہ دکھائی نہیں جا سکی", body: "صفحہ دکھاتے وقت کچھ غلط ہو گیا۔ پلیٹ فارم کا باقی حصہ کام کر رہا ہے اور آپ کا کوئی ڈیٹا ضائع نہیں ہوا۔", retry: "دوبارہ کوشش کریں", home: "ورک اسپیس پر واپس جائیں" },
    });
    return (
      <main role="alert" dir={(this.props.isRtl ?? this.props.isArabic) ? "rtl" : "ltr"} className="mx-auto mt-16 max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
        <h1 className="text-lg font-semibold">{t.title}</h1>
        <p className="mt-2 text-sm">{t.body}</p>
        <div className="mt-4 flex gap-3">
          <button type="button" className="min-h-[44px] rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold" onClick={() => this.setState({ failed: false })}>{t.retry}</button>
          <Link href="/" className="inline-flex min-h-[44px] items-center rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold">{t.home}</Link>
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
