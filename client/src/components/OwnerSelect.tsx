import React from "react";
import { Select } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";

/** Radix lists carry no empty value: «no owner» is this sentinel, sent to the server as no owner. */
const NONE = "__none";

/**
 * Q-45 (c): pick the owner of a decision or an action from the company's active members — the person in whose «مهامي» it then appears. The list is asked of
 * the server for the chosen project (executive.ownerOptions: whoever may record on that project); with no project chosen yet, nothing is asked.
 */
export function OwnerSelect({ tenantId, projectId, value, onChange, id }: { tenantId: string; projectId: string; value: string; onChange: (membershipId: string) => void; id: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, { ar: { none: "بلا مالك بعد" }, en: { none: "No owner yet" }, ur: { none: "ابھی کوئی مالک نہیں" } });
  const options = trpc.executive.ownerOptions.useQuery({ tenantId, projectId }, { enabled: Boolean(projectId) });
  return <Select id={id} value={value || NONE} disabled={!projectId || options.isLoading} onValueChange={next => onChange(next === NONE ? "" : next)}
    options={[{ value: NONE, label: t.none }, ...(options.data ?? []).map(member => ({ value: member.membershipId, label: member.name ?? member.membershipId }))]} />;
}
