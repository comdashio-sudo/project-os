import React from "react";
import { AlertCircle, Inbox, Lock, LoaderCircle } from "lucide-react";
import { Link } from "wouter";
import type { BilingualMessage } from "@shared/projectErrors";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { pickLanguage, resolveLanguage, type Language } from "@/lib/language";
import { useOptionalLanguage } from "@/contexts/optionalLanguage";

// The four states every screen owes the person (owner decision, work order 10): loading, empty with the next action, error with a
// retry, and no permission stated in a sentence. The copy follows the page: the language from the page when there is one, otherwise `isArabic`.

type ErrorLike = { data?: { code?: string; projectError?: { messages?: BilingualMessage } } } | null | undefined;

/** The server answered FORBIDDEN: the person may not see this, and asking again will not change that. */
export function isRefusal(error: unknown): boolean {
  return (error as ErrorLike)?.data?.code === "FORBIDDEN";
}

// Client-side failures that retrying cannot fix. Everything else (network, timeout, server error) keeps the default three retries.
const FINAL_CODES = new Set(["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND", "BAD_REQUEST", "PARSE_ERROR"]);

/**
 * The query retry policy. A refused or rejected request is final, so the screen shows its state at once instead of holding "loading"
 * for the seven seconds three retries take (G-160). A dropped connection or a server error is still retried.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const code = (error as ErrorLike)?.data?.code;
  if (code && FINAL_CODES.has(code)) return false;
  return failureCount < 3;
}

/** Loading: a short line that names what is being read, so the place is never blank. */
export function LoadingState({ isArabic, label }: { isArabic: boolean; label?: string }) {
  const lang = useOptionalLanguage() ?? resolveLanguage(isArabic);
  return <p role="status" data-screen-state="loading" className="flex items-center gap-2 py-4 text-sm text-slate-600">
    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
    <span>{label ?? pickLanguage(lang, { ar: "جارٍ التحميل…", en: "Loading…", ur: "لوڈ ہو رہا ہے…" })}</span>
  </p>;
}

export type NextAction = { label: string; href: string };

/**
 * Empty: says what is empty and gives the next action. `href` starting with "/" is a page; "#" is a place on the same page (the form
 * that adds the first item). A screen without a next action passes none and says so in `body`.
 */
export function EmptyState({ isArabic, title, body, action }: { isArabic: boolean; title: string; body: string; action?: NextAction }) {
  const className = "inline-flex min-h-[44px] items-center rounded-lg bg-[#0e6b70] px-4 text-sm font-semibold text-white";
  return <div role="status" data-screen-state="empty" className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
    <Inbox className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
    <p className="mt-3 font-semibold text-slate-900">{title}</p>
    <p className="mx-auto mt-2 max-w-md text-sm">{body}</p>
    {action && (action.href.startsWith("/")
      ? <Link href={action.href} className={`mt-4 ${className}`}>{action.label}</Link>
      : <a href={action.href} className={`mt-4 ${className}`}>{action.label}</a>)}
  </div>;
}

/**
 * Error: the server's sentence (translated), and a retry that calls the same query's `refetch`. A refusal is not an error to retry:
 * it is delegated to NoPermission, which says why.
 */
export function ErrorState({ isArabic, error, onRetry, retrying = false, title, retryLabel }: { isArabic: boolean; error: unknown; onRetry?: () => unknown; retrying?: boolean; title?: string; retryLabel?: string }) {
  const lang = useOptionalLanguage() ?? resolveLanguage(isArabic);
  if (isRefusal(error)) return <NoPermission isArabic={isArabic} error={error} />;
  return <div role="alert" data-screen-state="error" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
    <div className="flex items-start gap-2">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <p className={title ? "mt-1" : "font-semibold"}>{getLocalizedProjectError(error, lang)}</p>
        {onRetry && <button type="button" disabled={retrying} onClick={() => void onRetry()} className="mt-3 min-h-[44px] rounded-lg border border-red-700 bg-white px-4 font-semibold text-red-900 disabled:opacity-60">{retryLabel ?? pickLanguage(lang, { ar: "أعد المحاولة", en: "Try again", ur: "دوبارہ کوشش کریں" })}</button>}
      </div>
    </div>
  </div>;
}

/** The sentence for a refusal: the server's own (it names the missing permission) when it sent one, otherwise a fixed one. */
export function refusalSentence(error: unknown, language: Language | boolean, scope: "screen" | "section" = "screen"): string {
  const lang = resolveLanguage(language);
  const messages = (error as ErrorLike)?.data?.projectError?.messages;
  if (messages) return messages[lang];
  if (scope === "section") return pickLanguage(lang, { ar: "لا تملك الصلاحية اللازمة لعرض هذا القسم.", en: "You do not have the permission needed to view this section.", ur: "اس حصے کو دیکھنے کے لیے درکار صلاحیت آپ کے پاس نہیں ہے۔" });
  return pickLanguage(lang, { ar: "لا تملك الصلاحية اللازمة لعرض هذه الشاشة.", en: "You do not have the permission needed to view this screen.", ur: "اس اسکرین کو دیکھنے کے لیے درکار صلاحیت آپ کے پاس نہیں ہے۔" });
}

/**
 * No permission: a sentence the person can act on. The server's own refusal sentence is used when it sent one (it names the missing
 * permission); otherwise the fixed sentence. Never a bare 403, never a blank.
 */
export function NoPermission({ isArabic, error, title, scope = "screen" }: { isArabic: boolean; error?: unknown; title?: string; scope?: "screen" | "section" }) {
  const lang = useOptionalLanguage() ?? resolveLanguage(isArabic);
  const sentence = refusalSentence(error, lang, scope);
  const next = pickLanguage(lang, { ar: "اطلب من مالك الشركة أو من يدير صلاحيات فريقك إضافتها لك، ثم أعد فتح الشاشة.", en: "Ask the company owner or whoever manages your team's permissions to grant it, then reopen this screen.", ur: "کمپنی کے مالک یا اپنی ٹیم کی صلاحیتیں منظم کرنے والے شخص سے یہ صلاحیت دینے کو کہیں، پھر یہ اسکرین دوبارہ کھولیں۔" });
  return <section role="note" data-screen-state="no-permission" className="rounded-2xl border border-slate-300 bg-slate-50 p-5 text-sm text-slate-800">
    <div className="flex items-start gap-3">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      <div>
        <p className="font-semibold">{title ?? (scope === "section" ? pickLanguage(lang, { ar: "لا صلاحية لعرض هذا القسم", en: "No permission to view this section", ur: "اس حصے کو دیکھنے کی اجازت نہیں" }) : null) ?? pickLanguage(lang, { ar: "لا صلاحية لعرض هذه الشاشة", en: "No permission to view this screen", ur: "اس اسکرین کو دیکھنے کی اجازت نہیں" })}</p>
        <p className="mt-1">{sentence}</p>
        <p className="mt-1 text-slate-600">{next}</p>
      </div>
    </div>
  </section>;
}

/**
 * A register that could not load, in the page's frame: its card, its own title, "Could not load: <title>" and the shared error surface with
 * a retry, in the page's language. Never a bare line of red text between the cards (D-3 design review of #222 and #232).
 */
export function SectionFailed({ title, error, isArabic, onRetry, retrying = false }: { title: string; error: unknown; isArabic: boolean; onRetry?: () => unknown; retrying?: boolean }) {
  const lang = useOptionalLanguage() ?? resolveLanguage(isArabic);
  return <section aria-label={title} className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border">
    <h2 className="mb-3 font-semibold">{title}</h2>
    {/* a refusal is not an error to retry: it says, for this section, which permission is missing */}
    {isRefusal(error)
      ? <NoPermission isArabic={isArabic} error={error} scope="section" />
      : <ErrorState isArabic={isArabic} error={error} title={pickLanguage(lang, { ar: `تعذّر تحميل: ${title}`, en: `Could not load: ${title}`, ur: `لوڈ نہیں ہو سکا: ${title}` })} onRetry={onRetry} retrying={retrying} />}
  </section>;
}
