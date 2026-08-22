import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight } from "lucide-react";
import React from "react";
import { Link } from "wouter";

export function GovernedProjectControlLink({ tenantId, projectId, compact = false }: { tenantId: string; projectId: string; compact?: boolean }) {
  const { isArabic } = useLanguage();
  const navigation = trpc.navigation.get.useQuery({ tenantId, projectId });
  const controls = navigation.data?.find(item => item.id === "project-controls");
  if (!controls) return null;
  const label = isArabic ? "فتح مركز قيادة المشروع" : "Open project command center";
  return <Link href={controls.href} className={`inline-flex items-center gap-1 font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${compact ? "text-xs" : "text-sm"}`} aria-label={label}>{compact ? (isArabic ? "فتح المشروع" : "Open project") : label}<ArrowUpRight className="h-3.5 w-3.5" /></Link>;
}
