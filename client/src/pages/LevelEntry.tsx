import React from "react";
import { Redirect, useParams } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { ErrorState, LoadingState, NoPermission, isRefusal } from "@/components/ScreenStates";
import { levelHref, pickEntryLevel } from "@/lib/levels";

// The entry point of the four levels: `/levels/:tenantId` sends the person to the dashboard of their own level (the highest one they
// hold). The rule itself is `pickEntryLevel`; this page only reads the server's navigation and the projects the person may see.
// A person with none of the levels is told so in the no-permission sentence, not sent to a 403.

const text = {
  ar: { loading: "جارٍ تحديد مستواك…", noLevelTitle: "لا مستوى مخصص لك في هذه الشركة" },
  en: { loading: "Finding your level…", noLevelTitle: "No level is assigned to you in this company" },
};

export default function LevelEntry() {
  const { tenantId = "" } = useParams<{ tenantId: string }>();
  const { isArabic } = useLanguage();
  const t = isArabic ? text.ar : text.en;
  const navigation = trpc.navigation.get.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const projects = trpc.projects.list.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  if (navigation.isLoading || projects.isLoading) return <LoadingState isArabic={isArabic} label={t.loading} />;
  if (navigation.error) return <ErrorState isArabic={isArabic} error={navigation.error} onRetry={() => navigation.refetch()} retrying={navigation.isFetching} />;
  // A person without project.read is refused the project list: that is "no project level", not an error to show.
  if (projects.error && !isRefusal(projects.error)) return <ErrorState isArabic={isArabic} error={projects.error} onRetry={() => projects.refetch()} retrying={projects.isFetching} />;
  const target = pickEntryLevel({
    navigationIds: (navigation.data ?? []).map(item => item.id),
    projects: projects.error ? [] : (projects.data ?? []).map(item => ({ id: item.id, code: item.code })),
  });
  if (!target) return <NoPermission isArabic={isArabic} title={t.noLevelTitle} />;
  return <Redirect to={target.level === "project" ? levelHref(tenantId, "project", target.projectId) : levelHref(tenantId, target.level)} />;
}
