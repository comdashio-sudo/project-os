import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEffect, useState } from "react";

/** Shown while the device is offline and the shell was filled from the copy kept on this device (G-100). It says so, with the time, and goes away when the connection returns. */
export function OfflineCopyNotice({ copiedAt }: { copiedAt: number | null }) {
  const { isArabic, isRtl } = useLanguage();
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => {
    const down = () => setOffline(true), up = () => setOffline(false);
    window.addEventListener("offline", down); window.addEventListener("online", up);
    return () => { window.removeEventListener("offline", down); window.removeEventListener("online", up); };
  }, []);
  if (!offline || copiedAt === null) return null;
  const when = new Intl.DateTimeFormat(isArabic ? "ar" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(copiedAt));
  return (
    <p role="status" data-testid="offline-copy-notice" className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900 print:hidden" dir={isRtl ? "rtl" : "ltr"}>
      {isArabic ? `لا يوجد اتصال. ما تراه نسخة محفوظة على هذا الجهاز بتاريخ ${when} وقد تكون قديمة؛ لا يُحفظ أي تغيير حتى يعود الاتصال.` : `You are offline. What you see is the copy kept on this device from ${when} and may be out of date; no change is saved until the connection returns.`}
    </p>
  );
}
