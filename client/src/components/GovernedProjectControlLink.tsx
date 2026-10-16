import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight } from "lucide-react";
import React from "react";
import { Link } from "wouter";
import { SourceNotice } from "@/components/SectionResilience";

export function GovernedProjectControlLink({ tenantId, projectId, compact = false }: { tenantId: string; projectId: string; compact?: boolean }) {
  const { isArabic } = useLanguage();
  const navigation = trpc.navigation.get.useQuery({ tenantId, projectId });
  const controls = navigation.data?.find(item => item.id === "project-controls");
  // A failed lookup is not "you have no access": say so, and let the person retry, instead of the link silently not being there.
  if (navigation.error) return <button type="button" className="text-xs font-semibold text-primary underline" onClick={() => void navigation.refetch()}>{isArabic ? "تعذّر تحميل الرابط — أعد المحاولة" : "Could not load the link — try again"}</button>;
  if (!controls) return null;
  const label = isArabic ? "فتح مركز قيادة المشروع" : "Open project command center";
  return <Link href={controls.href} className={`inline-flex items-center gap-1 font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${compact ? "text-xs" : "text-sm"}`} aria-label={label}>{compact ? (isArabic ? "فتح المشروع" : "Open project") : label}<ArrowUpRight className="h-3.5 w-3.5" /></Link>;
}
