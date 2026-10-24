import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { BellRing } from "lucide-react";
import React from "react";
import { SourceNotice } from "@/components/SectionResilience";
import { pickLanguage } from "@/lib/language";

const labels = {
  PROJECT_HEALTH_EXCEPTION: { ar: "استثناء في صحة المشروع", en: "Project-health exception", ur: "Project-health exception" },
  FIELD_REPORT_REVIEWED: { ar: "قرار مراجعة تقرير ميداني", en: "Field-report review decision", ur: "Field-report review decision" },
  SUPPORT_TICKET_ESCALATED: { ar: "تذكرة دعم تحتاج متابعتك", en: "A support ticket needs you", ur: "A support ticket needs you" },
} as const;

function fieldReportOutcome(payload: string, isArabic: boolean) {
  try {
    const value = JSON.parse(payload) as { reportNumber?: string; status?: string };
    if (value.status !== "approved" && value.status !== "rejected") return null;
    const number = value.reportNumber ? ` ${value.reportNumber}` : "";
    return isArabic ? `${value.status === "approved" ? "تم اعتماد" : "تم رفض"} التقرير الميداني${number}` : `Field report${number} ${value.status === "approved" ? "approved" : "rejected"}`;
  } catch { return null; }
}

export function ProjectNotifications({ tenantId }: { tenantId: string }) {
  const { isArabic, language } = useLanguage();
  const list = trpc.notifications.list.useQuery({ tenantId });
  const acknowledge = trpc.notifications.acknowledge.useMutation({ onSuccess: () => list.refetch() });
  const prefs = trpc.notifications.emailPreferences.useQuery({ tenantId });
  const setPref = trpc.notifications.setEmailPreference.useMutation({ onSuccess: () => prefs.refetch() });
  const error = list.error ?? acknowledge.error ?? setPref.error;
  const t = pickLanguage(language, { ar: { title: "إشعاراتي", empty: "لا توجد إشعارات داخلية جديدة.", acknowledge: "إقرار", acknowledged: "تم الإقرار", mailTitle: "إشعارات البريد", mailOff: "إشعارات البريد غير مفعّلة بعد في هذه المنصة؛ تبقى الإشعارات داخل المنصة. اختياراتك محفوظة وتسري عند التفعيل.", support_escalation: "تصعيد طلبات الدعم", approvals_waiting: "ما ينتظر اعتمادي (مرة يوميًا)", daily_digest: "الملخص اليومي لمشاريعي" }, en: { title: "My notifications", empty: "There are no new internal notifications.", acknowledge: "Acknowledge", acknowledged: "Acknowledged", mailTitle: "E-mail notifications", mailOff: "E-mail notifications are not switched on yet on this platform; in-app notifications continue. Your choices are saved and apply once they are.", support_escalation: "Support escalations", approvals_waiting: "What is waiting for my approval (once a day)", daily_digest: "Daily summary of my projects" }, ur: { title: "My notifications", empty: "There are no new internal notifications.", acknowledge: "Acknowledge", acknowledged: "Acknowledged", mailTitle: "E-mail notifications", mailOff: "E-mail notifications are not switched on yet on this platform; in-app notifications continue. Your choices are saved and apply once they are.", support_escalation: "Support escalations", approvals_waiting: "What is waiting for my approval (once a day)", daily_digest: "Daily summary of my projects" } });
  if (list.isLoading) return null;
  if (!list.data) return <p className="text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>;
  return <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><div className="flex items-center gap-3"><BellRing className="text-amber-700" /><h2 className="font-semibold">{t.title}</h2></div>{error && <p role="alert" className="mt-3 text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>}{list.data.length ? <div className="mt-4 space-y-3">{list.data.map(item => { const label = labels[item.notificationCode as keyof typeof labels]; const outcome = item.notificationCode === "FIELD_REPORT_REVIEWED" ? fieldReportOutcome(item.payload, isArabic) : null; return <div key={item.id} className="rounded-xl bg-slate-50 p-3"><p className="font-medium">{outcome ?? (label ? label[isArabic ? "ar" : "en"] : (isArabic ? "إشعار تشغيلي" : "Operational notification"))}</p><p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString(isArabic ? "ar" : "en")}</p>{item.acknowledgedAt ? <p className="mt-2 text-sm text-emerald-700">{t.acknowledged}</p> : <Button size="sm" className="mt-2" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate({ tenantId, notificationId: item.id })}>{t.acknowledge}</Button>}</div>; })}</div> : <p className="mt-4 text-sm text-slate-500">{t.empty}</p>}<SourceNotice query={prefs} isArabic={isArabic} className="mt-6" title={isArabic ? "تفضيلات إشعارات البريد" : "E-mail notification preferences"} fallback={isArabic ? "إشعاراتك داخل المنصة تعمل كالمعتاد." : "Your in-app notifications work as usual."} />{prefs.data && <div className="mt-6 border-t pt-4" aria-label={t.mailTitle}><h3 className="text-sm font-semibold">{t.mailTitle}</h3>{!prefs.data.active && <p className="mt-1 text-xs text-slate-500">{t.mailOff}</p>}<ul className="mt-2 space-y-1">{(["support_escalation", "approvals_waiting", "daily_digest"] as const).map(kind => <li key={kind}><label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" aria-label={t[kind]} checked={prefs.data.preferences[kind]} disabled={setPref.isPending} onChange={event => setPref.mutate({ tenantId, kind, enabled: event.target.checked })} />{t[kind]}</label></li>)}</ul></div>}</section>;
}
