import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { Download, ShieldAlert } from "lucide-react";
import React, { useState } from "react";
import { pickLanguage } from "@/lib/language";

// The owner's two rights over the company's data: take a copy of everything, and erase everything for good. Deleting takes two separate
// confirmations (ask, then type the company's exact name and tick the box), and only after a copy has been downloaded in the last 7 days.
// Anyone who is not the owner never sees this card: the server refuses the preview, and a refused preview renders nothing.
export function TenantDataCard({ tenantId }: { tenantId: string }) {
  const { isArabic, language } = useLanguage();
  const preview = trpc.tenantData.preview.useQuery({ tenantId }, { retry: false, refetchOnWindowFocus: true });
  const request = trpc.tenantData.requestDeletion.useMutation();
  const confirm = trpc.tenantData.confirmDeletion.useMutation();
  const [typedName, setTypedName] = useState("");
  const [understood, setUnderstood] = useState(false);
  const t = pickLanguage(language, { ar: {
        title: "بيانات الشركة: نسخة كاملة وحذف نهائي", note: "لمالك الشركة وحده. التصدير ملف واحد يضم كل ما تملكه الشركة؛ والحذف يمحو كل شيء نهائيًا ولا يمكن التراجع عنه.",
        loading: "جارٍ قراءة حجم بياناتك…", size: (rows: number, tables: number, files: number) => `تملك شركتك ${rows} سجلًا في ${tables} جدولًا و${files} ملفًا مخزّنًا.`,
        download: "تنزيل نسخة كاملة من بيانات الشركة", downloadNote: "ملف مضغوط (NDJSON) واحد. بعد انتهاء التنزيل اضغط «تحديث» ليُحتسب.", refresh: "تحديث",
        lastExport: (at: string) => `آخر تصدير كامل: ${at}`, noExport: "لم يُجرَ أي تصدير كامل بعد.",
        danger: "الحذف النهائي", needExport: "لا يتاح الحذف إلا بعد تنزيل نسخة كاملة خلال الأيام السبعة الماضية.",
        ask: "أريد حذف بيانات الشركة نهائيًا", asking: "جارٍ التحضير…",
        warn: (rows: number, files: number, people: number) => `سيُحذف ${rows} سجلًا و${files} ملفًا، وتُزال عضويات ${people} من الأشخاص فيها؛ حساباتهم وهوياتهم لا تُحذف ويستطيعون الدخول بعدها. يبقى سجل التدقيق (يسجّل أن الحذف تم) وهيكل فارغ باسم محذوف.`,
        typeName: (name: string) => `اكتب اسم الشركة تمامًا كما هو: ${name}`, nameLabel: "اسم الشركة", understand: "أفهم أن الحذف نهائي ولا يمكن التراجع عنه.",
        deleteNow: "احذف بيانات الشركة نهائيًا", deleting: "جارٍ الحذف…", expires: "ينتهي هذا التأكيد خلال 15 دقيقة.",
        done: "اكتمل الحذف", pass: "التحقق: نجح — لا سجل واحد متبقٍّ في أي جدول.", fail: "التحقق: لم يكتمل — بقيت عناصر مذكورة أدناه. أعد المحاولة أو راسل الدعم.",
        report: (deleted: number, tables: number) => `حُذف ${deleted} سجلًا بعد فحص ${tables} جدولًا.`, files: (deleted: number, found: number) => `الملفات المحذوفة: ${deleted} من ${found}.`,
        leftover: "الملفات التي لم تُحذف:", home: "العودة إلى الصفحة الرئيسية",
      }, en: {
        title: "Company data: full copy and permanent deletion", note: "For the company owner only. The export is one file with everything the company owns; deletion erases everything for good and cannot be undone.",
        loading: "Reading the size of your data…", size: (rows: number, tables: number, files: number) => `Your company owns ${rows} records in ${tables} tables and ${files} stored files.`,
        download: "Download a full copy of the company's data", downloadNote: "One compressed (NDJSON) file. When the download finishes press Refresh so it counts.", refresh: "Refresh",
        lastExport: (at: string) => `Last full export: ${at}`, noExport: "No full export yet.",
        danger: "Permanent deletion", needExport: "Deletion is available only after a full copy was downloaded in the last 7 days.",
        ask: "I want to delete the company's data permanently", asking: "Preparing…",
        warn: (rows: number, files: number, people: number) => `${rows} records and ${files} files will be deleted, and the memberships of ${people} people in it are removed; their accounts and identities are NOT deleted and they can still sign in. The audit trail stays (it records that the deletion happened), with an empty shell under a deleted name.`,
        typeName: (name: string) => `Type the company name exactly: ${name}`, nameLabel: "Company name", understand: "I understand the deletion is permanent and cannot be undone.",
        deleteNow: "Delete the company's data permanently", deleting: "Deleting…", expires: "This confirmation expires in 15 minutes.",
        done: "Deletion finished", pass: "Verification: passed — no record is left in any table.", fail: "Verification: incomplete — items remain, listed below. Try again or contact support.",
        report: (deleted: number, tables: number) => `${deleted} records deleted after checking ${tables} tables.`, files: (deleted: number, found: number) => `Files deleted: ${deleted} of ${found}.`,
        leftover: "Files that were not deleted:", home: "Back to the home page",
      }, ur: {
        title: "کمپنی کا ڈیٹا: مکمل نقل اور مستقل حذف", note: "صرف کمپنی کے مالک کے لیے۔ ایکسپورٹ ایک فائل ہے جس میں کمپنی کی ہر چیز ہے؛ حذف سب کچھ مستقل طور پر مٹا دیتا ہے اور اسے واپس نہیں کیا جا سکتا۔",
        loading: "آپ کے ڈیٹا کا سائز پڑھا جا رہا ہے…", size: (rows: number, tables: number, files: number) => `Your company owns ${rows} records in ${tables} tables and ${files} stored files.`,
        download: "کمپنی کے ڈیٹا کی مکمل نقل ڈاؤن لوڈ کریں", downloadNote: "ایک کمپریس شدہ (NDJSON) فائل۔ ڈاؤن لوڈ مکمل ہونے کے بعد ریفریش دبائیں تاکہ وہ شمار ہو۔", refresh: "تازہ کریں",
        lastExport: (at: string) => `Last full export: ${at}`, noExport: "ابھی تک کوئی مکمل ایکسپورٹ نہیں۔",
        danger: "مستقل حذف", needExport: "حذف صرف اس وقت دستیاب ہے جب پچھلے 7 دنوں میں مکمل نقل ڈاؤن لوڈ کی گئی ہو۔",
        ask: "میں کمپنی کا ڈیٹا مستقل طور پر حذف کرنا چاہتا ہوں", asking: "تیار کیا جا رہا ہے…",
        warn: (rows: number, files: number, people: number) => `${rows} ریکارڈ اور ${files} فائلیں حذف ہوں گی، اور اس میں شامل ${people} افراد کی رکنیت ہٹا دی جائے گی؛ ان کے اکاؤنٹس اور شناخت حذف نہیں ہوں گے، اور وہ اب بھی سائن ان کر سکتے ہیں۔ آڈٹ ٹریل باقی رہتا ہے (یہ ریکارڈ کرتا ہے کہ حذف ہوا)، جس میں حذف شدہ نام کے تحت ایک خالی خول ہوتا ہے۔`,
        typeName: (name: string) => `Type the company name exactly: ${name}`, nameLabel: "کمپنی کا نام", understand: "میں سمجھتا ہوں کہ حذف مستقل ہے اور اسے واپس نہیں کیا جا سکتا۔",
        deleteNow: "کمپنی کا ڈیٹا مستقل طور پر حذف کریں", deleting: "حذف کیا جا رہا ہے…", expires: "یہ تصدیق 15 منٹ میں ختم ہو جائے گی۔",
        done: "حذف مکمل ہو گیا", pass: "تصدیق: کامیاب — کسی جدول میں کوئی ریکارڈ باقی نہیں۔", fail: "تصدیق: نامکمل — نیچے درج کچھ چیزیں باقی ہیں۔ دوبارہ کوشش کریں یا سپورٹ سے رابطہ کریں۔",
        report: (deleted: number, tables: number) => `${deleted} records deleted after checking ${tables} tables.`, files: (deleted: number, found: number) => `Files deleted: ${deleted} of ${found}.`,
        leftover: "وہ فائلیں جو حذف نہیں ہوئیں:", home: "ہوم پیج پر واپس جائیں",
      } });

  const report = confirm.data;
  // The verdict first: after the erasure the preview query refetches, fails (the company and the caller's membership are gone) and would hide this card before it is read.
  if (report) {
    return (
      <Card className="mt-6 border-red-200" role="status">
        <CardHeader><CardTitle>{t.done}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className={report.verification === "PASS" ? "font-semibold text-emerald-800" : "font-semibold text-red-700"}>{report.verification === "PASS" ? t.pass : t.fail}</p>
          <p>{t.report(report.rowsDeleted, report.tablesChecked)}</p>
          <p>{t.files(report.files.deleted, report.files.found)}</p>
          {report.remaining.length ? <p>{report.remaining.map(item => `${item.table}: ${item.rows}`).join("، ")}</p> : null}
          {report.files.failedKeys.length ? <div><p>{t.leftover}</p><ul className="list-disc ps-5" dir="ltr">{report.files.failedKeys.map(key => <li key={key}>{key}</li>)}</ul></div> : null}
          <a href="/" className="inline-block font-semibold text-[#0e6b70] underline">{t.home}</a>
        </CardContent>
      </Card>
    );
  }

  // not the owner (or nothing to show yet): no card, and no hint that one exists
  if (preview.error || (!preview.data && !preview.isLoading)) return null;
  if (preview.isLoading) return <Card className="mt-6"><CardContent className="p-6 text-sm text-slate-500">{t.loading}</CardContent></Card>;
  const data = preview.data!;
  const asked = request.data;
  const canDelete = Boolean(asked) && typedName.trim() === asked!.companyName && understood && !confirm.isPending;

  return (
    <Card className="mt-6">
      <CardHeader><CardTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-[#0e6b70]" />{t.title}</CardTitle><p className="text-sm leading-6 text-slate-500">{t.note}</p></CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm">{t.size(data.totalRows, data.tables.filter(item => item.rows > 0).length, data.files)}</p>
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/api/tenant-export/${tenantId}`} download className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">{t.download}</a>
          <Button type="button" variant="outline" onClick={() => void preview.refetch()}>{t.refresh}</Button>
        </div>
        <p className="text-xs text-slate-500">{t.downloadNote} {data.lastExportAt ? t.lastExport(new Date(data.lastExportAt).toLocaleString(pickLanguage(language, { ar: "ar-SA", en: "en-GB", ur: "ur-PK-u-nu-latn" }))) : t.noExport}</p>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <h3 className="flex items-center gap-2 font-semibold text-red-800"><ShieldAlert className="h-5 w-5" />{t.danger}</h3>
          {!data.exportFresh ? <p className="mt-2 text-sm text-red-900">{t.needExport}</p> : !asked ? (
            <div className="mt-3"><Button type="button" variant="destructive" disabled={request.isPending} onClick={() => request.mutate({ tenantId })}>{request.isPending ? t.asking : t.ask}</Button></div>
          ) : (
            <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); if (canDelete) confirm.mutate({ tenantId, confirmationToken: asked.confirmationToken, typedName, understandsItCannotBeUndone: true }); }}>
              <p className="text-sm text-red-900">{t.warn(asked.totalRows, asked.files, asked.peopleKept)}</p>
              <div className="space-y-2"><Label htmlFor="delete-company-name">{t.nameLabel}</Label><Input id="delete-company-name" autoComplete="off" value={typedName} onChange={event => setTypedName(event.target.value)} placeholder={asked.companyName} /><p className="text-xs text-red-900">{t.typeName(asked.companyName)}</p></div>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={understood} onChange={event => setUnderstood(event.target.checked)} className="mt-1" />{t.understand}</label>
              <p className="text-xs text-red-900">{t.expires}</p>
              {confirm.error ? <p role="alert" className="text-sm font-medium text-red-700">{getLocalizedProjectError(confirm.error, language)}</p> : null}
              <Button type="submit" variant="destructive" disabled={!canDelete}>{confirm.isPending ? t.deleting : t.deleteNow}</Button>
            </form>
          )}
          {request.error ? <p role="alert" className="mt-2 text-sm font-medium text-red-700">{getLocalizedProjectError(request.error, language)}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
