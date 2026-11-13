import type { inferRouterOutputs } from "@trpc/server";
import React from "react";
import { useOptionalLanguage } from "@/contexts/optionalLanguage";
import { pickLanguage, resolveLanguage } from "@/lib/language";
import type { AppRouter } from "../../../server/routers";

// The differences preview of an import, before anything is written: new / modified (old → new) / unchanged / conflict / absent from the file. Shared by the master-data importer
// and the operational one (costs, purchase orders, employees, hours). Rows absent from the file are listed and never deleted: an import does not delete.
type DiffData = Extract<inferRouterOutputs<AppRouter>["dataImports"]["diff"], { supported: true }>;
const dictionary = {
  ar: { diffTitle: "معاينة الفروق قبل الحفظ", diffNew: "جديد", diffModified: "معدَّل", diffUnchanged: "بلا تغيير", diffConflict: "تعارض", diffMissing: "غائب عن الملف (لا يُحذف)", diffOld: "القديم", diffNewValue: "الجديد", diffMore: "تُعرض أول الصفوف فقط؛ العدد الكامل أعلاه.", diffConflictNote: "تعارض: تغيّر هذا الصف في المنصة بعد التصدير أو أُعيد ترميزه في الملف. لن يُكتب. صدِّر الملف من جديد.", diffNoChanges: "لا تغييرات: كل الصفوف مطابقة لما هو محفوظ.", diffApprove: "ما تراه أعلاه هو ما سيُكتب بالضبط عند التأكيد.", diffMissingNote: "صفوف موجودة في المنصة وغير موجودة في هذا الملف: لن تُحذف. الاستيراد لا يحذف أي سجل أبدًا؛ إن أردت حذف أحدها فاحذفه من داخل المنصة.", } as Record<string, string>,
  en: { diffTitle: "Differences preview before saving", diffNew: "New", diffModified: "Modified", diffUnchanged: "Unchanged", diffConflict: "Conflict", diffMissing: "Absent from the file (never deleted)", diffOld: "Old", diffNewValue: "New", diffMore: "Only the first rows are shown; the full count is above.", diffConflictNote: "Conflict: this row changed in the platform after the export, or was re-keyed in the file. It will not be written. Export again.", diffNoChanges: "No changes: every row matches what is stored.", diffApprove: "What you see above is exactly what will be written when you confirm.", diffMissingNote: "Rows that exist in the platform but are not in this file will NOT be deleted. An import never deletes a record; to remove one, delete it inside the platform.", } as Record<string, string>, ur: { diffTitle: "محفوظ کرنے سے پہلے فرق کا پیش منظر", diffNew: "نیا", diffModified: "ترمیم شدہ", diffUnchanged: "بغیر تبدیلی", diffConflict: "تضاد", diffMissing: "فائل میں موجود نہیں (کبھی حذف نہیں ہوتا)", diffOld: "پرانا", diffNewValue: "نیا", diffMore: "صرف پہلی قطاریں دکھائی گئی ہیں؛ مکمل تعداد اوپر ہے۔", diffConflictNote: "تضاد: یہ قطار برآمد کے بعد پلیٹ فارم میں بدل گئی، یا فائل میں اس کی کلید دوبارہ لکھی گئی۔ یہ لکھی نہیں جائے گی۔ دوبارہ برآمد کریں۔", diffNoChanges: "کوئی تبدیلی نہیں: ہر قطار محفوظ ڈیٹا سے مطابقت رکھتی ہے۔", diffApprove: "اوپر جو آپ دیکھ رہے ہیں، تصدیق پر بالکل وہی لکھا جائے گا۔", diffMissingNote: "جو قطاریں پلیٹ فارم میں موجود ہیں لیکن اس فائل میں نہیں، وہ حذف نہیں ہوں گی۔ درآمد کبھی کوئی ریکارڈ حذف نہیں کرتی؛ کسی ریکارڈ کو ہٹانے کے لیے اسے پلیٹ فارم کے اندر حذف کریں۔", } as Record<string, string>,
};

/** The reason a row cannot be written, in words. A code that has no sentence here is shown as it is. */
export const conflictReasons: Record<"ar" | "en" | "ur", Record<string, string>> = {
  ar: {
    VERSION_CHANGED: "تغيّر هذا الصف في المنصة بعد التصدير.", ID_KEY_MISMATCH: "هذا الصف لا يطابق سجلًا في المنصة (أُعيد ترميزه أو لم يعد موجودًا).",
    COST_ENTRY_READ_ONLY: "التكلفة المرحَّلة لا تُعدَّل من الملف.", PO_NOT_DRAFT: "أمر الشراء خرج من المسودة: يُعدَّل من مساره لا من الملف.", PO_STATUS_READ_ONLY: "حالة أمر الشراء لا تُغيَّر من الملف.",
    TIME_ENTRY_READ_ONLY: "اليوم المسجَّل لا يُعدَّل من الملف.", EMPLOYEE_READ_ONLY: "سجل موظف منتهٍ أو مؤرشف لا يُعدَّل من الملف.", EMPLOYEE_TERMINATION_NOT_BY_IMPORT: "إنهاء الخدمة يتم من شاشة الموارد البشرية لا من الملف.",
  },
  en: {
    VERSION_CHANGED: "This row changed in the platform after the export.", ID_KEY_MISMATCH: "This row matches no record in the platform (it was re-keyed or no longer exists).",
    COST_ENTRY_READ_ONLY: "A posted cost is not edited from a file.", PO_NOT_DRAFT: "The purchase order has left draft: it is changed in its workflow, not from a file.", PO_STATUS_READ_ONLY: "A purchase order's status is not changed from a file.",
    TIME_ENTRY_READ_ONLY: "A booked day is not edited from a file.", EMPLOYEE_READ_ONLY: "A terminated or archived employee record is not edited from a file.", EMPLOYEE_TERMINATION_NOT_BY_IMPORT: "Termination is done on the HR screen, not from a file.",
  }, ur: {
    VERSION_CHANGED: "ایکسپورٹ کے بعد پلیٹ فارم پر یہ قطار تبدیل ہو گئی ہے۔", ID_KEY_MISMATCH: "یہ قطار پلیٹ فارم کے کسی ریکارڈ سے نہیں ملتی (اس کی کلید دوبارہ درج ہوئی ہے یا وہ اب موجود نہیں)۔",
    COST_ENTRY_READ_ONLY: "درج شدہ لاگت فائل سے تبدیل نہیں کی جاتی۔", PO_NOT_DRAFT: "خریداری کا آرڈر مسودے سے آگے جا چکا ہے: یہ اپنے ورک فلو میں تبدیل ہوتا ہے، فائل سے نہیں۔", PO_STATUS_READ_ONLY: "خریداری کے آرڈر کی حیثیت فائل سے تبدیل نہیں ہوتی۔",
    TIME_ENTRY_READ_ONLY: "درج شدہ دن فائل سے تبدیل نہیں ہوتا۔", EMPLOYEE_READ_ONLY: "ختم شدہ یا محفوظ شدہ ملازم کا ریکارڈ فائل سے تبدیل نہیں ہوتا۔", EMPLOYEE_TERMINATION_NOT_BY_IMPORT: "ملازمت ختم کرنا HR اسکرین پر ہوتا ہے، فائل سے نہیں۔",
  },
};

export function ImportDiffPreview({ diff, isArabic, fieldLabel }: { diff: DiffData; isArabic: boolean; fieldLabel?: (field: string) => string | undefined }) {
  const lang = useOptionalLanguage() ?? resolveLanguage(isArabic);
  const t = dictionary[lang];
  const reason = conflictReasons[lang];
  const label = (field: string) => fieldLabel?.(field) ?? field;
  const kindLabel = (kind: string) => (kind === "new" ? t.diffNew : kind === "modified" ? t.diffModified : t.diffConflict);
  const kindClass = (kind: string) => (kind === "new" ? "bg-emerald-100 text-emerald-800" : kind === "modified" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800");
  const noChanges = diff.summary.new === 0 && diff.summary.modified === 0 && diff.summary.conflict === 0;
  return (
    <div className="mt-3 rounded-[var(--radius-sm)] border border-border bg-background p-3" data-testid="import-diff">
      <p className="font-semibold">{t.diffTitle}</p>
      <p className="mt-1">{t.diffNew}: {diff.summary.new} · {t.diffModified}: {diff.summary.modified} · {t.diffUnchanged}: {diff.summary.unchanged} · {t.diffConflict}: {diff.summary.conflict} · {t.diffMissing}: {diff.summary.missing}</p>
      {noChanges && <p className="mt-1 text-muted-foreground">{t.diffNoChanges}</p>}
      {diff.summary.conflict > 0 && <p role="alert" className="mt-1 text-red-700">{t.diffConflictNote}</p>}
      {diff.entries.some(entry => entry.kind === "conflict") && <ul className="mt-1 space-y-0.5 text-red-700">{diff.entries.filter(entry => entry.kind === "conflict").map(entry => <li key={`${entry.rowNumber}-reason`}>#{entry.rowNumber} · {entry.key} — {reason[entry.conflict ?? ""] ?? entry.conflict}</li>)}</ul>}
      {diff.entries.length > 0 && <div className="mt-2 overflow-x-auto"><table className="w-full text-start text-xs"><thead><tr className="text-muted-foreground"><th className="p-1 text-start">#</th><th className="p-1 text-start">{pickLanguage(lang, { ar: "المفتاح", en: "Key", ur: "کلید" })}</th><th className="p-1 text-start">{pickLanguage(lang, { ar: "الحالة", en: "Status", ur: "حیثیت" })}</th><th className="p-1 text-start">{pickLanguage(lang, { ar: "الحقل", en: "Field", ur: "فیلڈ" })}</th><th className="p-1 text-start">{t.diffOld}</th><th className="p-1 text-start">{t.diffNewValue}</th></tr></thead><tbody>
        {diff.entries.flatMap(entry => (entry.changes.length ? entry.changes : [{ field: "", oldValue: "", newValue: "" }]).map((change, index) => (
          <tr key={`${entry.rowNumber}-${index}`} className="border-t border-border"><td className="p-1">{index === 0 ? entry.rowNumber : ""}</td><td className="p-1">{index === 0 ? entry.key : ""}</td><td className="p-1">{index === 0 ? <span className={`rounded-full px-2 py-0.5 ${kindClass(entry.kind)}`}>{kindLabel(entry.kind)}</span> : ""}</td><td className="p-1">{label(change.field)}</td><td className="p-1">{entry.kind === "modified" ? change.oldValue : ""}</td><td className="p-1">{entry.kind === "conflict" ? "" : change.newValue}</td></tr>
        )))}
      </tbody></table></div>}
      {diff.shownTotal > diff.entries.length + diff.offset && <p className="mt-1 text-muted-foreground">{t.diffMore}</p>}
      {diff.missing.length > 0 && <div className="mt-2 rounded-[var(--radius-sm)] border border-border bg-muted/40 p-2" data-testid="import-diff-missing"><p className="font-medium">{t.diffMissingNote}</p><p className="mt-1 text-muted-foreground">{t.diffMissing}: {diff.missing.map(row => row.key).join("، ")}{diff.missingTotal > diff.missing.length ? " …" : ""}</p></div>}
      <p className="mt-2 font-medium">{t.diffApprove}</p>
    </div>
  );
}
