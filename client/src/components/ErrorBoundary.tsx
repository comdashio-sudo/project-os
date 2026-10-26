import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import React, { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * The last line of defence: something failed so badly that no page could be drawn. It shows the person a message in Arabic and English and a
 * way to try again. It never shows the stack or the message of the failure: those are for the engineers, can carry data, and mean nothing to a
 * site engineer. Only the error's name reaches the console. (The provider that knows the chosen language is inside this boundary, so both
 * languages are shown.)
 */
/** The copy of the last-resort screen. It sits above the language provider, so it shows each language in turn: Arabic, English, Urdu. */
const COPY = {
  ar: { title: "حدث خطأ غير متوقع", body: "تعذّر عرض الصفحة. بياناتك لم تتأثر. أعد تحميل الصفحة، وإن تكرر الخطأ فأبلغ فريق الدعم.", reload: "إعادة تحميل الصفحة" },
  en: { title: "An unexpected error occurred", body: "The page could not be shown. Your data was not affected. Reload the page, and if it happens again contact support.", reload: "Reload page" },
  ur: { title: "ایک غیر متوقع خرابی پیش آئی", body: "صفحہ دکھایا نہیں جا سکا۔ آپ کا ڈیٹا متاثر نہیں ہوا۔ صفحہ دوبارہ لوڈ کریں، اور خرابی دوبارہ ہو تو سپورٹ سے رابطہ کریں۔", reload: "صفحہ دوبارہ لوڈ کریں" },
};

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[App] render failed", error.name);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" dir="rtl" className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-xl p-8 text-center">
            <AlertTriangle size={48} className="text-destructive mb-6 flex-shrink-0" />
            <h2 className="text-xl font-semibold mb-2">{COPY.ar.title}</h2>
            <p className="text-sm text-muted-foreground mb-4">{COPY.ar.body}</p>
            <div dir="ltr" className="mb-6 w-full border-t pt-4">
              <h3 className="text-base font-medium mb-1">{COPY.en.title}</h3>
              <p className="text-sm text-muted-foreground">{COPY.en.body}</p>
            </div>
            <div dir="rtl" className="mb-6 w-full border-t pt-4">
              <h3 className="text-base font-medium mb-1">{COPY.ur.title}</h3>
              <p className="text-sm text-muted-foreground">{COPY.ur.body}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              {COPY.ar.reload} · {COPY.en.reload}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
