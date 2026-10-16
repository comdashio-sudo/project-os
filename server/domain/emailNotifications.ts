// E-mail notifications (work order 3, decision 6): what is said, to whom it may go, and when. Pure: no database, no clock, no network.
//
// Three kinds: a support ticket was escalated, work is waiting for the recipient's approval, and a daily summary for a project manager.
// Every message is Arabic first with the English under it, carries counts and codes rather than amounts or pay, and links to the app instead of quoting it.

export type EmailKind = "support_escalation" | "approvals_waiting" | "daily_digest";
export const EMAIL_KINDS: readonly EmailKind[] = ["support_escalation", "approvals_waiting", "daily_digest"];

/** The UTC hour from which the once-a-day mails (reminders and digest) are made. 04:00 UTC is 07:00 in Riyadh. */
export const DAILY_MAIL_HOUR_UTC = 4;

export type BuiltEmail = { subject: string; text: string; html: string };

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (value: string, length: number) => (value.length > length ? `${value.slice(0, length - 1)}…` : value);

/** One line each way; the html is the same lines, escaped, with the link as the only markup that is not text. */
function compose(input: { subject: string; ar: string[]; en: string[]; link: string | null }): BuiltEmail {
  const linkAr = input.link ? [`فتح المنصة: ${input.link}`] : [];
  const linkEn = input.link ? [`Open the platform: ${input.link}`] : [];
  const text = [...input.ar, ...linkAr, "", "—", "", ...input.en, ...linkEn].join("\n");
  const block = (lines: string[], dir: "rtl" | "ltr", link: string | null, label: string) =>
    `<div dir="${dir}" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7">${lines.map(line => `<p style="margin:0 0 6px">${escapeHtml(line)}</p>`).join("")}${link ? `<p style="margin:10px 0 0"><a href="${escapeHtml(link)}">${escapeHtml(label)}</a></p>` : ""}</div>`;
  const html = `${block(input.ar, "rtl", input.link, "فتح المنصة")}<hr style="margin:18px 0;border:0;border-top:1px solid #ddd"/>${block(input.en, "ltr", input.link, "Open the platform")}`;
  return { subject: input.subject, text, html };
}

const reasonText = {
  urgent: { ar: "طلب عاجل", en: "an urgent request" },
  assistant_could_not_answer: { ar: "لم يستطع المساعد الإجابة", en: "the assistant could not answer" },
  customer_replied: { ar: "ردّ العميل على طلب مصعَّد", en: "the customer replied to an escalated request" },
} as const;

export function supportEscalationEmail(input: { ticketSubject: string; reason: keyof typeof reasonText; link: string | null }): BuiltEmail {
  const subject = clip(input.ticketSubject.trim() || "—", 120);
  const reason = reasonText[input.reason];
  return compose({
    subject: `تصعيد دعم | Support escalation: ${subject}`,
    ar: [`صُعِّد طلب دعم يحتاج متابعتك: «${subject}».`, `السبب: ${reason.ar}.`],
    en: [`A support request needs you: "${subject}".`, `Reason: ${reason.en}.`],
    link: input.link,
  });
}

export type ApprovalQueue = { code: string; ar: string; en: string; count: number };

export function approvalsWaitingEmail(input: { queues: readonly ApprovalQueue[]; link: string | null }): BuiltEmail | null {
  const waiting = input.queues.filter(queue => queue.count > 0);
  if (!waiting.length) return null;
  const total = waiting.reduce((sum, queue) => sum + queue.count, 0);
  return compose({
    subject: `بانتظار اعتمادك (${total}) | Waiting for your approval (${total})`,
    ar: [`لديك ${total} بندًا بانتظار اعتمادك:`, ...waiting.map(queue => `• ${queue.ar}: ${queue.count}`)],
    en: [`${total} item(s) are waiting for your approval:`, ...waiting.map(queue => `• ${queue.en}: ${queue.count}`)],
    link: input.link,
  });
}

export type DigestProject = { code: string; name: string; approvalsWaiting: number; overdueActions: number; openCriticalIssues: number; openNcrs: number; progressLoggedYesterday: number };

/** Null when there is nothing to say: a digest of zeros is noise, and a person who gets noise stops reading the mail that matters. */
export function dailyDigestEmail(input: { date: string; projects: readonly DigestProject[]; link: string | null }): BuiltEmail | null {
  const interesting = input.projects.filter(project => project.approvalsWaiting + project.overdueActions + project.openCriticalIssues + project.openNcrs + project.progressLoggedYesterday > 0);
  if (!interesting.length) return null;
  const line = (project: DigestProject, lang: "ar" | "en") => lang === "ar"
    ? `• ${project.code} · ${clip(project.name, 60)}: بانتظار الاعتماد ${project.approvalsWaiting} · إجراءات متأخرة ${project.overdueActions} · مشكلات حرجة مفتوحة ${project.openCriticalIssues} · عدم مطابقة مفتوح ${project.openNcrs} · تقدم سُجّل أمس ${project.progressLoggedYesterday}`
    : `• ${project.code} · ${clip(project.name, 60)}: awaiting approval ${project.approvalsWaiting} · overdue actions ${project.overdueActions} · open critical issues ${project.openCriticalIssues} · open NCRs ${project.openNcrs} · progress logged yesterday ${project.progressLoggedYesterday}`;
  return compose({
    subject: `الملخص اليومي ${input.date} | Daily summary ${input.date}`,
    ar: [`ملخص مشاريعك ليوم ${input.date}:`, ...interesting.map(project => line(project, "ar"))],
    en: [`Your projects on ${input.date}:`, ...interesting.map(project => line(project, "en"))],
    link: input.link,
  });
}

/** A person's choice wins; with no choice recorded every kind is on. */
export function preferenceAllows(disabled: ReadonlySet<EmailKind>, kind: EmailKind) {
  return !disabled.has(kind);
}

/** The date a once-a-day mail belongs to, and whether the day's mailing hour has come. */
export function dailyMailWindow(now: Date) {
  return { day: now.toISOString().slice(0, 10), open: now.getUTCHours() >= DAILY_MAIL_HOUR_UTC };
}
