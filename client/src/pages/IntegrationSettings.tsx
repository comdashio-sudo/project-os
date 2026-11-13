import { Button } from "@/components/ui/button";
import { Select } from "@/components/ds";
import { FieldShell, fieldInput, showDate, tap } from "@/components/FieldShell";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCan } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import React, { useState } from "react";
import { useParams } from "wouter";

// The company's integration settings (work order 14, item 1): the connections to its other systems with "test the connection" and "run now", the API keys, the signed
// webhooks, the mapping of the other system's identifiers to ours, and the log of every exchange — what arrived, what was refused and why. A key or a webhook secret is
// shown ONCE, at its creation, because the server keeps only a hash of the key and the secret sealed; a connection's password is typed here and never shown again.
// Every call is the company manager's; the server refuses anyone else, and this screen says so in a sentence instead of showing empty lists.
const text = {
  ar: {
    title: "إعدادات التكامل", back: "العودة إلى إدارة الشركة", loading: "جارٍ التحميل…", retry: "إعادة المحاولة", managersOnly: "إعدادات التكامل لمدير الشركة وحده.",
    tabConnections: "الاتصالات", tabKeys: "مفاتيح API", tabWebhooks: "Webhooks", tabMappings: "المطابقة", tabLog: "سجل المزامنة",
    system: "النظام", name: "الاسم", baseUrl: "عنوان النظام (https)", database: "اسم قاعدة البيانات", username: "المستخدم", secret: "كلمة المرور أو المفتاح (تُحفظ مغلقة ولا تُعرض)", settings: "إعدادات (JSON، اختياري)", settingsInvalid: "الإعدادات ليست JSON صالحًا",
    scheduled: "سحب يومي تلقائي", active: "فعّال", inactive: "معطّل", lastRun: "آخر تشغيل", never: "لم يُشغَّل", create: "إضافة", creating: "جارٍ الإضافة…", created: "تمت الإضافة",
    status_PROVEN_IN_CI: "مُثبَت في CI على نظام حقيقي", status_UNVERIFIED: "غير مُتحقَّق: لم يردّ عليه حساب حقيقي بعد", reads: "يقرأ", writes: "يكتب", readOnly: "قراءة فقط",
    test: "اختبار الاتصال", testing: "جارٍ الاختبار…", testOk: "الاتصال سليم", testFailed: "فشل الاتصال", run: "تشغيل الآن", running: "جارٍ التشغيل…", direction: "الاتجاه", dirIn: "سحب إلى المنصة", dirOut: "دفع إلى النظام", dirBoth: "الاثنان",
    activate: "تفعيل", deactivate: "تعطيل", dailyOn: "تفعيل اليومي", dailyOff: "إيقاف اليومي", noConnections: "لا اتصالات بعد.", runResult: "نتيجة التشغيل", received: "وصل", accepted: "قُبل", rejected: "رُفض", skipped: "تخطّى", pushed: "أُرسل",
    keyName: "اسم المفتاح", scopes: "الصلاحيات", rate: "حد الطلبات في الدقيقة", expires: "ينتهي بعد (أيام، اختياري)", newKey: "مفتاح جديد", copyNow: "انسخ المفتاح الآن: لن يُعرض مرة أخرى.", revoke: "إلغاء المفتاح", revoked: "مُلغى", prefix: "البادئة", lastUsed: "آخر استعمال", noKeys: "لا مفاتيح بعد.",
    url: "عنوان الاستقبال (https)", events: "الأحداث", newHook: "Webhook جديد", secretNow: "سرّ التوقيع (يُعرض الآن فقط):", sendTest: "إرسال تجربة", testResult: "نتيجة التجربة", deliveries: "التسليمات", delivered: "سُلّم", pending: "قيد الإعادة", failed: "فشل", noHooks: "لا Webhooks بعد.",
    mapType: "نوع المطابقة", externalId: "معرّف النظام الآخر", ours: "عندنا (الرمز)", forProject: "المشروع (لرمز التكلفة)", saveMap: "حفظ المطابقة", mapSaved: "حُفظت المطابقة", noMaps: "لا مطابقات بعد.", mapRejected: "رُفضت المطابقة",
    supplier: "مورد", project: "مشروع", material: "مادة", cost_code: "رمز تكلفة ← بند WBS", cost_center: "مركز تكلفة ← مشروع",
    runs: "تشغيلات المزامنة", when: "الوقت", entity: "النوع", trigger: "المشغّل", items: "سجلات التشغيل", outcome: "النتيجة", reason: "السبب", record: "السجل", noRuns: "لا تشغيلات بعد.", all: "الكل",
    created_: "أُنشئ", updated: "حُدّث", unchanged: "بلا تغيير", stored: "حُفظ كما وصل", rejected_: "مرفوض",
    ok: "ناجح", partial: "جزئي", failed_: "فاشل", running_: "جارٍ",
   okLabel: "حسنًا", perMinute: "/دقيقة" },
  en: {
    title: "Integration settings", back: "Back to company administration", loading: "Loading…", retry: "Retry", managersOnly: "Integration settings belong to the company manager.",
    tabConnections: "Connections", tabKeys: "API keys", tabWebhooks: "Webhooks", tabMappings: "Mappings", tabLog: "Sync log",
    system: "System", name: "Name", baseUrl: "System address (https)", database: "Database name", username: "User", secret: "Password or key (kept sealed, never shown)", settings: "Settings (JSON, optional)", settingsInvalid: "The settings are not valid JSON",
    scheduled: "Pull automatically every day", active: "Active", inactive: "Off", lastRun: "Last run", never: "Never run", create: "Add", creating: "Adding…", created: "Added",
    status_PROVEN_IN_CI: "Proven in CI against a real system", status_UNVERIFIED: "Unverified: no real account has answered it yet", reads: "Reads", writes: "Writes", readOnly: "read only",
    test: "Test the connection", testing: "Testing…", testOk: "The connection works", testFailed: "The connection failed", run: "Run now", running: "Running…", direction: "Direction", dirIn: "Pull into the platform", dirOut: "Push to the system", dirBoth: "Both",
    activate: "Switch on", deactivate: "Switch off", dailyOn: "Run daily", dailyOff: "Stop daily", noConnections: "No connections yet.", runResult: "Result of the run", received: "Received", accepted: "Accepted", rejected: "Refused", skipped: "Skipped", pushed: "Pushed",
    keyName: "Key name", scopes: "Powers", rate: "Calls per minute", expires: "Expires after (days, optional)", newKey: "New key", copyNow: "Copy the key now: it will not be shown again.", revoke: "Revoke the key", revoked: "Revoked", prefix: "Prefix", lastUsed: "Last used", noKeys: "No keys yet.",
    url: "Receiving address (https)", events: "Events", newHook: "New webhook", secretNow: "Signing secret (shown now only):", sendTest: "Send a test", testResult: "Test result", deliveries: "Deliveries", delivered: "Delivered", pending: "Retrying", failed: "Failed", noHooks: "No webhooks yet.",
    mapType: "Mapping type", externalId: "The other system's identifier", ours: "Ours (code)", forProject: "Project (for a cost code)", saveMap: "Save the mapping", mapSaved: "Mapping saved", noMaps: "No mappings yet.", mapRejected: "The mapping was refused",
    supplier: "Supplier", project: "Project", material: "Material", cost_code: "Cost code → WBS item", cost_center: "Cost center → project",
    runs: "Sync runs", when: "When", entity: "Kind", trigger: "Started by", items: "Records of the run", outcome: "Outcome", reason: "Reason", record: "Record", noRuns: "No runs yet.", all: "All",
    created_: "Created", updated: "Updated", unchanged: "Unchanged", stored: "Kept as received", rejected_: "Refused",
    ok: "OK", partial: "Partial", failed_: "Failed", running_: "Running",
   okLabel: "OK", perMinute: "/min" },
  ur: {
    title: "انضمام کی ترتیبات", back: "کمپنی کے انتظام پر واپس", loading: "لوڈ ہو رہا ہے…", retry: "دوبارہ کوشش", managersOnly: "انضمام کی ترتیبات کمپنی کے مینیجر کی ہیں۔",
    tabConnections: "کنکشنز", tabKeys: "API کیز", tabWebhooks: "ویب ہُکس", tabMappings: "میپنگ", tabLog: "ہم آہنگی کا لاگ",
    system: "نظام", name: "نام", baseUrl: "نظام کا پتہ (https)", database: "ڈیٹا بیس کا نام", username: "صارف", secret: "پاس ورڈ یا کلید (بند محفوظ، دوبارہ نہیں دکھائی جاتی)", settings: "ترتیبات (JSON، اختیاری)", settingsInvalid: "ترتیبات درست JSON نہیں",
    scheduled: "ہر دن خودکار کھینچیں", active: "فعال", inactive: "بند", lastRun: "آخری عمل", never: "کبھی نہیں چلا", create: "شامل کریں", creating: "شامل کیا جا رہا ہے…", created: "شامل ہو گیا",
    status_PROVEN_IN_CI: "CI میں حقیقی نظام کے خلاف ثابت شدہ", status_UNVERIFIED: "غیر تصدیق شدہ: ابھی تک کسی حقیقی اکاؤنٹ نے جواب نہیں دیا", reads: "پڑھتا ہے", writes: "لکھتا ہے", readOnly: "صرف پڑھنا",
    test: "کنکشن کا ٹیسٹ", testing: "ٹیسٹ ہو رہا ہے…", testOk: "کنکشن ٹھیک ہے", testFailed: "کنکشن ناکام", run: "ابھی چلائیں", running: "چل رہا ہے…", direction: "سمت", dirIn: "پلیٹ فارم میں کھینچیں", dirOut: "نظام کو بھیجیں", dirBoth: "دونوں",
    activate: "چالو کریں", deactivate: "بند کریں", dailyOn: "روزانہ چلائیں", dailyOff: "روزانہ روکیں", noConnections: "ابھی کوئی کنکشن نہیں۔", runResult: "عمل کا نتیجہ", received: "موصول", accepted: "قبول", rejected: "مسترد", skipped: "چھوڑا گیا", pushed: "بھیجا گیا",
    keyName: "کلید کا نام", scopes: "اختیارات", rate: "فی منٹ کالز", expires: "اتنے دن بعد ختم (اختیاری)", newKey: "نئی کلید", copyNow: "کلید ابھی نقل کر لیں: یہ دوبارہ نہیں دکھائی جائے گی۔", revoke: "کلید منسوخ کریں", revoked: "منسوخ", prefix: "سابقہ", lastUsed: "آخری استعمال", noKeys: "ابھی کوئی کلید نہیں۔",
    url: "وصول کرنے کا پتہ (https)", events: "واقعات", newHook: "نیا ویب ہُک", secretNow: "دستخط کا راز (صرف ابھی دکھایا جاتا ہے):", sendTest: "ٹیسٹ بھیجیں", testResult: "ٹیسٹ کا نتیجہ", deliveries: "ترسیلات", delivered: "پہنچ گیا", pending: "دوبارہ کوشش میں", failed: "ناکام", noHooks: "ابھی کوئی ویب ہُک نہیں۔",
    mapType: "میپنگ کی قسم", externalId: "دوسرے نظام کی شناخت", ours: "ہمارے ہاں (کوڈ)", forProject: "پروجیکٹ (لاگت کے کوڈ کے لیے)", saveMap: "میپنگ محفوظ کریں", mapSaved: "میپنگ محفوظ ہو گئی", noMaps: "ابھی کوئی میپنگ نہیں۔", mapRejected: "میپنگ مسترد ہوئی",
    supplier: "سپلائر", project: "پروجیکٹ", material: "مادّہ", cost_code: "لاگت کا کوڈ ← WBS آئٹم", cost_center: "لاگت کا مرکز ← پروجیکٹ",
    runs: "ہم آہنگی کے عمل", when: "وقت", entity: "قسم", trigger: "شروع کرنے والا", items: "عمل کے ریکارڈ", outcome: "نتیجہ", reason: "وجہ", record: "ریکارڈ", noRuns: "ابھی کوئی عمل نہیں۔", all: "سب",
    created_: "بنایا گیا", updated: "اپ ڈیٹ ہوا", unchanged: "کوئی تبدیلی نہیں", stored: "جیسا آیا محفوظ", rejected_: "مسترد",
    ok: "کامیاب", partial: "جزوی", failed_: "ناکام", running_: "جاری",
   okLabel: "ٹھیک ہے", perMinute: "/منٹ" },
};

const proven = (connector: { status: string }) => connector.status === "PROVEN_IN_CI";
const connectorWord = (connector: { status: string }) => (proven(connector) ? "status_PROVEN_IN_CI" : "status_UNVERIFIED");
const SYSTEMS = ["odoo", "sap_b1", "dynamics365", "netsuite"] as const;
const SYSTEM_NAME: Record<string, string> = { odoo: "Odoo", sap_b1: "SAP Business One", dynamics365: "Microsoft Dynamics 365", netsuite: "Oracle NetSuite" };
const MAP_TYPES = ["supplier", "project", "material", "cost_code", "cost_center"] as const;
type Tab = "connections" | "keys" | "webhooks" | "mappings" | "log";
const outcomeKey: Record<string, string> = { created: "created_", updated: "updated", unchanged: "unchanged", stored: "stored", rejected: "rejected_" };
const runKey: Record<string, string> = { ok: "ok", partial: "partial", failed: "failed_", running: "running_" };

export default function IntegrationSettings() {
  const { tenantId = "" } = useParams<{ tenantId: string }>();
  const { language } = useLanguage();
  const isArabic = language === "ar";
  const t = pickLanguage(language, text);
  const tt = t as Record<string, string>;
  const isManager = useCan("tenant.manage");
  const enabled = Boolean(tenantId);
  const utils = trpc.useUtils();
  const meta = trpc.integrations.scopes.useQuery(undefined, { enabled });
  const [tab, setTab] = useState<Tab>("connections");
  const [message, setMessage] = useState<string | null>(null);
  const back = `/tenants/${tenantId}/administration`;

  const tabButton = (value: Tab, label: string) => <button type="button" role="tab" aria-selected={tab === value} className={`${tap} rounded-xl px-3 text-sm font-semibold ${tab === value ? "bg-primary text-white" : "border bg-white text-slate-800"}`} onClick={() => { setTab(value); setMessage(null); }}>{label}</button>;
  if (!isManager) return <FieldShell wide title={t.title} backHref={back} backLabel={t.back}><p role="note" className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">{t.managersOnly}</p></FieldShell>;
  if (meta.isLoading) return <FieldShell wide title={t.title} backHref={back} backLabel={t.back}><p role="status" className="text-sm text-slate-500">{t.loading}</p></FieldShell>;
  if (meta.error || !meta.data) return <FieldShell wide title={t.title} backHref={back} backLabel={t.back}><p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(meta.error, isArabic)}</p><Button className={tap} variant="outline" onClick={() => void meta.refetch()}>{t.retry}</Button></FieldShell>;
  const info = meta.data;

  return (
    <FieldShell wide title={t.title} backHref={back} backLabel={t.back}>
      <div role="tablist" className="flex flex-wrap gap-2">{tabButton("connections", t.tabConnections)}{tabButton("keys", t.tabKeys)}{tabButton("webhooks", t.tabWebhooks)}{tabButton("mappings", t.tabMappings)}{tabButton("log", t.tabLog)}</div>
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</p>}
      {tab === "connections" && <Connections tenantId={tenantId} t={t} tt={tt} isArabic={isArabic} language={language} utils={utils} onMessage={setMessage} />}
      {tab === "keys" && <Keys tenantId={tenantId} t={t} tt={tt} isArabic={isArabic} language={language} scopes={info.scopes as readonly string[]} utils={utils} />}
      {tab === "webhooks" && <Webhooks tenantId={tenantId} t={t} isArabic={isArabic} language={language} events={info.events as readonly string[]} utils={utils} />}
      {tab === "mappings" && <Mappings tenantId={tenantId} t={t} tt={tt} isArabic={isArabic} language={language} onMessage={setMessage} utils={utils} />}
      {tab === "log" && <SyncLog tenantId={tenantId} t={t} tt={tt} isArabic={isArabic} language={language} />}
    </FieldShell>
  );
}

type Common = { tenantId: string; t: (typeof text)["en"]; isArabic: boolean; language: "ar" | "en" | "ur" };
type Utils = ReturnType<typeof trpc.useUtils>;

function Connections({ tenantId, t, tt, isArabic, language, utils, onMessage }: Common & { tt: Record<string, string>; utils: Utils; onMessage: (message: string | null) => void }) {
  const list = trpc.integrations.listConnections.useQuery({ tenantId });
  const [form, setForm] = useState({ system: "odoo" as string, name: "", baseUrl: "", database: "", username: "", secret: "", settings: "", scheduledDaily: false });
  const [results, setResults] = useState<Record<string, { kind: "test" | "run"; ok: boolean; text: string }>>({});
  const [direction, setDirection] = useState<Record<string, "in" | "out" | "both">>({});
  const refresh = () => { void utils.integrations.listConnections.invalidate(); };
  const create = trpc.integrations.createConnection.useMutation({ onSuccess: () => { onMessage(t.created); setForm(current => ({ ...current, name: "", secret: "" })); refresh(); } });
  const setActive = trpc.integrations.setConnectionActive.useMutation({ onSuccess: refresh });
  const test = trpc.integrations.testConnection.useMutation({ onSuccess: (result, variables) => setResults(current => ({ ...current, [variables.connectionId]: { kind: "test", ok: result.ok, text: result.ok ? `${t.testOk}${"serverVersion" in result && result.serverVersion ? ` (${result.serverVersion})` : ""}` : `${t.testFailed}: ${"reason" in result ? result.reason : ""}` } })) });
  const run = trpc.integrations.runConnection.useMutation({ onSuccess: (result, variables) => {
    const pulled = result.pulled.map(item => `${item.entity}: ${t.received} ${item.received} · ${t.accepted} ${item.accepted} · ${t.rejected} ${item.rejected}`);
    const pushed = result.pushed ? [`${t.pushed}: +${result.pushed.created} ~${result.pushed.updated} =${result.pushed.unchanged} ✗${result.pushed.rejected}`] : [];
    const skipped = result.skipped.length ? [`${t.skipped}: ${result.skipped.length} (${Array.from(new Set(result.skipped.map(item => item.reason))).join(", ")})`] : [];
    setResults(current => ({ ...current, [variables.connectionId]: { kind: "run", ok: true, text: [...pulled, ...pushed, ...skipped].join(" | ") || "—" } }));
    refresh(); void utils.integrations.syncRuns.invalidate();
  } });
  let settingsValid = true; let settings: Record<string, unknown> | undefined;
  if (form.settings.trim()) { try { settings = JSON.parse(form.settings) as Record<string, unknown>; if (typeof settings !== "object" || settings === null || Array.isArray(settings)) settingsValid = false; } catch { settingsValid = false; } }
  const canCreate = form.name.trim().length >= 2 && /^https:\/\//.test(form.baseUrl.trim()) && form.secret.length > 0 && settingsValid;
  const error = create.error ?? setActive.error ?? run.error;
  const rows = list.data ?? [];
  return (
    <section aria-label={t.tabConnections} className="space-y-3">
      {error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>}
      <details className="rounded-xl border bg-white p-3" open={rows.length === 0}>
        <summary className={`${tap} flex cursor-pointer items-center text-base font-semibold`}>{t.create}</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block text-sm font-medium">{t.system}<Select className="mt-1" value={form.system} onValueChange={value => setForm({ ...form, system: value })} options={SYSTEMS.map(value => ({ value, label: SYSTEM_NAME[value] }))} /></label>
          <label className="block text-sm font-medium">{t.name}<input className={`${fieldInput} mt-1`} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          <label className="block text-sm font-medium sm:col-span-2">{t.baseUrl}<input className={`${fieldInput} mt-1`} inputMode="url" value={form.baseUrl} onChange={event => setForm({ ...form, baseUrl: event.target.value })} /></label>
          <label className="block text-sm font-medium">{t.database}<input className={`${fieldInput} mt-1`} value={form.database} onChange={event => setForm({ ...form, database: event.target.value })} /></label>
          <label className="block text-sm font-medium">{t.username}<input className={`${fieldInput} mt-1`} autoComplete="off" value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} /></label>
          <label className="block text-sm font-medium sm:col-span-2">{t.secret}<input className={`${fieldInput} mt-1`} type="password" autoComplete="new-password" value={form.secret} onChange={event => setForm({ ...form, secret: event.target.value })} /></label>
          <label className="block text-sm font-medium sm:col-span-2">{t.settings}<textarea className="mt-1 min-h-[72px] w-full rounded-xl border bg-white p-3 font-mono text-sm" dir="ltr" value={form.settings} onChange={event => setForm({ ...form, settings: event.target.value })} /></label>
          {!settingsValid && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{t.settingsInvalid}</p>}
          <label className={`${tap} flex items-center gap-2 text-sm sm:col-span-2`}><input type="checkbox" checked={form.scheduledDaily} onChange={event => setForm({ ...form, scheduledDaily: event.target.checked })} />{t.scheduled}</label>
        </div>
        <Button className={`${tap} mt-2 w-full sm:w-auto`} disabled={!canCreate || create.isPending} onClick={() => { onMessage(null); create.mutate({ tenantId, system: form.system, name: form.name.trim(), baseUrl: form.baseUrl.trim(), database: form.database.trim() || undefined, username: form.username.trim() || undefined, secret: form.secret, settings, scheduledDaily: form.scheduledDaily }); }}>{create.isPending ? t.creating : t.create}</Button>
      </details>
      {list.error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(list.error, isArabic)}</p>}
      {rows.length === 0 ? <p role="status" className="rounded-2xl border border-dashed p-6 text-center text-slate-600">{t.noConnections}</p> : (
        <ul className="space-y-2">{rows.map(row => {
          const result = results[row.id];
          return (
            <li key={row.id} className="space-y-2 rounded-xl border bg-white p-3" data-connection={row.name}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="text-base font-semibold">{row.name} · {SYSTEM_NAME[row.system] ?? row.system}</p><p className="text-xs text-slate-600" dir="ltr">{row.baseUrl}{row.database ? ` · ${row.database}` : ""}{row.username ? ` · ${row.username}` : ""}</p>
                  <p className="text-xs text-slate-600">{t.lastRun}: {row.lastRunAt ? showDate(row.lastRunAt, language) : t.never} · {row.active ? t.active : t.inactive}{row.scheduledDaily ? ` · ${t.scheduled}` : ""}</p></div>
                {row.connector && <p data-connector-status={row.connector.status} className={`rounded-lg px-2 py-1 text-xs font-semibold ${proven(row.connector) ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{tt[connectorWord(row.connector)]}</p>}
              </div>
              {row.connector && <p className="text-xs text-slate-600">{t.reads}: {row.connector.pulls.join(", ")} · {t.writes}: {row.connector.pushes.length ? row.connector.pushes.join(", ") : t.readOnly}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" className={tap} disabled={test.isPending} onClick={() => test.mutate({ tenantId, connectionId: row.id })}>{test.isPending && test.variables?.connectionId === row.id ? t.testing : t.test}</Button>
                <Select aria-label={t.direction} className="w-auto" value={direction[row.id] ?? "in"} onValueChange={value => setDirection({ ...direction, [row.id]: value as "in" | "out" | "both" })} options={[{ value: "in", label: t.dirIn }, ...(row.connector && row.connector.pushes.length > 0 ? [{ value: "out", label: t.dirOut }, { value: "both", label: t.dirBoth }] : [])]} />
                <Button className={tap} disabled={run.isPending || !row.active} onClick={() => run.mutate({ tenantId, connectionId: row.id, direction: direction[row.id] ?? "in" })}>{run.isPending && run.variables?.connectionId === row.id ? t.running : t.run}</Button>
                <Button variant="outline" className={tap} disabled={setActive.isPending} onClick={() => setActive.mutate({ tenantId, connectionId: row.id, active: !row.active })}>{row.active ? t.deactivate : t.activate}</Button>
                <Button variant="outline" className={tap} disabled={setActive.isPending} onClick={() => setActive.mutate({ tenantId, connectionId: row.id, active: row.active, scheduledDaily: !row.scheduledDaily })}>{row.scheduledDaily ? t.dailyOff : t.dailyOn}</Button>
              </div>
              {result && <p role="status" data-result={result.kind} className={`rounded-lg p-2 text-sm ${result.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{result.kind === "run" ? `${t.runResult}: ` : ""}{result.text}</p>}
            </li>
          );
        })}</ul>
      )}
    </section>
  );
}

function Keys({ tenantId, t, tt, isArabic, language, scopes, utils }: Common & { tt: Record<string, string>; scopes: readonly string[]; utils: Utils }) {
  const list = trpc.integrations.listKeys.useQuery({ tenantId });
  const [form, setForm] = useState({ name: "", scopes: [] as string[], rate: "", days: "" });
  const [shown, setShown] = useState<string | null>(null);
  const create = trpc.integrations.createKey.useMutation({ onSuccess: result => { setShown(result.key); setForm({ name: "", scopes: [], rate: "", days: "" }); void utils.integrations.listKeys.invalidate(); } });
  const revoke = trpc.integrations.revokeKey.useMutation({ onSuccess: () => { void utils.integrations.listKeys.invalidate(); } });
  const rows = list.data ?? [];
  const rate = form.rate.trim() ? Number(form.rate) : undefined; const days = form.days.trim() ? Number(form.days) : undefined;
  const valid = form.name.trim().length >= 2 && form.scopes.length > 0 && (rate === undefined || (Number.isInteger(rate) && rate >= 10 && rate <= 6000)) && (days === undefined || (Number.isInteger(days) && days >= 1 && days <= 3650));
  const error = create.error ?? revoke.error ?? list.error;
  return (
    <section aria-label={t.tabKeys} className="space-y-3">
      {error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>}
      {shown && <div role="alert" data-new-key className="space-y-1 rounded-xl border-2 border-amber-400 bg-amber-50 p-3"><p className="text-sm font-semibold">{t.copyNow}</p><code className="block break-all rounded bg-white p-2 text-sm" dir="ltr">{shown}</code><Button variant="outline" className={tap} onClick={() => setShown(null)}>{t.okLabel}</Button></div>}
      <details className="rounded-xl border bg-white p-3" open={rows.length === 0}>
        <summary className={`${tap} flex cursor-pointer items-center text-base font-semibold`}>{t.newKey}</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block text-sm font-medium sm:col-span-2">{t.keyName}<input className={`${fieldInput} mt-1`} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          <fieldset className="sm:col-span-2"><legend className="text-sm font-medium">{t.scopes}</legend><div className="flex flex-wrap gap-3">{scopes.map(scope => <label key={scope} className={`${tap} flex items-center gap-2 text-sm`}><input type="checkbox" checked={form.scopes.includes(scope)} onChange={event => setForm({ ...form, scopes: event.target.checked ? [...form.scopes, scope] : form.scopes.filter(item => item !== scope) })} /><span dir="ltr">{scope}</span></label>)}</div></fieldset>
          <label className="block text-sm font-medium">{t.rate}<input className={`${fieldInput} mt-1`} inputMode="numeric" placeholder="120" value={form.rate} onChange={event => setForm({ ...form, rate: event.target.value })} /></label>
          <label className="block text-sm font-medium">{t.expires}<input className={`${fieldInput} mt-1`} inputMode="numeric" value={form.days} onChange={event => setForm({ ...form, days: event.target.value })} /></label>
        </div>
        <Button className={`${tap} mt-2 w-full sm:w-auto`} disabled={!valid || create.isPending} onClick={() => create.mutate({ tenantId, name: form.name.trim(), scopes: form.scopes as never, rateLimitPerMinute: rate, expiresInDays: days })}>{t.create}</Button>
      </details>
      {rows.length === 0 ? <p role="status" className="rounded-2xl border border-dashed p-6 text-center text-slate-600">{t.noKeys}</p> : (
        <ul className="space-y-2">{rows.map(row => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3" data-key={row.name}>
            <div><p className="text-base font-semibold">{row.name} {row.revokedAt && <span className="text-sm font-normal text-red-700">· {t.revoked}</span>}</p>
              <p className="text-xs text-slate-600" dir="ltr">{row.keyPrefix}… · {row.scopes} · {row.rateLimitPerMinute}{t.perMinute}</p>
              <p className="text-xs text-slate-600">{t.lastUsed}: {row.lastUsedAt ? showDate(row.lastUsedAt, language) : t.never}</p></div>
            {!row.revokedAt && <Button variant="outline" className={tap} disabled={revoke.isPending} onClick={() => revoke.mutate({ tenantId, keyId: row.id })}>{t.revoke}</Button>}
          </li>))}</ul>
      )}
      <span hidden>{tt.prefix}</span>
    </section>
  );
}

function Webhooks({ tenantId, t, isArabic, language, events, utils }: Common & { events: readonly string[]; utils: Utils }) {
  const list = trpc.integrations.listWebhooks.useQuery({ tenantId });
  const [form, setForm] = useState({ url: "", events: [] as string[] });
  const [secret, setSecret] = useState<string | null>(null);
  const [tested, setTested] = useState<Record<string, string>>({});
  const refresh = () => { void utils.integrations.listWebhooks.invalidate(); };
  const create = trpc.integrations.createWebhook.useMutation({ onSuccess: result => { setSecret(result.secret); setForm({ url: "", events: [] }); refresh(); } });
  const toggle = trpc.integrations.setWebhookActive.useMutation({ onSuccess: refresh });
  const deliveryWord: Record<string, string> = { delivered: t.delivered, pending: t.pending, failed: t.failed };
  const test = trpc.integrations.testWebhook.useMutation({ onSuccess: (result, variables) => { setTested(current => ({ ...current, [variables.endpointId]: `${deliveryWord[result.status] ?? "—"}${result.lastStatusCode ? ` · HTTP ${result.lastStatusCode}` : ""}${result.lastError ? ` · ${result.lastError}` : ""}` })); refresh(); } });
  const rows = list.data ?? [];
  const error = create.error ?? toggle.error ?? test.error ?? list.error;
  return (
    <section aria-label={t.tabWebhooks} className="space-y-3">
      {error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>}
      {secret && <div role="alert" data-new-secret className="space-y-1 rounded-xl border-2 border-amber-400 bg-amber-50 p-3"><p className="text-sm font-semibold">{t.secretNow}</p><code className="block break-all rounded bg-white p-2 text-sm" dir="ltr">{secret}</code><Button variant="outline" className={tap} onClick={() => setSecret(null)}>{t.okLabel}</Button></div>}
      <details className="rounded-xl border bg-white p-3" open={rows.length === 0}>
        <summary className={`${tap} flex cursor-pointer items-center text-base font-semibold`}>{t.newHook}</summary>
        <div className="mt-2 grid gap-2">
          <label className="block text-sm font-medium">{t.url}<input className={`${fieldInput} mt-1`} inputMode="url" dir="ltr" value={form.url} onChange={event => setForm({ ...form, url: event.target.value })} /></label>
          <fieldset><legend className="text-sm font-medium">{t.events}</legend><div className="flex flex-wrap gap-3">{events.filter(event => event !== "webhook.test").map(event => <label key={event} className={`${tap} flex items-center gap-2 text-sm`}><input type="checkbox" checked={form.events.includes(event)} onChange={e => setForm({ ...form, events: e.target.checked ? [...form.events, event] : form.events.filter(item => item !== event) })} /><span dir="ltr">{event}</span></label>)}</div></fieldset>
        </div>
        <Button className={`${tap} mt-2 w-full sm:w-auto`} disabled={!/^https:\/\//.test(form.url.trim()) || form.events.length === 0 || create.isPending} onClick={() => create.mutate({ tenantId, url: form.url.trim(), events: form.events })}>{t.create}</Button>
      </details>
      {rows.length === 0 ? <p role="status" className="rounded-2xl border border-dashed p-6 text-center text-slate-600">{t.noHooks}</p> : (
        <ul className="space-y-2">{rows.map(row => (
          <li key={row.id} className="space-y-2 rounded-xl border bg-white p-3" data-webhook={row.url}>
            <p className="break-all text-base font-semibold" dir="ltr">{row.url}</p>
            <p className="text-xs text-slate-600"><span dir="ltr">{row.events}</span> · {row.active ? t.active : t.inactive} · {t.deliveries}: {t.delivered} {row.deliveries.delivered ?? 0} · {t.pending} {row.deliveries.pending ?? 0} · {t.failed} {row.deliveries.failed ?? 0} · {showDate(row.createdAt, language)}</p>
            <div className="flex flex-wrap gap-2"><Button variant="outline" className={tap} disabled={test.isPending} onClick={() => test.mutate({ tenantId, endpointId: row.id })}>{t.sendTest}</Button>
              <Button variant="outline" className={tap} disabled={toggle.isPending} onClick={() => toggle.mutate({ tenantId, endpointId: row.id, active: !row.active })}>{row.active ? t.deactivate : t.activate}</Button></div>
            {tested[row.id] && <p role="status" className="rounded-lg bg-slate-50 p-2 text-sm">{t.testResult}: {tested[row.id]}</p>}
          </li>))}</ul>
      )}
    </section>
  );
}

function Mappings({ tenantId, t, tt, isArabic, onMessage, utils }: Common & { tt: Record<string, string>; onMessage: (message: string | null) => void; utils: Utils }) {
  const [system, setSystem] = useState<string>("odoo");
  const list = trpc.integrations.mappings.useQuery({ tenantId, system });
  const [form, setForm] = useState({ type: "supplier" as (typeof MAP_TYPES)[number], externalId: "", ref: "", project: "" });
  const save = trpc.integrations.saveMappings.useMutation({ onSuccess: result => { const refused = result.items.filter(item => item.outcome === "rejected"); onMessage(refused.length ? `${t.mapRejected}: ${refused.map(item => item.reason).join(", ")}` : t.mapSaved); void utils.integrations.mappings.invalidate(); } });
  const rows = list.data ?? [];
  const needsProject = form.type === "cost_code";
  const valid = form.externalId.trim() !== "" && form.ref.trim() !== "" && (!needsProject || form.project.trim() !== "");
  const error = save.error ?? list.error;
  return (
    <section aria-label={t.tabMappings} className="space-y-3">
      {error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>}
      <div className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">{t.system}<Select className="mt-1" value={system} onValueChange={setSystem} options={["generic", ...SYSTEMS].map(value => ({ value, label: SYSTEM_NAME[value] ?? value }))} /></label>
        <label className="block text-sm font-medium">{t.mapType}<Select className="mt-1" value={form.type} onValueChange={value => setForm({ ...form, type: value as (typeof MAP_TYPES)[number] })} options={MAP_TYPES.map(value => ({ value, label: tt[value] }))} /></label>
        <label className="block text-sm font-medium">{t.externalId}<input className={`${fieldInput} mt-1`} dir="ltr" value={form.externalId} onChange={event => setForm({ ...form, externalId: event.target.value })} /></label>
        <label className="block text-sm font-medium">{t.ours}<input className={`${fieldInput} mt-1`} dir="ltr" value={form.ref} onChange={event => setForm({ ...form, ref: event.target.value })} /></label>
        {needsProject && <label className="block text-sm font-medium sm:col-span-2">{t.forProject}<input className={`${fieldInput} mt-1`} dir="ltr" value={form.project} onChange={event => setForm({ ...form, project: event.target.value })} /></label>}
        <Button className={`${tap} sm:col-span-2 sm:w-auto`} disabled={!valid || save.isPending} onClick={() => save.mutate({ tenantId, system, type: form.type, records: [{ externalId: form.externalId.trim(), ref: form.ref.trim(), project: needsProject ? form.project.trim() : undefined }] })}>{t.saveMap}</Button>
      </div>
      {rows.length === 0 ? <p role="status" className="rounded-2xl border border-dashed p-6 text-center text-slate-600">{t.noMaps}</p> : (
        <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm" data-mappings><thead><tr className="bg-slate-50"><th scope="col" className="p-2 text-start">{t.mapType}</th><th scope="col" className="p-2 text-start">{t.externalId}</th><th scope="col" className="p-2 text-start">{t.ours}</th></tr></thead>
          <tbody>{rows.map(row => <tr key={`${row.type}-${row.externalId}`} className="border-t"><td className="p-2">{tt[row.type] ?? row.type}</td><td className="p-2" dir="ltr">{row.externalId}</td><td className="p-2" dir="ltr">{row.internalCode ?? "—"}</td></tr>)}</tbody></table></div>
      )}
    </section>
  );
}

function SyncLog({ tenantId, t, tt, isArabic, language }: Common & { tt: Record<string, string> }) {
  const runs = trpc.integrations.syncRuns.useQuery({ tenantId });
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>("all");
  const items = trpc.integrations.syncItems.useQuery({ tenantId, runId: openRun ?? "", outcome: outcome === "all" ? undefined : (outcome as "rejected") }, { enabled: Boolean(openRun) });
  const rows = runs.data ?? [];
  const error = runs.error ?? items.error;
  return (
    <section aria-label={t.tabLog} className="space-y-3">
      {error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>}
      {rows.length === 0 ? <p role="status" className="rounded-2xl border border-dashed p-6 text-center text-slate-600">{t.noRuns}</p> : (
        <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm" data-runs>
          <thead><tr className="bg-slate-50"><th scope="col" className="p-2 text-start">{t.when}</th><th scope="col" className="p-2 text-start">{t.system}</th><th scope="col" className="p-2 text-start">{t.entity}</th><th scope="col" className="p-2 text-start">{t.trigger}</th><th scope="col" className="p-2 text-center">{t.received}</th><th scope="col" className="p-2 text-center">{t.accepted}</th><th scope="col" className="p-2 text-center">{t.rejected}</th><th scope="col" className="p-2 text-start">{t.outcome}</th><th scope="col" className="p-2"><span className="sr-only">{t.items}</span></th></tr></thead>
          <tbody>{rows.map(run => <tr key={run.id} className="border-t" data-run={run.id}>
            <td className="p-2">{showDate(run.startedAt, language)}</td><td className="p-2" dir="ltr">{run.system}</td><td className="p-2" dir="ltr">{run.direction === "out" ? "→ " : "← "}{run.entityType ?? "—"}</td><td className="p-2" dir="ltr">{run.trigger}</td>
            <td className="p-2 text-center">{run.received}</td><td className="p-2 text-center">{run.accepted}</td><td className={`p-2 text-center ${run.rejected > 0 ? "font-semibold text-red-700" : ""}`}>{run.rejected}</td><td className="p-2">{tt[runKey[run.status] ?? run.status] ?? run.status}</td>
            <td className="p-2"><Button variant="outline" className={tap} onClick={() => { setOpenRun(run.id); setOutcome("all"); }}>{t.items}</Button></td></tr>)}</tbody></table></div>
      )}
      {openRun && (
        <div className="space-y-2" data-items>
          <div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold">{t.items}</h2>
            <label className="flex items-center gap-2 text-sm font-medium">{t.outcome}<Select className="w-auto" value={outcome} onValueChange={setOutcome} options={[{ value: "all", label: t.all }, ...Object.keys(outcomeKey).map(value => ({ value, label: tt[outcomeKey[value]] }))]} /></label></div>
          <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead><tr className="bg-slate-50"><th scope="col" className="p-2 text-start">{t.record}</th><th scope="col" className="p-2 text-start">{t.outcome}</th><th scope="col" className="p-2 text-start">{t.reason}</th></tr></thead>
            <tbody>{(items.data ?? []).map(item => <tr key={item.id} className="border-t" data-outcome={item.outcome}><td className="p-2" dir="ltr">{item.entityType} {item.externalId ?? ""}</td><td className="p-2">{tt[outcomeKey[item.outcome]] ?? item.outcome}</td><td className="p-2" dir="ltr">{item.reason ?? ""}{item.detail ? ` — ${item.detail}` : ""}</td></tr>)}</tbody></table></div>
        </div>
      )}
    </section>
  );
}
