import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { pickLanguage } from "@/lib/language";
import { ArrowUpRight } from "lucide-react";
import React from "react";
import { Link } from "wouter";
import { SourceNotice } from "@/components/SectionResilience";

export function GovernedProjectControlLink({ tenantId, projectId, compact = false }: { tenantId: string; projectId: string; compact?: boolean }) {
  const { language } = useLanguage();
  const navigation = trpc.navigation.get.useQuery({ tenantId, projectId });
  const controls = navigation.data?.find(item => item.id === "project-controls");
  // A failed lookup is not "you have no access": say so, and let the person retry, instead of the link silently not being there.
  if (navigation.error) return <button type="button" className="text-xs font-semibold text-primary underline" onClick={() => void navigation.refetch()}>{pickLanguage(language, { ar: "تعذّر تحميل الرابط — أعد المحاولة", en: "Could not load the link — try again", ur: "لنک لوڈ نہیں ہو سکا — دوبارہ کوشش کریں" })}</button>;
  if (!controls) return null;
  const label = pickLanguage(language, { ar: "فتح مركز قيادة المشروع", en: "Open project command center", ur: "پروجیکٹ کمانڈ سینٹر کھولیں" });
  return <Link href={controls.href} className={`inline-flex items-center gap-1 font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${compact ? "text-xs" : "text-sm"}`} aria-label={label}>{compact ? pickLanguage(language, { ar: "فتح المشروع", en: "Open project", ur: "پروجیکٹ کھولیں" }) : label}<ArrowUpRight className="h-3.5 w-3.5" /></Link>;
}
