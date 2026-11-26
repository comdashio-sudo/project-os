// Work order 22: the site engineer's update from the phone. One activity, several villas (a list, a range «268-272», or a whole block), one status and its date.
// The server refuses the whole entry before writing anything when one villa is wrong, and says which; the entry is saved under the signed-in account, never a typed e-mail.
import React, { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { Button, Card, CardBody, CardFooter, CardHeader, CardTitle, Field, Segmented, SkeletonRows, TextInput, notify } from "@/components/ds";
import { SearchCombobox, type ComboOption } from "@/components/SearchCombobox";
import { SelectionSummaryNote, VillaPicker, emptyChoice } from "@/components/VillaPicker";
import { summarizeSelection, villasOf, type VillaChoice } from "@/lib/villaPicker";
import { FieldShell } from "@/components/FieldShell";
import { PAGE_NAMES } from "@shared/pageNames";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { WriteGate } from "@/lib/permissions";
import { SourceNotice } from "@/components/SectionResilience";
import { trpc } from "@/lib/trpc";
import { wo22Text } from "@/lib/wo22Text";

const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "DONE", "INSPECTION_REQUESTED", "QC_APPROVED"] as const;
type Status = (typeof STATUSES)[number];
type Mode = "list" | "range" | "block";
type Issue = { code: string; villa?: string; detail?: string };

/** The site's day is Riyadh's (UTC+3), the same day the server checks a date against. */
export function siteTodayInBrowser(now = new Date()): string { return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10); }

/** The refusal's details as the server sent them (errorFormatter → data.issues). */
export function issuesOf(error: unknown): Issue[] {
  const issues = (error as { data?: { issues?: unknown } } | null)?.data?.issues;
  return Array.isArray(issues) ? issues.filter((item): item is Issue => Boolean(item) && typeof (item as Issue).code === "string") : [];
}

export default function PmcSiteUpdate() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language } = useLanguage();
  const t = pickLanguage(language, wo22Text);
  const scope = { tenantId, projectId };
  const activities = trpc.pmcSite.activities.useQuery(scope, { enabled: Boolean(tenantId && projectId) });
  const [activityId, setActivityId] = useState("");
  // Q-67 (5): the villas from the project's own phases, blocks, models and villas (pmc.progressPicker), as in the progress update and the QC receipt; a person
  // who may not read them, or a list that failed, keeps the typed list, range and block below
  const picker = trpc.pmc.progressPicker.useQuery(scope, { enabled: Boolean(tenantId && projectId), retry: false });
  const [choice, setChoice] = useState<VillaChoice>(emptyChoice("block"));
  const usePicker = Boolean(picker.data?.villas.length) && !picker.isError;
  const summary = useMemo(() => summarizeSelection(villasOf(picker.data?.villas ?? [], choice), null, "COMPLETE"), [picker.data?.villas, choice]);
  const [mode, setMode] = useState<Mode>("list");
  const [villas, setVillas] = useState("");
  const [range, setRange] = useState("");
  const [block, setBlock] = useState("");
  const [status, setStatus] = useState<Status>("DONE");
  const [date, setDate] = useState(siteTodayInBrowser());
  const [issues, setIssues] = useState<Issue[]>([]);
  const [recent, setRecent] = useState<Array<{ activity: string; status: Status; date: string; villas: string[] }>>([]);
  const utils = trpc.useUtils();

  // Q-67 (5): one searchable list of the site activities (by name, sub-name or CSI section, or part of a word), grouped by CSI section
  const options = useMemo<ComboOption[]>(() => (activities.data ?? []).map(item => ({ value: item.id, label: item.name, group: item.csiName ?? undefined, description: item.subName ?? undefined, keywords: `${item.subName ?? ""} ${item.csiName ?? ""}` })), [activities.data]);

  const update = trpc.pmcSite.update.useMutation({
    onSuccess: (result, input) => {
      setIssues([]);
      notify.success(t.update.saved(result.updated, result.unchanged));
      const activity = activities.data?.find(item => item.id === input.siteActivityId)?.name ?? "";
      setRecent(list => [{ activity, status: input.status, date: input.date, villas: result.villas }, ...list].slice(0, 5));
      setVillas(""); setRange(""); setChoice(emptyChoice(choice.mode));
      void utils.pmcSite.percentages.invalidate(scope);
    },
    onError: error => { const found = issuesOf(error); setIssues(found); if (!found.length) notify.error(getLocalizedProjectError(error, language)); },
  });

  const submit = () => update.mutate({
    ...scope, siteActivityId: activityId, status, date,
    ...(usePicker ? { villas: summary.applicable } : mode === "list" ? { villas: villas.split(/[,،;\s]+/).filter(Boolean) } : mode === "range" ? { range: range.trim() } : { blockCode: block.trim() }),
  });

  return (
    // Q-36 (step 5): the field screens' one frame (FieldShell) — the title, the way back to the field entry, the ways between the field screens
    <FieldShell title={t.update.title} backHref={`/m/${tenantId}/${projectId}`} backLabel={pickLanguage(language, PAGE_NAMES.fieldEntry)} tenantId={tenantId} projectId={projectId} current="siteUpdate">
      <p className="text-sm text-muted-foreground">{t.update.summary}</p>
      <WriteGate permission="project.pmc.update" projectId={projectId} reason={{ ar: wo22Text.ar.noUpdatePermission, en: wo22Text.en.noUpdatePermission, ur: wo22Text.ur.noUpdatePermission }}>
        <Card>
          <CardBody className="flex flex-col gap-4">
            <SourceNotice query={activities} isArabic={language === "ar"} title={t.update.activity} />
            {activities.isLoading ? <SkeletonRows rows={3} /> : (
              <>
                {/* D-59: no site activities yet — the next step, not a dead «No options»: the import that brings them (the site workbook, PMC → import) */}
                {activities.data && activities.data.length === 0 ? (
                  <div className="flex flex-col gap-2 rounded-[var(--radius)] bg-muted p-3 text-sm" data-empty-next>
                    <p>{t.noActivities}</p>
                    <Link href={`/projects/${tenantId}/${projectId}/pmc?tab=import`} className="inline-flex min-h-11 items-center self-start rounded-[var(--radius)] border bg-card px-3 font-medium text-primary">{t.importSiteFile}</Link>
                  </div>
                ) : null}
                <Field label={t.update.activity} required hint={activities.data && activities.data.length === 0 ? t.noActivities : undefined}>{props => <SearchCombobox id={props.id} data-combobox="activity" aria-describedby={props["aria-describedby"]} options={options} value={activityId} onChange={setActivityId} placeholder={t.update.activity} disabled={activities.data?.length === 0} />}</Field>
              </>
            )}
            {usePicker ? <><VillaPicker data={picker.data!} choice={choice} onChoice={setChoice} /><SelectionSummaryNote summary={summary} /></> : (
              <>
            <Segmented label={t.update.villasMode} value={mode} onValueChange={value => setMode(value as Mode)} options={[{ value: "list", label: t.update.modeList }, { value: "range", label: t.update.modeRange }, { value: "block", label: t.update.modeBlock }]} />
            {mode === "list" && <Field label={t.update.villas} hint={t.update.villasHint} required>{props => <TextInput {...props} inputMode="numeric" dir="ltr" value={villas} onChange={event => setVillas(event.target.value)} />}</Field>}
            {mode === "range" && <Field label={t.update.range} hint={t.update.rangeHint} required>{props => <TextInput {...props} inputMode="numeric" dir="ltr" value={range} onChange={event => setRange(event.target.value)} />}</Field>}
            {mode === "block" && <Field label={t.update.block} required>{props => <TextInput {...props} dir="ltr" value={block} onChange={event => setBlock(event.target.value)} />}</Field>}
              </>
            )}
            <Segmented label={t.update.status} value={status} onValueChange={value => setStatus(value as Status)} layout="grid" options={STATUSES.map(value => ({ value, label: t.statuses[value] }))} />
            <Field label={t.update.date} required>{props => <TextInput {...props} type="date" dir="ltr" max={siteTodayInBrowser()} value={date} onChange={event => setDate(event.target.value)} />}</Field>
            {issues.length > 0 && (
              <div role="alert" className="rounded-md border border-destructive p-3 text-sm">
                <p className="font-semibold text-destructive">{t.update.issuesTitle}</p>
                <ul className="mt-2 list-disc ps-5">{issues.map((issue, index) => <li key={`${issue.code}-${issue.villa ?? ""}-${index}`}>{(t.issues[issue.code] ?? (() => issue.code))(issue.villa, issue.detail)}</li>)}</ul>
              </div>
            )}
          </CardBody>
          <CardFooter><Button size="lg" className="w-full" loading={update.isPending} disabled={!activityId || (usePicker && !summary.applicable.length)} onClick={submit}>{t.update.save}</Button></CardFooter>
        </Card>
      </WriteGate>
      {recent.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t.update.recent}</CardTitle></CardHeader>
          <CardBody><ul className="flex flex-col gap-2 text-sm">{recent.map((item, index) => <li key={index}><span className="font-medium">{item.activity}</span> — {t.statuses[item.status]} · <span dir="ltr">{item.date}</span> · <span dir="ltr">{item.villas.join(", ")}</span></li>)}</ul></CardBody>
        </Card>
      )}
    </FieldShell>
  );
}
