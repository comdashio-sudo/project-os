// Technical and architectural coordination of the design phase (work order 5, item 7): the board, the drawing register with revisions,
// transmittals, review comments and the consultant submittals with replies A/B/C/D. Every write is shown only to someone who holds its power
// (WriteGate); the server judges every call anyway, including the rules about people (the one who issued a revision does not approve it).
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { enumLabel } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import { SourceNotice } from "@/components/SectionResilience";
import { WriteGate } from "@/lib/permissions";
import { DESIGN_DISCIPLINES } from "@shared/designDisciplines";

const field = "mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm";
const when = (value: Date | string | null | undefined, isArabic: boolean) => value ? new Intl.DateTimeFormat(isArabic ? "ar" : "en", { dateStyle: "medium" }).format(new Date(value)) : "—";
const noWrite = (ar: string, en: string) => ({ ar: `لا تملك صلاحية ${ar}، فالقسم للعرض فقط.`, en: `You do not have permission to ${en}; this section is read-only for you.` });

export function ProjectDesign({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { isArabic } = useLanguage();
  const scope = { tenantId, projectId };
  const board = trpc.design.dashboard.useQuery(scope);
  const drawings = trpc.design.drawings.useQuery(scope);
  const transmittals = trpc.design.transmittals.useQuery(scope);
  const comments = trpc.design.comments.useQuery(scope);
  const submittals = trpc.design.submittals.useQuery(scope);
  const refresh = () => { void board.refetch(); void drawings.refetch(); void transmittals.refetch(); void comments.refetch(); void submittals.refetch(); };
  const register = trpc.design.registerDrawing.useMutation({ onSuccess: refresh });
  const addRevision = trpc.design.addRevision.useMutation({ onSuccess: refresh });
  const cancelDrawing = trpc.design.cancelDrawing.useMutation({ onSuccess: refresh });
  const approveDrawing = trpc.design.approveDrawing.useMutation({ onSuccess: refresh });
  const createTransmittal = trpc.design.createTransmittal.useMutation({ onSuccess: refresh });
  const moveTransmittal = trpc.design.transitionTransmittal.useMutation({ onSuccess: refresh });
  const raiseComment = trpc.design.raiseComment.useMutation({ onSuccess: refresh });
  const moveComment = trpc.design.transitionComment.useMutation({ onSuccess: refresh });
  const createSubmittal = trpc.design.createSubmittal.useMutation({ onSuccess: refresh });
  const moveSubmittal = trpc.design.transitionSubmittal.useMutation({ onSuccess: refresh });
  const [drawing, setDrawing] = useState({ drawingNumber: "", title: "", discipline: "architectural", revision: "A" });
  const [revision, setRevision] = useState<Record<string, string>>({});
  const [transmittal, setTransmittal] = useState({ transmittalNumber: "", direction: "outgoing", counterparty: "", subject: "" });
  const [picked, setPicked] = useState<string[]>([]);
  const [comment, setComment] = useState({ drawingId: "", commentNumber: "", raisedBy: "", severity: "minor", commentText: "", dueAt: "" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submittal, setSubmittal] = useState({ submittalNumber: "", title: "", discipline: "architectural", drawingId: "", dueAt: "" });
  const [replyCodes, setReplyCodes] = useState<Record<string, string>>({});
  const error = register.error ?? addRevision.error ?? cancelDrawing.error ?? approveDrawing.error ?? createTransmittal.error ?? moveTransmittal.error ?? raiseComment.error ?? moveComment.error ?? createSubmittal.error ?? moveSubmittal.error;
  const t = isArabic
    ? { title: "التنسيق الفني والمعماري", note: "سجل المخططات والمراجعات والإحالات وملاحظات التصميم وتقديمات الاستشاري. من يصدر المراجعة لا يعتمدها، ومن يردّ على ملاحظة لا يغلقها، ومن يرسل التقديم لا يسجّل ردّ الاستشاري.", board: "لوحة مرحلة التصميم", complete: "اكتمال التصميم", notStarted: "لم يُسجَّل أي مخطط بعد", drawingsCount: "المخططات", approvedCount: "المعتمدة", openComments: "ملاحظات غير مغلقة", overdueComments: "ملاحظات متأخرة", awaiting: "تقديمات بانتظار الرد", overdueSubmittals: "تقديمات متأخرة", avgReply: "متوسط أيام الرد", replies: "ردود الاستشاري", byDiscipline: "حسب التخصص", days: "يوم",
        drawingsTitle: "سجل المخططات", number: "الرقم", name: "العنوان", discipline: "التخصص", revisionLabel: "المراجعة", status: "الحالة", register: "تسجيل مخطط", add: "إضافة مراجعة", newRevision: "رمز المراجعة الجديدة", approve: "اعتماد للتنفيذ", cancel: "إلغاء المخطط", unresolved: "ملاحظات غير محلولة", empty: "لا سجلات بعد.", loading: "جارٍ التحميل…",
        transmittalsTitle: "الإحالات", direction: "الاتجاه", counterparty: "الجهة", subject: "الموضوع", pick: "اختر المخططات (المراجعة الحالية)", createTransmittal: "إنشاء إحالة", send: "إرسال", acknowledge: "تأكيد الاستلام",
        commentsTitle: "ملاحظات المراجعة", drawing: "المخطط", raisedBy: "صاحب الملاحظة", severity: "الأهمية", text: "نص الملاحظة", due: "تاريخ الاستحقاق", raise: "تسجيل ملاحظة مراجعة", respond: "رد", response: "الرد", close: "إغلاق", reopen: "إعادة فتح", choose: "اختر…",
        submittalsTitle: "التقديمات للاستشاري", submittalTitle: "العنوان", linkedDrawing: "المخطط المرتبط (اختياري)", createSubmittal: "تسجيل تقديم", submit: "إرسال للاستشاري", reply: "تسجيل الرد", replyCode: "رمز الرد", resubmit: "إعادة التقديم", closeSubmittal: "إغلاق التقديم", dueShort: "الاستحقاق", replyNames: { A: "A · معتمد", B: "B · معتمد مع ملاحظات", C: "C · عدّل وأعد التقديم", D: "D · مرفوض" } }
    : { title: "Technical and architectural coordination", note: "Drawing register, revisions, transmittals, design review comments and consultant submittals. Whoever issues a revision does not approve it, whoever answers a comment does not close it, whoever sends a submittal does not record the consultant's reply.", board: "Design-phase board", complete: "Design completion", notStarted: "No drawing registered yet", drawingsCount: "Drawings", approvedCount: "Approved", openComments: "Unresolved comments", overdueComments: "Overdue comments", awaiting: "Submittals awaiting reply", overdueSubmittals: "Overdue submittals", avgReply: "Average days to reply", replies: "Consultant replies", byDiscipline: "By discipline", days: "days",
        drawingsTitle: "Drawing register", number: "Number", name: "Title", discipline: "Discipline", revisionLabel: "Revision", status: "Status", register: "Register drawing", add: "Add revision", newRevision: "New revision code", approve: "Approve for construction", cancel: "Cancel drawing", unresolved: "Unresolved comments", empty: "No records yet.", loading: "Loading…",
        transmittalsTitle: "Transmittals", direction: "Direction", counterparty: "Counterparty", subject: "Subject", pick: "Pick drawings (current revision)", createTransmittal: "Create transmittal", send: "Send", acknowledge: "Confirm receipt",
        commentsTitle: "Review comments", drawing: "Drawing", raisedBy: "Raised by", severity: "Severity", text: "Comment", due: "Due date", raise: "Raise comment", respond: "Respond", response: "Response", close: "Close", reopen: "Reopen", choose: "Choose…",
        submittalsTitle: "Consultant submittals", submittalTitle: "Title", linkedDrawing: "Linked drawing (optional)", createSubmittal: "Register submittal", submit: "Send to consultant", reply: "Record reply", replyCode: "Reply code", resubmit: "Resubmit", closeSubmittal: "Close submittal", dueShort: "Due", replyNames: { A: "A · Approved", B: "B · Approved as noted", C: "C · Revise and resubmit", D: "D · Rejected" } };
  const label = (code: string) => enumLabel(code, isArabic);
  const list = drawings.data ?? [];
  const live = list.filter(item => item.status !== "cancelled");
  const sheet = (heading: string, children: React.ReactNode) => <section className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">{heading}</h3><div className="mt-3 space-y-3">{children}</div></section>;
  const submit = (action: () => void) => (event: React.FormEvent) => { event.preventDefault(); action(); };
  const b = board.data;

  return <Card>
    <CardHeader><CardTitle>{t.title}</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <p className="text-xs leading-5 text-slate-600">{t.note}</p>
      <SourceNotice query={board} isArabic={isArabic} title={t.board} />
      <SourceNotice query={drawings} isArabic={isArabic} title={t.drawingsTitle} />
      <SourceNotice query={transmittals} isArabic={isArabic} title={t.transmittalsTitle} />
      <SourceNotice query={comments} isArabic={isArabic} title={t.commentsTitle} />
      <SourceNotice query={submittals} isArabic={isArabic} title={t.submittalsTitle} />
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p> : null}

      {b ? <section aria-label={t.board} className="rounded-xl bg-[#e6f4f3] p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label={t.complete} value={b.drawings.completionPercent === null ? t.notStarted : `${b.drawings.completionPercent}%`} />
          <Metric label={`${t.approvedCount} / ${t.drawingsCount}`} value={`${b.drawings.approved} / ${b.drawings.total}`} />
          <Metric label={t.openComments} value={String(b.comments.open + b.comments.responded)} />
          <Metric label={t.overdueComments} value={String(b.comments.overdue)} />
          <Metric label={t.awaiting} value={String(b.submittals.awaitingReply)} />
          <Metric label={t.overdueSubmittals} value={String(b.submittals.overdue)} />
          <Metric label={t.avgReply} value={b.submittals.averageReplyDays === null ? "—" : `${b.submittals.averageReplyDays} ${t.days}`} />
          <Metric label={t.replies} value={(["A", "B", "C", "D"] as const).map(code => `${code} ${b.submittals.replies[code]}`).join(" · ")} />
        </div>
        {b.drawings.disciplines.length ? <ul aria-label={t.byDiscipline} className="mt-3 grid gap-1 text-xs md:grid-cols-2">{b.drawings.disciplines.map(item => <li key={item.discipline} className="flex justify-between gap-2 rounded-lg bg-white/70 px-3 py-2"><span>{label(item.discipline)}</span><span>{item.approved} / {item.total}</span></li>)}</ul> : null}
      </section> : null}

      {sheet(t.drawingsTitle, <>
        <WriteGate permission="project.design.manage" projectId={projectId} reason={noWrite("تسجيل المخططات", "register drawings")}>
          <form className="grid gap-3 md:grid-cols-5" onSubmit={submit(() => register.mutate({ ...scope, ...drawing, discipline: drawing.discipline as never }, { onSuccess: () => setDrawing({ drawingNumber: "", title: "", discipline: drawing.discipline, revision: "A" }) }))}>
            <div><Label htmlFor="dg-number">{t.number}</Label><Input id="dg-number" value={drawing.drawingNumber} onChange={event => setDrawing({ ...drawing, drawingNumber: event.target.value })} required /></div>
            <div className="md:col-span-2"><Label htmlFor="dg-title">{t.name}</Label><Input id="dg-title" value={drawing.title} onChange={event => setDrawing({ ...drawing, title: event.target.value })} required /></div>
            <div><Label htmlFor="dg-discipline">{t.discipline}</Label><select id="dg-discipline" className={field} value={drawing.discipline} onChange={event => setDrawing({ ...drawing, discipline: event.target.value })}>{DESIGN_DISCIPLINES.map(code => <option key={code} value={code}>{label(code)}</option>)}</select></div>
            <div><Label htmlFor="dg-rev">{t.revisionLabel}</Label><Input id="dg-rev" value={drawing.revision} onChange={event => setDrawing({ ...drawing, revision: event.target.value })} required /></div>
            <Button type="submit" disabled={register.isPending} className="min-h-[44px] md:col-span-5">{t.register}</Button>
          </form>
        </WriteGate>
        {list.length ? <div className="divide-y rounded-xl border">{list.map(item => <div key={item.id} className="p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><b>{item.drawingNumber} · {item.title}</b><span className="text-xs text-slate-500">{label(item.discipline)} · {t.revisionLabel} {item.currentRevision} · {label(item.status)}</span></div>
          {item.unresolvedComments ? <p className="mt-1 text-xs text-amber-800">{t.unresolved}: {item.unresolvedComments}</p> : null}
          {item.status !== "cancelled" ? <div className="mt-2 flex flex-wrap items-end gap-2">
            <WriteGate permission="project.design.manage" projectId={projectId}>
              <Input aria-label={`${t.newRevision} ${item.drawingNumber}`} placeholder={t.newRevision} className="h-9 w-32" value={revision[item.id] ?? ""} onChange={event => setRevision({ ...revision, [item.id]: event.target.value })} />
              <Button size="sm" variant="outline" disabled={!revision[item.id]?.trim() || addRevision.isPending} onClick={() => addRevision.mutate({ ...scope, drawingId: item.id, revision: revision[item.id]!.trim() }, { onSuccess: () => setRevision({ ...revision, [item.id]: "" }) })}>{t.add}</Button>
              <Button size="sm" variant="outline" disabled={cancelDrawing.isPending} onClick={() => cancelDrawing.mutate({ ...scope, drawingId: item.id })}>{t.cancel}</Button>
            </WriteGate>
            <WriteGate permission="project.design.approve" projectId={projectId}>{item.status === "under_review" ? <Button size="sm" disabled={approveDrawing.isPending} onClick={() => approveDrawing.mutate({ ...scope, drawingId: item.id })}>{t.approve}</Button> : null}</WriteGate>
          </div> : null}
        </div>)}</div> : <p className="text-sm text-slate-500">{drawings.isLoading ? t.loading : t.empty}</p>}
      </>)}

      {sheet(t.transmittalsTitle, <>
        <WriteGate permission="project.design.manage" projectId={projectId} reason={noWrite("إنشاء الإحالات", "create transmittals")}>
          <form className="grid gap-3 md:grid-cols-4" onSubmit={submit(() => createTransmittal.mutate({ ...scope, ...transmittal, direction: transmittal.direction as never, revisionIds: picked }, { onSuccess: () => { setPicked([]); setTransmittal({ transmittalNumber: "", direction: "outgoing", counterparty: "", subject: "" }); } }))}>
            <div><Label htmlFor="tr-number">{t.number}</Label><Input id="tr-number" value={transmittal.transmittalNumber} onChange={event => setTransmittal({ ...transmittal, transmittalNumber: event.target.value })} required /></div>
            <div><Label htmlFor="tr-direction">{t.direction}</Label><select id="tr-direction" className={field} value={transmittal.direction} onChange={event => setTransmittal({ ...transmittal, direction: event.target.value })}><option value="outgoing">{label("outgoing")}</option><option value="incoming">{label("incoming")}</option></select></div>
            <div><Label htmlFor="tr-party">{t.counterparty}</Label><Input id="tr-party" value={transmittal.counterparty} onChange={event => setTransmittal({ ...transmittal, counterparty: event.target.value })} required /></div>
            <div><Label htmlFor="tr-subject">{t.subject}</Label><Input id="tr-subject" value={transmittal.subject} onChange={event => setTransmittal({ ...transmittal, subject: event.target.value })} required /></div>
            <fieldset className="md:col-span-4"><legend className="text-sm font-medium">{t.pick}</legend><div className="mt-2 flex flex-wrap gap-2">{live.filter(item => item.currentRevisionId).map(item => <label key={item.id} className="flex min-h-[44px] items-center gap-2 rounded-lg border px-3 text-sm"><input type="checkbox" checked={picked.includes(item.currentRevisionId!)} onChange={event => setPicked(event.target.checked ? [...picked, item.currentRevisionId!] : picked.filter(id => id !== item.currentRevisionId))} />{item.drawingNumber} / {item.currentRevision}</label>)}</div></fieldset>
            <Button type="submit" disabled={createTransmittal.isPending || picked.length === 0} className="min-h-[44px] md:col-span-4">{t.createTransmittal}</Button>
          </form>
        </WriteGate>
        {(transmittals.data ?? []).length ? <div className="divide-y rounded-xl border">{(transmittals.data ?? []).map(item => <div key={item.id} className="p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><b>{item.transmittalNumber} · {item.subject}</b><span className="text-xs text-slate-500">{label(item.direction)} · {item.counterparty} · {label(item.status)}</span></div>
          <p className="mt-1 text-xs text-slate-600">{item.items.join("، ")}</p>
          <WriteGate permission="project.design.manage" projectId={projectId}>{item.status === "draft" ? <Button size="sm" className="mt-2" disabled={moveTransmittal.isPending} onClick={() => moveTransmittal.mutate({ ...scope, transmittalId: item.id, nextStatus: "sent" })}>{t.send}</Button> : item.status === "sent" ? <Button size="sm" variant="outline" className="mt-2" disabled={moveTransmittal.isPending} onClick={() => moveTransmittal.mutate({ ...scope, transmittalId: item.id, nextStatus: "acknowledged" })}>{t.acknowledge}</Button> : null}</WriteGate>
        </div>)}</div> : <p className="text-sm text-slate-500">{transmittals.isLoading ? t.loading : t.empty}</p>}
      </>)}

      {sheet(t.commentsTitle, <>
        <WriteGate permission="project.design.manage" projectId={projectId} reason={noWrite("تسجيل ملاحظات المراجعة", "raise review comments")}>
          <form className="grid gap-3 md:grid-cols-4" onSubmit={submit(() => raiseComment.mutate({ ...scope, drawingId: comment.drawingId, commentNumber: comment.commentNumber, raisedBy: comment.raisedBy, severity: comment.severity as never, commentText: comment.commentText, ...(comment.dueAt ? { dueAt: new Date(`${comment.dueAt}T00:00:00.000Z`) } : {}) }, { onSuccess: () => setComment({ drawingId: comment.drawingId, commentNumber: "", raisedBy: comment.raisedBy, severity: "minor", commentText: "", dueAt: "" }) }))}>
            <div><Label htmlFor="cm-drawing">{t.drawing}</Label><select id="cm-drawing" className={field} value={comment.drawingId} onChange={event => setComment({ ...comment, drawingId: event.target.value })} required><option value="">{t.choose}</option>{live.filter(item => item.status !== "approved").map(item => <option key={item.id} value={item.id}>{item.drawingNumber} / {item.currentRevision}</option>)}</select></div>
            <div><Label htmlFor="cm-number">{t.number}</Label><Input id="cm-number" value={comment.commentNumber} onChange={event => setComment({ ...comment, commentNumber: event.target.value })} required /></div>
            <div><Label htmlFor="cm-by">{t.raisedBy}</Label><Input id="cm-by" value={comment.raisedBy} onChange={event => setComment({ ...comment, raisedBy: event.target.value })} required /></div>
            <div><Label htmlFor="cm-severity">{t.severity}</Label><select id="cm-severity" className={field} value={comment.severity} onChange={event => setComment({ ...comment, severity: event.target.value })}>{["minor", "major", "critical"].map(code => <option key={code} value={code}>{label(code)}</option>)}</select></div>
            <div className="md:col-span-3"><Label htmlFor="cm-text">{t.text}</Label><Input id="cm-text" value={comment.commentText} onChange={event => setComment({ ...comment, commentText: event.target.value })} required minLength={3} /></div>
            <div><Label htmlFor="cm-due">{t.due}</Label><Input id="cm-due" type="date" value={comment.dueAt} onChange={event => setComment({ ...comment, dueAt: event.target.value })} /></div>
            <Button type="submit" disabled={raiseComment.isPending} className="min-h-[44px] md:col-span-4">{t.raise}</Button>
          </form>
        </WriteGate>
        {(comments.data ?? []).length ? <div className="divide-y rounded-xl border">{(comments.data ?? []).map(item => <div key={item.id} className="p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><b>{item.commentNumber} · {item.drawingNumber} / {item.revision}</b><span className="text-xs text-slate-500">{label(item.severity)} · {label(item.status)} · {item.raisedBy}{item.dueAt ? ` · ${t.dueShort} ${when(item.dueAt, isArabic)}` : ""}</span></div>
          <p className="mt-1">{item.commentText}</p>
          {item.responseText ? <p className="mt-1 text-xs text-slate-600">{t.response}: {item.responseText}</p> : null}
          {item.status === "open" ? <WriteGate permission="project.design.manage" projectId={projectId}><div className="mt-2 flex flex-wrap items-end gap-2"><Input aria-label={`${t.response} ${item.commentNumber}`} placeholder={t.response} className="h-9 min-w-48 flex-1" value={answers[item.id] ?? ""} onChange={event => setAnswers({ ...answers, [item.id]: event.target.value })} /><Button size="sm" disabled={!answers[item.id]?.trim() || moveComment.isPending} onClick={() => moveComment.mutate({ ...scope, commentId: item.id, nextStatus: "responded", responseText: answers[item.id]!.trim() })}>{t.respond}</Button></div></WriteGate> : null}
          {item.status === "responded" ? <WriteGate permission="project.design.approve" projectId={projectId}><div className="mt-2 flex gap-2"><Button size="sm" disabled={moveComment.isPending} onClick={() => moveComment.mutate({ ...scope, commentId: item.id, nextStatus: "closed" })}>{t.close}</Button><Button size="sm" variant="outline" disabled={moveComment.isPending} onClick={() => moveComment.mutate({ ...scope, commentId: item.id, nextStatus: "open" })}>{t.reopen}</Button></div></WriteGate> : null}
        </div>)}</div> : <p className="text-sm text-slate-500">{comments.isLoading ? t.loading : t.empty}</p>}
      </>)}

      {sheet(t.submittalsTitle, <>
        <WriteGate permission="project.design.manage" projectId={projectId} reason={noWrite("تسجيل التقديمات", "register submittals")}>
          <form className="grid gap-3 md:grid-cols-5" onSubmit={submit(() => createSubmittal.mutate({ ...scope, submittalNumber: submittal.submittalNumber, title: submittal.title, discipline: submittal.discipline as never, ...(submittal.drawingId ? { drawingId: submittal.drawingId } : {}), ...(submittal.dueAt ? { dueAt: new Date(`${submittal.dueAt}T00:00:00.000Z`) } : {}) }, { onSuccess: () => setSubmittal({ submittalNumber: "", title: "", discipline: submittal.discipline, drawingId: "", dueAt: "" }) }))}>
            <div><Label htmlFor="sb-number">{t.number}</Label><Input id="sb-number" value={submittal.submittalNumber} onChange={event => setSubmittal({ ...submittal, submittalNumber: event.target.value })} required /></div>
            <div className="md:col-span-2"><Label htmlFor="sb-title">{t.submittalTitle}</Label><Input id="sb-title" value={submittal.title} onChange={event => setSubmittal({ ...submittal, title: event.target.value })} required /></div>
            <div><Label htmlFor="sb-discipline">{t.discipline}</Label><select id="sb-discipline" className={field} value={submittal.discipline} onChange={event => setSubmittal({ ...submittal, discipline: event.target.value })}>{DESIGN_DISCIPLINES.map(code => <option key={code} value={code}>{label(code)}</option>)}</select></div>
            <div><Label htmlFor="sb-due">{t.due}</Label><Input id="sb-due" type="date" value={submittal.dueAt} onChange={event => setSubmittal({ ...submittal, dueAt: event.target.value })} /></div>
            <div className="md:col-span-5"><Label htmlFor="sb-drawing">{t.linkedDrawing}</Label><select id="sb-drawing" className={field} value={submittal.drawingId} onChange={event => setSubmittal({ ...submittal, drawingId: event.target.value })}><option value="">—</option>{live.map(item => <option key={item.id} value={item.id}>{item.drawingNumber} / {item.currentRevision}</option>)}</select></div>
            <Button type="submit" disabled={createSubmittal.isPending} className="min-h-[44px] md:col-span-5">{t.createSubmittal}</Button>
          </form>
        </WriteGate>
        {(submittals.data ?? []).length ? <div className="divide-y rounded-xl border">{(submittals.data ?? []).map(item => <div key={item.id} className="p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><b>{item.submittalNumber} · {item.title}</b><span className="text-xs text-slate-500">{label(item.discipline)} · {label(item.status)}{item.replyCode ? ` · ${t.replyNames[item.replyCode]}` : ""}{item.dueAt ? ` · ${t.dueShort} ${when(item.dueAt, isArabic)}` : ""}</span></div>
          {item.replyNote ? <p className="mt-1 text-xs text-slate-600">{item.replyNote}</p> : null}
          <div className="mt-2 flex flex-wrap items-end gap-2">
            {item.status === "draft" ? <WriteGate permission="project.design.manage" projectId={projectId}><Button size="sm" disabled={moveSubmittal.isPending} onClick={() => moveSubmittal.mutate({ ...scope, submittalId: item.id, nextStatus: "submitted" })}>{t.submit}</Button></WriteGate> : null}
            {item.status === "submitted" ? <WriteGate permission="project.design.approve" projectId={projectId}>
              <select aria-label={`${t.replyCode} ${item.submittalNumber}`} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={replyCodes[item.id] ?? ""} onChange={event => setReplyCodes({ ...replyCodes, [item.id]: event.target.value })}><option value="">{t.replyCode}</option>{(["A", "B", "C", "D"] as const).map(code => <option key={code} value={code}>{t.replyNames[code]}</option>)}</select>
              <Button size="sm" disabled={!replyCodes[item.id] || moveSubmittal.isPending} onClick={() => moveSubmittal.mutate({ ...scope, submittalId: item.id, nextStatus: "replied", replyCode: replyCodes[item.id] as never })}>{t.reply}</Button>
            </WriteGate> : null}
            {item.status === "replied" ? <WriteGate permission="project.design.manage" projectId={projectId}>
              <Button size="sm" variant="outline" disabled={moveSubmittal.isPending} onClick={() => moveSubmittal.mutate({ ...scope, submittalId: item.id, nextStatus: "closed" })}>{t.closeSubmittal}</Button>
              {item.replyCode === "C" || item.replyCode === "D" ? <Button size="sm" disabled={createSubmittal.isPending} onClick={() => createSubmittal.mutate({ ...scope, submittalNumber: `${item.submittalNumber}-R${(submittals.data ?? []).filter(other => other.resubmissionOfId === item.id).length + 1}`, title: item.title, discipline: item.discipline as never, resubmissionOfId: item.id })}>{t.resubmit}</Button> : null}
            </WriteGate> : null}
          </div>
        </div>)}</div> : <p className="text-sm text-slate-500">{submittals.isLoading ? t.loading : t.empty}</p>}
      </>)}
    </CardContent>
  </Card>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white/80 p-3"><p className="text-xs text-slate-600">{label}</p><p className="mt-1 text-lg font-semibold text-[#0e6b70]">{value}</p></div>;
}
