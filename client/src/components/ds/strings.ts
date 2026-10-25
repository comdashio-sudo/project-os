import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";

// The words the shared components themselves print (never a screen's own text). Three languages, the same keys in each.
const dictionary = {
  ar: {
    dropTitle: "اسحب الملف وأفلته هنا", dropOr: "أو", dropChoose: "اختر ملفاً", dropReplace: "استبدال الملف", dropRemove: "إزالة", dropActive: "أفلت الملف الآن",
    dropTooBig: "حجم الملف أكبر من الحد المسموح", dropBadType: "نوع الملف غير مدعوم", dropUploading: "جارٍ الرفع", dropDone: "تم الرفع", dropFailed: "فشل الرفع",
    dropLimit: "الحد الأقصى", dropTypes: "الأنواع", selectPlaceholder: "اختر", selectEmpty: "لا خيارات",
    learnMore: "اعرف المزيد", close: "إغلاق", loading: "جارٍ التحميل", stepOf: "الخطوة", of: "من", done: "مكتملة", current: "الحالية",
    empty: "لا يوجد شيء هنا بعد", menu: "القائمة", collapse: "طي القائمة", expand: "توسيع القائمة", userMenu: "قائمة المستخدم", signOut: "تسجيل الخروج",
    company: "الشركة", project: "المشروع", language: "اللغة", theme: "المظهر", light: "فاتح", dark: "داكن", home: "الرئيسية", navigation: "التنقل الرئيسي",
    breadcrumb: "مسار التنقل", required: "مطلوب", optional: "اختياري", cancel: "إلغاء", confirm: "تأكيد", notifications: "الإشعارات", rowsEmpty: "لا توجد صفوف",
  },
  en: {
    dropTitle: "Drag the file here and drop it", dropOr: "or", dropChoose: "Choose a file", dropReplace: "Replace the file", dropRemove: "Remove", dropActive: "Drop the file now",
    dropTooBig: "The file is larger than the limit", dropBadType: "This file type is not supported", dropUploading: "Uploading", dropDone: "Uploaded", dropFailed: "Upload failed",
    dropLimit: "Limit", dropTypes: "Types", selectPlaceholder: "Choose", selectEmpty: "No options",
    learnMore: "Learn more", close: "Close", loading: "Loading", stepOf: "Step", of: "of", done: "Done", current: "Current",
    empty: "Nothing here yet", menu: "Menu", collapse: "Collapse the menu", expand: "Expand the menu", userMenu: "User menu", signOut: "Sign out",
    company: "Company", project: "Project", language: "Language", theme: "Appearance", light: "Light", dark: "Dark", home: "Home", navigation: "Main navigation",
    breadcrumb: "Breadcrumb", required: "Required", optional: "Optional", cancel: "Cancel", confirm: "Confirm", notifications: "Notifications", rowsEmpty: "No rows",
  },
  ur: {
    dropTitle: "فائل یہاں کھینچ کر چھوڑیں", dropOr: "یا", dropChoose: "فائل منتخب کریں", dropReplace: "فائل بدلیں", dropRemove: "ہٹائیں", dropActive: "اب فائل چھوڑ دیں",
    dropTooBig: "فائل مقررہ حد سے بڑی ہے", dropBadType: "اس قسم کی فائل معاون نہیں", dropUploading: "اپ لوڈ ہو رہی ہے", dropDone: "اپ لوڈ ہو گئی", dropFailed: "اپ لوڈ ناکام",
    dropLimit: "زیادہ سے زیادہ", dropTypes: "اقسام", selectPlaceholder: "منتخب کریں", selectEmpty: "کوئی انتخاب نہیں",
    learnMore: "مزید جانیں", close: "بند کریں", loading: "لوڈ ہو رہا ہے", stepOf: "مرحلہ", of: "از", done: "مکمل", current: "موجودہ",
    empty: "یہاں ابھی کچھ نہیں", menu: "مینو", collapse: "مینو سمیٹیں", expand: "مینو پھیلائیں", userMenu: "صارف مینو", signOut: "سائن آؤٹ",
    company: "کمپنی", project: "پروجیکٹ", language: "زبان", theme: "ظاہری شکل", light: "روشن", dark: "گہرا", home: "ہوم", navigation: "مرکزی نیویگیشن",
    breadcrumb: "راستہ", required: "ضروری", optional: "اختیاری", cancel: "منسوخ", confirm: "تصدیق", notifications: "اطلاعات", rowsEmpty: "کوئی صف نہیں",
  },
};

export const useDsText = () => pickLanguage(useLanguage().language, dictionary);
export const dsDictionary = dictionary;
