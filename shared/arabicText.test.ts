/** @vitest-environment node */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Work order 4, item 7: the Arabic that people read is checked as code is checked. These are the mistakes a review found and the ones that are
// cheap to make again: a missing hamza, a final ه for ة, a technical word where a plain one exists, one thing called two names, Latin punctuation inside
// Arabic. (English words that reach an Arabic reader at run time are found by scripts/audit-arabic-ui.mjs, which needs a browser.)
const repository = join(__dirname, "..");
const roots = [join(repository, "client", "src"), join(repository, "shared"), join(repository, "server")];
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const strings: Array<{ file: string; text: string }> = [];
for (const root of roots) for (const file of sources(root)) {
  const source = readFileSync(file, "utf8");
  for (const match of Array.from(source.matchAll(/(["`'])((?:(?!\1).)*[؀-ۿ](?:(?!\1).)*)\1/g))) if ((match[2].match(/[؀-ۿ]/g) ?? []).length >= 2) strings.push({ file: relative(repository, file), text: match[2] });
}
const tokens = (text: string) => text.match(/[ء-ْ]+/g) ?? [];
const found = (predicate: (token: string) => boolean) => strings.flatMap(({ file, text }) => tokens(text).filter(predicate).map(token => `${file}: ${token} — «${text.slice(0, 60)}»`));

// word → what it should be. Whole tokens only, so «فعّالان» is never mistaken for «الان».
const MISSPELLED: Record<string, string> = {
  انشاء: "إنشاء", اضافة: "إضافة", ارسال: "إرسال", ادارة: "إدارة", الى: "إلى", اعادة: "إعادة", اكمال: "إكمال", ايقاف: "إيقاف", احصائيات: "إحصائيات", اجمالي: "إجمالي", الغاء: "إلغاء",
  اغلاق: "إغلاق", اعدادات: "إعدادات", ادخال: "إدخال", اجراء: "إجراء", اجراءات: "إجراءات", اسباب: "أسباب", امكانية: "إمكانية", اساسي: "أساسي", اولا: "أولًا", اخر: "آخر", اخرى: "أخرى",
  الان: "الآن", لان: "لأن", اكثر: "أكثر", اقل: "أقل", اعلى: "أعلى", ادنى: "أدنى", اذا: "إذا", اما: "أما", الذى: "الذي", فى: "في", حتي: "حتى", متي: "متى", الي: "إلى", علي: "على",
  مسئول: "مسؤول", مسئولية: "مسؤولية", المسئول: "المسؤول", الشركه: "الشركة", المرحله: "المرحلة", الخدمه: "الخدمة", المره: "المرة", الفتره: "الفترة", العمليه: "العملية", الحاله: "الحالة",
  المهمه: "المهمة", الميزانيه: "الميزانية", الكميه: "الكمية", التكلفه: "التكلفة", الفاتوره: "الفاتورة", تاكيد: "تأكيد", التاكيد: "التأكيد", ايام: "أيام", اسبوع: "أسبوع", اشهر: "أشهر",
  ارقام: "أرقام", اخطاء: "أخطاء", المتبقى: "المتبقي", إختيار: "اختيار", إستلام: "استلام", إعتماد: "اعتماد", إضافه: "إضافة", مورّد: "مورد", المورّد: "المورد", الموردين: "الموردين",
};
// tokens that look misspelled but are right (an imperative, a name), listed so the list above can stay strict
const FINE = new Set(["الموردين", "ادخل"]);

describe("the Arabic text of the product", () => {
  it("scans the screens, shared messages and server texts (the scan is not vacuous)", () => {
    expect(strings.length).toBeGreaterThan(2000);
  });

  it("has no missing hamza, no final ه for ة, and no other common misspelling", () => {
    expect(found(token => token in MISSPELLED && !FINE.has(token))).toEqual([]);
  });

  it("calls the customer «الشركة»: «المستأجر» is database jargon and does not reach a reader", () => {
    expect(strings.filter(({ text }) => /المستأجر|المستأجرين/.test(text)).map(({ file, text }) => `${file}: ${text.slice(0, 70)}`)).toEqual([]);
  });

  it("calls the customer one thing, «الشركة», not also «المؤسسة» (the enterprise as a product audience may still be «المؤسسات»)", () => {
    const offenders = strings.filter(({ text }) => /(?:ضمن|داخل|هذه|إدارة|مسؤول|أعضاء وأدوار|كتالوج|دعوة|وصول|لهذه|عضوية|نطاق) (?:هذه )?المؤسسة|المؤسسية/.test(text)).map(({ file, text }) => `${file}: ${text.slice(0, 70)}`);
    expect(offenders).toEqual([]);
  });

  it("calls a site request for materials «طلب مواد» everywhere (it was «طلب التوريد» in some places and «طلب مواد» in others)", () => {
    expect(strings.filter(({ text }) => /طلب(ات)? التوريد/.test(text)).map(({ file, text }) => `${file}: ${text.slice(0, 70)}`)).toEqual([]);
  });

  it("uses no Latin comma, question mark or doubled space inside a run of Arabic words", () => {
    const offenders = strings.flatMap(({ file, text }) => {
      const arabic = text.replace(/\$\{[^}]*\}/g, "٠").replace(/<[^>]*>/g, "");
      return [/[ء-ي]\s*,\s*[ء-ي]/.test(arabic) ? "Latin comma" : "", /[ء-ي]\s*\?\s*$/.test(arabic) ? "Latin question mark" : "", /[ء-ي] {2,}[ء-ي]/.test(arabic) ? "double space" : ""].filter(Boolean).map(kind => `${file}: ${kind} — «${text.slice(0, 60)}»`);
    });
    expect(offenders).toEqual([]);
  });
});
