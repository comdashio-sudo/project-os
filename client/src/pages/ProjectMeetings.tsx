// Q-25 (P-114): the project's meetings and their minutes. The list (newest first, with how many of each meeting's actions are still open); a new meeting
// (type, title, when, where, the previous meeting of the series, attendees one per line «name — organisation»); and the chosen meeting: who attended, the
// minutes item by item, the actions it raised (each with an owner, who then sees it in «مهامي»), the open actions brought forward from earlier meetings,
// and «Issue the minutes» — final from then on. «Print» gives the minutes as a page (Word/PDF export: next batch). Every rule is the server's
// (server/meetings.ts); the forms here are shown only to whoever may record the project's decisions.
import React, { useState } from "react";
import { useParams } from "wouter";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Select, TextInput } from "@/components/ds";
import { formatDate } from "@/components/ds/format";
import { OwnerSelect } from "@/components/OwnerSelect";
import { PageHeader, PageMain } from "@/components/pageFrame";
import { SectionErrorBoundary, SourceNotice } from "@/components/SectionResilience";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage, type Language } from "@/lib/language";
import { WriteGate } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { PAGE_NAMES } from "@shared/pageNames";

const TYPES = ["progress", "coordination", "safety", "client", "design", "other"] as const;
type MeetingType = (typeof TYPES)[number];
const RECORDERS = ["project.manage", "pmo.write", "tenant.manage"] as const;
const NONE = "__none";
const text = {
  ar: { intro: "اجتماعات المشروع ومحاضرها: الحضور، والبنود، والمهام بمالكها وموعدها. المهام المفتوحة من الاجتماعات السابقة تُرحَّل وحدها.", list: "الاجتماعات", none: "لا اجتماعات بعد.", open: "مهام مفتوحة", draft: "مسودة", issued: "صادر", add: "اجتماع جديد", type: "النوع", title: "العنوان", heldAt: "التاريخ والوقت", location: "المكان", previous: "الاجتماع السابق في السلسلة", noPrevious: "لا شيء", attendees: "الحضور (سطر لكل شخص: الاسم — الجهة)", create: "إنشاء", attended: "الحضور", items: "بنود المحضر", noItems: "لا بنود بعد.", topic: "الموضوع", discussion: "النقاش", decision: "القرار", addItem: "أضف بندًا", actions: "المهام", noActions: "لا مهام.", action: "المهمة", owner: "المالك", due: "الموعد", priority: "الأولوية", addAction: "أضف مهمة", forward: "مرحّلة من اجتماعات سابقة (مفتوحة)", noForward: "لا مهام مفتوحة مرحّلة.", issue: "أصدر المحضر", issueNote: "بعد الإصدار لا يُضاف بند ولا مهمة.", print: "اطبع المحضر", choose: "اختر اجتماعًا من القائمة.", noDate: "بلا موعد", types: { progress: "متابعة التقدم", coordination: "تنسيق", safety: "سلامة", client: "مع المالك", design: "تصميم", other: "آخر" }, priorities: { low: "منخفضة", medium: "متوسطة", high: "عالية", critical: "حرجة" }, statuses: { open: "مفتوحة", in_progress: "جارية", completed: "منجزة", cancelled: "ملغاة" } },
  en: { intro: "The project's meetings and their minutes: who attended, the items, and the actions with an owner and a due date. Only the open actions of earlier meetings are brought forward.", list: "Meetings", none: "No meeting yet.", open: "open actions", draft: "Draft", issued: "Issued", add: "New meeting", type: "Type", title: "Title", heldAt: "Date and time", location: "Place", previous: "Previous meeting of the series", noPrevious: "None", attendees: "Attendees (one per line: name — organisation)", create: "Create", attended: "Attended", items: "Minutes", noItems: "No item yet.", topic: "Topic", discussion: "Discussion", decision: "Decision", addItem: "Add an item", actions: "Actions", noActions: "No action.", action: "Action", owner: "Owner", due: "Due", priority: "Priority", addAction: "Add an action", forward: "Brought forward from earlier meetings (open)", noForward: "No open action brought forward.", issue: "Issue the minutes", issueNote: "After issuing, no item or action is added.", print: "Print the minutes", choose: "Choose a meeting from the list.", noDate: "No date", types: { progress: "Progress", coordination: "Coordination", safety: "Safety", client: "With the client", design: "Design", other: "Other" }, priorities: { low: "Low", medium: "Medium", high: "High", critical: "Critical" }, statuses: { open: "Open", in_progress: "In progress", completed: "Done", cancelled: "Cancelled" } },
  ur: { intro: "پروجیکٹ کی میٹنگز اور ان کی کارروائی: حاضرین، نکات، اور مالک و تاریخ کے ساتھ کام۔ پچھلی میٹنگز کے صرف کھلے کام آگے لائے جاتے ہیں۔", list: "میٹنگز", none: "ابھی کوئی میٹنگ نہیں۔", open: "کھلے کام", draft: "مسودہ", issued: "جاری شدہ", add: "نئی میٹنگ", type: "قسم", title: "عنوان", heldAt: "تاریخ اور وقت", location: "جگہ", previous: "سلسلے کی پچھلی میٹنگ", noPrevious: "کوئی نہیں", attendees: "حاضرین (ہر سطر ایک شخص: نام — ادارہ)", create: "بنائیں", attended: "حاضرین", items: "کارروائی", noItems: "ابھی کوئی نکتہ نہیں۔", topic: "موضوع", discussion: "بحث", decision: "فیصلہ", addItem: "نکتہ شامل کریں", actions: "کام", noActions: "کوئی کام نہیں۔", action: "کام", owner: "مالک", due: "مقررہ تاریخ", priority: "ترجیح", addAction: "کام شامل کریں", forward: "پچھلی میٹنگز سے آگے لائے گئے (کھلے)", noForward: "کوئی کھلا کام آگے نہیں لایا گیا۔", issue: "کارروائی جاری کریں", issueNote: "جاری کرنے کے بعد کوئی نکتہ یا کام شامل نہیں ہوتا۔", print: "کارروائی پرنٹ کریں", choose: "فہرست سے میٹنگ منتخب کریں۔", noDate: "کوئی تاریخ نہیں", types: { progress: "پیش رفت", coordination: "رابطہ کاری", safety: "حفاظت", client: "مالک کے ساتھ", design: "ڈیزائن", other: "دیگر" }, priorities: { low: "کم", medium: "درمیانی", high: "زیادہ", critical: "نازک" }, statuses: { open: "کھلا", in_progress: "جاری", completed: "مکمل", cancelled: "منسوخ" } },
};
type T = (typeof text)["en"];

/** «Name — Organisation» per line (an en dash, a hyphen or a comma separates them); empty lines are skipped. */
export function parseAttendees(value: string) {
  return value.split("\n").map(line => line.trim()).filter(Boolean).map(line => { const [name, ...rest] = line.split(/\s+[—–-]\s+|,\s*/); return { name: name.trim().slice(0, 160), organisation: rest.join(" ").trim().slice(0, 160) || undefined }; });
}

export default function ProjectMeetings() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language, isArabic } = useLanguage();
  const t = pickLanguage(language, text);
  const title = pickLanguage(language, PAGE_NAMES.meetings);
  const scope = { tenantId, projectId };
  const list = trpc.meetings.list.useQuery(scope, { enabled: Boolean(tenantId && projectId) });
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen ?? list.data?.[0]?.id ?? null;
  return (
    <PageMain className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      <PageHeader className="print:hidden"><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{t.intro}</p></PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4 print:hidden">
          <SectionErrorBoundary title={t.list} isArabic={isArabic}>
            <Card>
              <CardHeader><CardTitle>{t.list}</CardTitle></CardHeader>
              <CardBody className="flex flex-col gap-2">
                <SourceNotice query={list} isArabic={isArabic} title={t.list} />
                {list.data && list.data.length === 0 ? <p className="text-sm text-muted-foreground">{t.none}</p> : null}
                <ul className="flex flex-col gap-2" data-meetings>{(list.data ?? []).map(meeting => (
                  <li key={meeting.id}><button type="button" onClick={() => setChosen(meeting.id)} aria-current={meeting.id === selected ? "true" : undefined}
                    className={`flex min-h-11 w-full flex-col items-start gap-1 rounded-md border px-3 py-2 text-start text-sm ${meeting.id === selected ? "border-primary bg-primary/5" : "border-border"}`}>
                    <span className="font-medium">{meeting.title}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{formatDate(new Date(meeting.heldAt), language)} · {t.types[meeting.meetingType as MeetingType] ?? meeting.meetingType}
                      <Badge tone={meeting.status === "issued" ? "success" : "neutral"}>{meeting.status === "issued" ? t.issued : t.draft}</Badge>
                      {meeting.openActions > 0 ? <Badge tone="warning"><bdi dir="ltr">{meeting.openActions}</bdi> {t.open}</Badge> : null}</span>
                  </button></li>
                ))}</ul>
              </CardBody>
            </Card>
          </SectionErrorBoundary>
          <WriteGate permission={RECORDERS} projectId={projectId}><NewMeeting t={t} tenantId={tenantId} projectId={projectId} previous={(list.data ?? []).map(meeting => ({ value: meeting.id, label: meeting.title }))} onCreated={id => { setChosen(id); void list.refetch(); }} language={language} /></WriteGate>
        </div>
        <SectionErrorBoundary title={t.items} isArabic={isArabic}>
          {selected ? <MeetingDetail key={selected} t={t} tenantId={tenantId} projectId={projectId} meetingId={selected} onChanged={() => void list.refetch()} language={language} isArabic={isArabic} /> : <p className="text-sm text-muted-foreground">{t.choose}</p>}
        </SectionErrorBoundary>
      </div>
    </PageMain>
  );
}

function NewMeeting({ t, tenantId, projectId, previous, onCreated, language }: { t: T; tenantId: string; projectId: string; previous: Array<{ value: string; label: string }>; onCreated: (id: string) => void; language: Language }) {
  const [form, setForm] = useState({ meetingType: "progress" as MeetingType, title: "", heldAt: "", location: "", previousMeetingId: NONE, attendees: "" });
  const create = trpc.meetings.create.useMutation({ onSuccess: result => { setForm({ ...form, title: "", attendees: "" }); onCreated(result.id); } });
  return (
    <Card data-new-meeting>
      <CardHeader><CardTitle>{t.add}</CardTitle></CardHeader>
      <CardBody className="flex flex-col gap-3">
        <Field label={t.type}>{props => <Select id={props.id} value={form.meetingType} onValueChange={value => setForm({ ...form, meetingType: value as MeetingType })} options={TYPES.map(value => ({ value, label: t.types[value] }))} />}</Field>
        <Field label={t.title} required>{props => <TextInput {...props} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} />}</Field>
        <Field label={t.heldAt} required>{props => <TextInput {...props} type="datetime-local" dir="ltr" value={form.heldAt} onChange={event => setForm({ ...form, heldAt: event.target.value })} />}</Field>
        <Field label={t.location} optional>{props => <TextInput {...props} value={form.location} onChange={event => setForm({ ...form, location: event.target.value })} />}</Field>
        <Field label={t.previous} optional>{props => <Select id={props.id} value={form.previousMeetingId} onValueChange={value => setForm({ ...form, previousMeetingId: value })} options={[{ value: NONE, label: t.noPrevious }, ...previous]} />}</Field>
        <label className="grid gap-1 text-sm"><span>{t.attendees}</span><Textarea value={form.attendees} rows={4} onChange={event => setForm({ ...form, attendees: event.target.value })} /></label>
        {create.error ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(create.error, language)}</p> : null}
        <Button className="min-h-11" disabled={create.isPending || form.title.trim().length < 2 || !form.heldAt}
          onClick={() => create.mutate({ tenantId, projectId, meetingType: form.meetingType, title: form.title.trim(), heldAt: new Date(form.heldAt), location: form.location.trim() || undefined, previousMeetingId: form.previousMeetingId === NONE ? undefined : form.previousMeetingId, attendees: parseAttendees(form.attendees) })}>{t.create}</Button>
      </CardBody>
    </Card>
  );
}

function MeetingDetail({ t, tenantId, projectId, meetingId, onChanged, language, isArabic }: { t: T; tenantId: string; projectId: string; meetingId: string; onChanged: () => void; language: Language; isArabic: boolean }) {
  const scope = { tenantId, projectId, meetingId };
  const detail = trpc.meetings.get.useQuery(scope);
  const refresh = () => { void detail.refetch(); onChanged(); };
  const addItem = trpc.meetings.addItem.useMutation({ onSuccess: () => { setItem({ topic: "", discussion: "", decision: "" }); refresh(); } });
  const addAction = trpc.meetings.addAction.useMutation({ onSuccess: () => { setAction({ ...action, title: "", dueAt: "" }); refresh(); } });
  const issue = trpc.meetings.issue.useMutation({ onSuccess: refresh });
  const [item, setItem] = useState({ topic: "", discussion: "", decision: "" });
  const [action, setAction] = useState({ title: "", owner: "", dueAt: "", priority: "medium" as "low" | "medium" | "high" | "critical" });
  const failure = addItem.error ?? addAction.error ?? issue.error;
  if (!detail.data) return <SourceNotice query={detail} isArabic={isArabic} title={t.items} />;
  const { meeting, attendees, items, actions, broughtForward } = detail.data;
  const draft = meeting.status === "draft";
  const actionRow = (row: (typeof actions)[number]) => <li key={row.id} className="flex flex-wrap justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"><span className="font-medium">{row.title}</span><span className="text-muted-foreground">{row.ownerName ?? "—"} · {row.dueAt ? formatDate(new Date(row.dueAt), language) : t.noDate} · {t.priorities[row.priority as keyof T["priorities"]] ?? row.priority} · {t.statuses[row.status as keyof T["statuses"]] ?? row.status}</span></li>;
  return (
    <Card data-meeting={meeting.id}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div><CardTitle>{meeting.title}</CardTitle><p className="text-sm text-muted-foreground">{t.types[meeting.meetingType as MeetingType] ?? meeting.meetingType} · {formatDate(new Date(meeting.heldAt), language)}{meeting.location ? ` · ${meeting.location}` : ""}</p></div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Badge tone={draft ? "neutral" : "success"}>{draft ? t.draft : t.issued}</Badge>
          <Button variant="secondary" className="min-h-11" onClick={() => window.print()}>{t.print}</Button>
          {draft ? <WriteGate permission={RECORDERS} projectId={projectId}><Button className="min-h-11" disabled={issue.isPending} title={t.issueNote} onClick={() => issue.mutate(scope)}>{t.issue}</Button></WriteGate> : null}
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-5">
        {failure ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(failure, language)}</p> : null}
        <section><h3 className="mb-2 text-sm font-semibold">{t.attended}</h3><p className="text-sm" data-attendees>{attendees.length ? attendees.map(person => person.organisation ? `${person.name} (${person.organisation})` : person.name).join("، ") : "—"}</p></section>
        <section>
          <h3 className="mb-2 text-sm font-semibold">{t.items}</h3>
          {items.length === 0 ? <p className="text-sm text-muted-foreground">{t.noItems}</p> : (
            <ol className="flex flex-col gap-2" data-items>{items.map(row => <li key={row.id} className="rounded-md border border-border px-3 py-2 text-sm"><p className="font-medium"><bdi dir="ltr">{row.itemNumber}.</bdi> {row.topic}</p>{row.discussion ? <p className="text-muted-foreground">{row.discussion}</p> : null}{row.decision ? <p><span className="font-semibold">{t.decision}: </span>{row.decision}</p> : null}</li>)}</ol>
          )}
          {draft ? <WriteGate permission={RECORDERS} projectId={projectId}><div className="mt-3 grid gap-2 print:hidden" data-add-item>
            <Field label={t.topic} required>{props => <TextInput {...props} value={item.topic} onChange={event => setItem({ ...item, topic: event.target.value })} />}</Field>
            <label className="grid gap-1 text-sm"><span>{t.discussion}</span><Textarea value={item.discussion} rows={2} onChange={event => setItem({ ...item, discussion: event.target.value })} /></label>
            <label className="grid gap-1 text-sm"><span>{t.decision}</span><Textarea value={item.decision} rows={2} onChange={event => setItem({ ...item, decision: event.target.value })} /></label>
            <Button variant="secondary" className="min-h-11 justify-self-start" disabled={addItem.isPending || !item.topic.trim()} onClick={() => addItem.mutate({ ...scope, topic: item.topic.trim(), discussion: item.discussion.trim() || undefined, decision: item.decision.trim() || undefined })}>{t.addItem}</Button>
          </div></WriteGate> : null}
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold">{t.actions}</h3>
          {actions.length === 0 ? <p className="text-sm text-muted-foreground">{t.noActions}</p> : <ul className="flex flex-col gap-2" data-actions>{actions.map(actionRow)}</ul>}
          {draft ? <WriteGate permission={RECORDERS} projectId={projectId}><div className="mt-3 grid gap-2 md:grid-cols-2 print:hidden" data-add-action>
            <Field label={t.action} required>{props => <TextInput {...props} value={action.title} onChange={event => setAction({ ...action, title: event.target.value })} />}</Field>
            <Field label={t.owner} required>{props => <OwnerSelect id={props.id} tenantId={tenantId} projectId={projectId} value={action.owner} onChange={owner => setAction({ ...action, owner })} />}</Field>
            <Field label={t.due} optional>{props => <TextInput {...props} type="date" dir="ltr" value={action.dueAt} onChange={event => setAction({ ...action, dueAt: event.target.value })} />}</Field>
            <Field label={t.priority}>{props => <Select id={props.id} value={action.priority} onValueChange={value => setAction({ ...action, priority: value as typeof action.priority })} options={(["low", "medium", "high", "critical"] as const).map(value => ({ value, label: t.priorities[value] }))} />}</Field>
            <Button variant="secondary" className="min-h-11 justify-self-start" disabled={addAction.isPending || action.title.trim().length < 2 || !action.owner} onClick={() => addAction.mutate({ ...scope, title: action.title.trim(), ownerMembershipId: action.owner, dueAt: action.dueAt ? new Date(`${action.dueAt}T00:00:00Z`) : undefined, priority: action.priority })}>{t.addAction}</Button>
          </div></WriteGate> : null}
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold">{t.forward}</h3>
          {broughtForward.length === 0 ? <p className="text-sm text-muted-foreground">{t.noForward}</p> : <ul className="flex flex-col gap-2" data-brought-forward>{broughtForward.map(actionRow)}</ul>}
        </section>
      </CardBody>
    </Card>
  );
}
