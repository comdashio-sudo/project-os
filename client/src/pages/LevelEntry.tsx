import React from "react";
import { Redirect, useParams } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import { ErrorState, LoadingState, NoPermission } from "@/components/ScreenStates";
import { levelHref } from "@/lib/levels";

// The entry point of the four levels: `/levels/:tenantId` sends the person to the dashboard of their own level (the highest one they hold).
// The server decides it per assignment (`levelReads.entry`, server/levelReads.ts), warehouse keepers included; this page only follows the answer.
// A person with none of the levels is told so in the no-permission sentence, not sent to a 403.

const text = {
  ar: { loading: "جارٍ تحديد مستواك…", noLevelTitle: "لا مستوى مخصص لك في هذه الشركة" },
  en: { loading: "Finding your level…", noLevelTitle: "No level is assigned to you in this company" },
  ur: { loading: "آپ کی سطح تلاش کی جا رہی ہے…", noLevelTitle: "اس کمپنی میں آپ کو کوئی سطح تفویض نہیں کی گئی" },
};

export default function LevelEntry() {
  const { tenantId = "" } = useParams<{ tenantId: string }>();
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, text);
  const entry = trpc.levelReads.entry.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  if (entry.isLoading) return <LoadingState isArabic={isArabic} label={t.loading} />;
  if (entry.error) return <ErrorState isArabic={isArabic} error={entry.error} onRetry={() => entry.refetch()} retrying={entry.isFetching} />;
  if (!entry.data) return <NoPermission isArabic={isArabic} title={t.noLevelTitle} />;
  const target = entry.data;
  return <Redirect to={levelHref(tenantId, target.level, "projectId" in target ? target.projectId : undefined)} />;
}
