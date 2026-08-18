type StoredHealthException = { code: string; severity: "warning" | "critical" };
type StoredHealthSources = { overdueRfiCount: number; overdueNcrCount: number; overdueHseCount: number };

const messages = {
  CPI_CRITICAL: { ar: ["مؤشر أداء التكلفة دون حد التحكم الحرج.", "تحقق من تكلفة الإكمال وافتح إجراءً لاستعادة التكلفة."], en: ["Cost performance is below the critical control threshold.", "Validate cost to complete and open a cost-recovery action."] },
  CPI_WARNING: { ar: ["مؤشر أداء التكلفة دون خط الأساس المعتمد.", "راقب انحراف التكلفة وتحقق من افتراضات التوقع."], en: ["Cost performance is below the approved baseline.", "Monitor cost variance and validate forecast assumptions."] },
  SPI_CRITICAL: { ar: ["مؤشر أداء الجدول دون حد التحكم الحرج.", "راجع الأنشطة الحرجة وانشر خطة تعافٍ."], en: ["Schedule performance is below the critical control threshold.", "Review critical activities and publish a recovery plan."] },
  SPI_WARNING: { ar: ["مؤشر أداء الجدول دون خط الأساس المعتمد.", "راجع قيود النظرة المستقبلية وخيارات التعافي."], en: ["Schedule performance is below the approved baseline.", "Review lookahead constraints and recovery options."] },
  EAC_OVER_BAC: { ar: ["التكلفة المتوقعة عند الإتمام تتجاوز الميزانية المعتمدة.", "صعّد انحراف التوقع واعتمد قرار تمويل أو تعافٍ."], en: ["Forecast cost at completion exceeds the approved budget.", "Escalate the forecast variance and approve a recovery or funding decision."] },
  HIGH_RISK: { ar: ["توجد مخاطر عالية التعرض تحتاج إلى تخفيف نشط.", "راجع الملاك والمحركات والتعرض المتبقي."], en: ["High-exposure risks require active mitigation.", "Review owners, triggers, and residual exposure."] },
  OVERDUE_ACTION: { ar: ["توجد إجراءات تجاوزت تاريخ استحقاقها.", "صعّد الملاك وحدد تاريخًا مراجعًا بدليل."], en: ["Actions have exceeded their due dates.", "Escalate owners and set a revised due date with evidence."] },
  OVERDUE_APPROVAL: { ar: ["تجاوزت موافقة واحدة على الأقل مستوى الخدمة.", "صعّد مهمة سير العمل إلى المعتمد المعيّن."], en: ["At least one approval has exceeded its service level.", "Escalate the workflow task to its designated approver."] },
  OVERDUE_RFI: { ar: ["تجاوز طلب معلومات واحد على الأقل تاريخ الاستحقاق.", "راجع المسؤول عن المراجعة وأثر الجدول."], en: ["At least one RFI is overdue.", "Review the responsible reviewer and schedule impact."] },
  OVERDUE_NCR: { ar: ["تجاوز تقرير عدم مطابقة واحد على الأقل تاريخ الاستحقاق.", "تحقق من مالك الإجراء التصحيحي ودليل الإغلاق."], en: ["At least one NCR is overdue.", "Verify corrective-action ownership and closure evidence."] },
  OVERDUE_HSE: { ar: ["تجاوزت ملاحظة HSE واحدة على الأقل تاريخ الاستحقاق.", "تحقق من مالك المعالجة ودليل الإغلاق."], en: ["At least one HSE observation is overdue.", "Verify remediation ownership and closure evidence."] },
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

export function localizedHealthException(item: StoredHealthException, isArabic: boolean) {
  const localized = messages[item.code as keyof typeof messages];
  const fallback = isArabic ? ["استثناء صحة يحتاج إلى مراجعة.", "راجع سجل المشروع وحدد إجراء معالجة موثقًا."] : ["A health exception requires review.", "Review the project register and define a documented corrective action."];
  const [message, recommendation] = localized ? localized[isArabic ? "ar" : "en"] : fallback;
  return { message, recommendation, severity: item.severity };
}
