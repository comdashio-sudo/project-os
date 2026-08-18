import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { BellRing } from "lucide-react";
import React from "react";

const labels = {
  PROJECT_HEALTH_EXCEPTION: { ar: "استثناء في صحة المشروع", en: "Project-health exception" },
} as const;

export function ProjectNotifications({ tenantId }: { tenantId: string }) {
  const { isArabic } = useLanguage();
  const list = trpc.notifications.list.useQuery({ tenantId });
  const acknowledge = trpc.notifications.acknowledge.useMutation({ onSuccess: () => list.refetch() });
  const error = list.error ?? acknowledge.error;
  const t = isArabic ? { title: "إشعاراتي", empty: "لا توجد إشعارات داخلية جديدة.", acknowledge: "إقرار", acknowledged: "تم الإقرار" } : { title: "My notifications", empty: "There are no new internal notifications.", acknowledge: "Acknowledge", acknowledged: "Acknowledged" };
  if (list.isLoading) return null;
  if (!list.data) return <p className="text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>;
  return <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><div className="flex items-center gap-3"><BellRing className="text-amber-700" /><h2 className="font-semibold">{t.title}</h2></div>{error && <p role="alert" className="mt-3 text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>}{list.data.length ? <div className="mt-4 space-y-3">{list.data.map(item => { const label = labels[item.notificationCode as keyof typeof labels]; return <div key={item.id} className="rounded-xl bg-slate-50 p-3"><p className="font-medium">{label ? label[isArabic ? "ar" : "en"] : (isArabic ? "إشعار تشغيلي" : "Operational notification")}</p><p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString(isArabic ? "ar" : "en")}</p>{item.acknowledgedAt ? <p className="mt-2 text-sm text-emerald-700">{t.acknowledged}</p> : <Button size="sm" className="mt-2" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate({ tenantId, notificationId: item.id })}>{t.acknowledge}</Button>}</div>; })}</div> : <p className="mt-4 text-sm text-slate-500">{t.empty}</p>}</section>;
}
