import { pickLanguage, resolveLanguage, type Language } from "./language";
type StoredHealthException = { code: string; severity: "warning" | "critical" };
type StoredHealthSources = { overdueRfiCount: number; overdueNcrCount: number; overdueHseCount: number };

const messages = {
  CPI_CRITICAL: { ar: ["مؤشر أداء التكلفة دون حد التحكم الحرج.", "تحقق من تكلفة الإكمال وافتح إجراءً لاستعادة التكلفة."], en: ["Cost performance is below the critical control threshold.", "Validate cost to complete and open a cost-recovery action."], ur: ["لاگت کی کارکردگی اہم کنٹرول کی حد سے نیچے ہے۔", "مکمل ہونے تک کی لاگت کی تصدیق کریں اور لاگت کی بحالی کا اقدام شروع کریں۔"] },
  CPI_WARNING: { ar: ["مؤشر أداء التكلفة دون خط الأساس المعتمد.", "راقب انحراف التكلفة وتحقق من افتراضات التوقع."], en: ["Cost performance is below the approved baseline.", "Monitor cost variance and validate forecast assumptions."], ur: ["لاگت کی کارکردگی منظور شدہ بنیادی لائن سے نیچے ہے۔", "لاگت کے انحراف کی نگرانی کریں اور متوقع مفروضوں کی تصدیق کریں۔"] },
  SPI_CRITICAL: { ar: ["مؤشر أداء الجدول دون حد التحكم الحرج.", "راجع الأنشطة الحرجة وانشر خطة تعافٍ."], en: ["Schedule performance is below the critical control threshold.", "Review critical activities and publish a recovery plan."], ur: ["شیڈول کی کارکردگی اہم کنٹرول کی حد سے نیچے ہے۔", "اہم سرگرمیوں کا جائزہ لیں اور بحالی کا منصوبہ جاری کریں۔"] },
  SPI_WARNING: { ar: ["مؤشر أداء الجدول دون خط الأساس المعتمد.", "راجع قيود النظرة المستقبلية وخيارات التعافي."], en: ["Schedule performance is below the approved baseline.", "Review lookahead constraints and recovery options."], ur: ["شیڈول کی کارکردگی منظور شدہ بنیادی لائن سے نیچے ہے۔", "آگے کی منصوبہ بندی کی رکاوٹوں اور بحالی کے اختیارات کا جائزہ لیں۔"] },
  EAC_OVER_BAC: { ar: ["التكلفة المتوقعة عند الإتمام تتجاوز الميزانية المعتمدة.", "صعّد انحراف التوقع واعتمد قرار تمويل أو تعافٍ."], en: ["Forecast cost at completion exceeds the approved budget.", "Escalate the forecast variance and approve a recovery or funding decision."], ur: ["مکمل ہونے پر متوقع لاگت منظور شدہ بجٹ سے زیادہ ہے۔", "متوقع انحراف کو اوپر بھیجیں اور بحالی یا فنڈنگ کا فیصلہ منظور کریں۔"] },
  HIGH_RISK: { ar: ["توجد مخاطر عالية التعرض تحتاج إلى تخفيف نشط.", "راجع الملاك والمحركات والتعرض المتبقي."], en: ["High-exposure risks require active mitigation.", "Review owners, triggers, and residual exposure."], ur: ["زیادہ تعرض والے خطرات کو فعال تخفیف کی ضرورت ہے۔", "ذمہ داروں، محرکات اور باقی تعرض کا جائزہ لیں۔"] },
  OVERDUE_ACTION: { ar: ["توجد إجراءات تجاوزت تاريخ استحقاقها.", "صعّد الملاك وحدد تاريخًا مراجعًا بدليل."], en: ["Actions have exceeded their due dates.", "Escalate owners and set a revised due date with evidence."], ur: ["کچھ اقدامات اپنی آخری تاریخ گزار چکے ہیں۔", "ذمہ داروں کو اوپر بھیجیں اور ثبوت کے ساتھ نئی آخری تاریخ طے کریں۔"] },
  OVERDUE_APPROVAL: { ar: ["تجاوزت موافقة واحدة على الأقل مستوى الخدمة.", "صعّد مهمة سير العمل إلى المعتمد المعيّن."], en: ["At least one approval has exceeded its service level.", "Escalate the workflow task to its designated approver."], ur: ["کم از کم ایک منظوری اپنی سروس کی سطح سے آگے نکل چکی ہے۔", "ورک فلو کا کام اس کے نامزد منظور کنندہ کو اوپر بھیجیں۔"] },
  OVERDUE_RFI: { ar: ["تجاوز طلب معلومات واحد على الأقل تاريخ الاستحقاق.", "راجع المسؤول عن المراجعة وأثر الجدول."], en: ["At least one RFI is overdue.", "Review the responsible reviewer and schedule impact."], ur: ["کم از کم ایک RFI کی مدت گزر چکی ہے۔", "ذمہ دار جائزہ کار اور شیڈول پر اثر کا جائزہ لیں۔"] },
  OVERDUE_NCR: { ar: ["تجاوز تقرير عدم مطابقة واحد على الأقل تاريخ الاستحقاق.", "تحقق من مالك الإجراء التصحيحي ودليل الإغلاق."], en: ["At least one NCR is overdue.", "Verify corrective-action ownership and closure evidence."], ur: ["کم از کم ایک NCR کی مدت گزر چکی ہے۔", "اصلاحی اقدام کی ذمہ داری اور بندش کے ثبوت کی تصدیق کریں۔"] },
  OVERDUE_HSE: { ar: ["تجاوزت ملاحظة HSE واحدة على الأقل تاريخ الاستحقاق.", "تحقق من مالك المعالجة ودليل الإغلاق."], en: ["At least one HSE observation is overdue.", "Verify remediation ownership and closure evidence."], ur: ["کم از کم ایک HSE مشاہدہ کی مدت گزر چکی ہے۔", "اصلاح کی ذمہ داری اور بندش کے ثبوت کی تصدیق کریں۔"] },
} as const;

export function parseStoredHealthExceptions(value: string): StoredHealthException[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StoredHealthException => typeof item === "object" && item !== null && typeof (item as { code?: unknown }).code === "string" && ["warning", "critical"].includes((item as { severity?: unknown }).severity as string)).map(item => ({ code: item.code, severity: item.severity }));
  } catch { return []; }
}

export function parseStoredHealthSources(value: string): StoredHealthSources {
  try {
    const parsed: unknown = JSON.parse(value);
    const source = parsed as { overdueRfiCount?: unknown; overdueNcrCount?: unknown; overdueHseCount?: unknown } | null;
    const overdueRfiCount = typeof source?.overdueRfiCount === "number" && Number.isInteger(source.overdueRfiCount) && source.overdueRfiCount >= 0 ? source.overdueRfiCount : 0;
    const overdueNcrCount = typeof source?.overdueNcrCount === "number" && Number.isInteger(source.overdueNcrCount) && source.overdueNcrCount >= 0 ? source.overdueNcrCount : 0;
    const overdueHseCount = typeof source?.overdueHseCount === "number" && Number.isInteger(source.overdueHseCount) && source.overdueHseCount >= 0 ? source.overdueHseCount : 0;
    return { overdueRfiCount, overdueNcrCount, overdueHseCount };
  } catch { return { overdueRfiCount: 0, overdueNcrCount: 0, overdueHseCount: 0 }; }
}

export function localizedHealthException(item: StoredHealthException, language: Language | boolean) {
  const lang = resolveLanguage(language);
  const localized = messages[item.code as keyof typeof messages];
  const fallback = pickLanguage(lang, {
    ar: ["استثناء صحة يحتاج إلى مراجعة.", "راجع سجل المشروع وحدد إجراء معالجة موثقًا."],
    en: ["A health exception requires review.", "Review the project register and define a documented corrective action."],
    ur: ["صحت کی ایک استثنائی صورتِ حال کو جائزے کی ضرورت ہے۔", "پروجیکٹ کا رجسٹر دیکھیں اور دستاویزی اصلاحی اقدام طے کریں۔"],
  });
  const [message, recommendation] = localized ? localized[lang] : fallback;
  return { message, recommendation, severity: item.severity };
}
