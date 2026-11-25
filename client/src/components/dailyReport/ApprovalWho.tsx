// Q-56 (4a): who approves a daily report, said where it matters. The preparer never approves their own report (PROJECT_OS_SITE_REPORT_SELF_REVIEW, unchanged);
// a company of one person therefore has no approver, and the weekly and monthly reports (approved dailies only) read empty. These pieces say so instead of
// leaving the reader at a refusal or an empty page: after «send», on one's own report in the approvals list, and above the weekly and monthly figures.
import React from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";

const text = {
  ar: {
    goesTo: "يعتمده", or: "أو", nobody: "لا أحد غيرك في المشروع يستطيع اعتماده: مُعدّ التقرير لا يعتمده. ادعُ مدير مشروع ليعتمده.", invite: "فريق المشروع ← دعوة",
    yours: "أعددتَ هذا التقرير، فيعتمده شخص آخر.", waiting: (n: number) => (n === 1 ? "تقرير يومي واحد ينتظر الاعتماد من شخص غير مُعدّه، ولا يُحسب هنا قبل اعتماده." : `${n} تقارير يومية تنتظر الاعتماد من شخص غير مُعدّها، ولا تُحسب هنا قبل اعتمادها.`),
    open: "افتح التقارير اليومية", named: "(المسمّى في سلسلة الاعتماد)",
  },
  en: {
    goesTo: "Approved by", or: "or", nobody: "Nobody else on the project can approve it: the person who prepares a report does not approve it. Invite a project manager to approve it.", invite: "Project team → invite",
    yours: "You prepared this report, so someone else approves it.", waiting: (n: number) => (n === 1 ? "One daily report is waiting for approval by someone other than its writer; it is not counted here until it is approved." : `${n} daily reports are waiting for approval by someone other than their writer; they are not counted here until they are approved.`),
    open: "Open the daily reports", named: "(named in the approval chain)",
  },
  ur: {
    goesTo: "منظوری دینے والے", or: "یا", nobody: "پروجیکٹ میں آپ کے سوا کوئی اسے منظور نہیں کر سکتا: رپورٹ تیار کرنے والا اسے منظور نہیں کرتا۔ منظوری کے لیے پروجیکٹ مینیجر کو مدعو کریں۔", invite: "پروجیکٹ ٹیم ← دعوت",
    yours: "یہ رپورٹ آپ نے تیار کی ہے، اس لیے اسے کوئی اور منظور کرے گا۔", waiting: (n: number) => (n === 1 ? "ایک یومیہ رپورٹ اپنے تیار کنندہ کے علاوہ کسی کی منظوری کی منتظر ہے؛ منظوری سے پہلے یہاں شمار نہیں ہوتی۔" : `${n} یومیہ رپورٹس اپنے تیار کنندگان کے علاوہ کسی کی منظوری کی منتظر ہیں؛ منظوری سے پہلے یہاں شمار نہیں ہوتیں۔`),
    open: "یومیہ رپورٹس کھولیں", named: "(منظوری کی زنجیر میں نامزد)",
  },
};

type Scope = { tenantId: string; projectId: string };

/** Who may approve a report prepared by `preparedBy`: the project's approvers less the preparer, or — when there is none — a way to invite one. */
export function WhoApproves({ scope, preparedBy }: { scope: Scope; preparedBy: number | null }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const approvers = trpc.siteReports.approvers.useQuery(scope, { retry: false, refetchOnWindowFocus: false });
  if (!approvers.data) return null;
  const others = approvers.data.people.filter(person => person.userId !== preparedBy);
  if (others.length === 0) {
    return (
      <p role="note" data-approvers="none" className="rounded-xl bg-warning-soft p-3 text-sm text-warning-soft-foreground">
        {t.nobody}{" "}
        <Link className="inline-flex min-h-[44px] items-center font-semibold underline underline-offset-4" href={`/projects/${scope.tenantId}/${scope.projectId}/team`}>{t.invite}</Link>
      </p>
    );
  }
  const names = others.map(person => person.name ?? "—");
  return (
    <p role="note" data-approvers={others.length} className="rounded-xl bg-muted p-3 text-sm">
      <span className="text-muted-foreground">{t.goesTo}: </span>
      <bdi>{names.length > 1 ? `${names.slice(0, -1).join("، ")} ${t.or} ${names[names.length - 1]}` : names[0]}</bdi>
      {approvers.data.named ? <span className="text-muted-foreground"> {t.named}</span> : null}
    </p>
  );
}

/** On one's own report in the approvals list: why there is no «approve» button, and who approves it. */
export function OwnReportNote({ scope, preparedBy }: { scope: Scope; preparedBy: number }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  return (
    <div className="space-y-2" data-own-report>
      <p className="text-sm text-muted-foreground">{t.yours}</p>
      <WhoApproves scope={scope} preparedBy={preparedBy} />
    </div>
  );
}

/** Above the weekly and monthly figures: how many of the period's daily reports wait for an approver (they are not counted until approved). */
export function AwaitingApprovalNote({ scope, count }: { scope: Scope; count: number | undefined }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  if (!count) return null;
  return (
    <p role="note" data-awaiting-approval={count} className="rounded-xl bg-warning-soft p-3 text-sm text-warning-soft-foreground">
      {t.waiting(count)}{" "}
      <Link className="inline-flex min-h-[44px] items-center font-semibold underline underline-offset-4" href={`/m/${scope.tenantId}/${scope.projectId}/report`}>{t.open}</Link>
    </p>
  );
}
