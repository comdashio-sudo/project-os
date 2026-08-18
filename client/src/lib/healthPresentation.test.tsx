import { describe, expect, it } from "vitest";
import { localizedHealthException, parseStoredHealthExceptions, parseStoredHealthSources } from "./healthPresentation";

describe("health exception presentation", () => {
  it("يتجاهل الرسائل وخطط العمل الخام ويحفظ الرموز والشدة فقط", () => {
    const exceptions = parseStoredHealthExceptions('[{"code":"CPI_CRITICAL","severity":"critical","message":"RAW SERVER MESSAGE","recommendedAction":"RAW SERVER ACTION"}]');

    expect(exceptions).toEqual([{ code: "CPI_CRITICAL", severity: "critical" }]);
    expect(JSON.stringify(exceptions)).not.toContain("RAW SERVER MESSAGE");
  });

  it("يقدم نص الاستثناء وخطة التعافي بالعربية والإنجليزية", () => {
    const item = { code: "CPI_CRITICAL", severity: "critical" as const };

    expect(localizedHealthException(item, false)).toMatchObject({ message: "Cost performance is below the critical control threshold.", severity: "critical" });
    expect(localizedHealthException(item, true)).toMatchObject({ message: "مؤشر أداء التكلفة دون حد التحكم الحرج.", severity: "critical" });
  });

  it("يعالج الحمولة غير الصالحة بأمان دون عرضها", () => {
    expect(parseStoredHealthExceptions("not-json")).toEqual([]);
    expect(parseStoredHealthExceptions('[{"code":7,"severity":"critical","message":"RAW"}]')).toEqual([]);
  });

  it("يستخرج عدادات RFI وNCR وHSE المتأخرة ويصفر الحمولة غير الصالحة", () => {
    expect(parseStoredHealthSources('{"overdueRfiCount":3,"overdueNcrCount":2,"overdueHseCount":1,"untrusted":"RAW"}')).toEqual({ overdueRfiCount: 3, overdueNcrCount: 2, overdueHseCount: 1 });
    expect(parseStoredHealthSources('{"overdueRfiCount":-1,"overdueNcrCount":-1,"overdueHseCount":-1}')).toEqual({ overdueRfiCount: 0, overdueNcrCount: 0, overdueHseCount: 0 });
    expect(parseStoredHealthSources("not-json")).toEqual({ overdueRfiCount: 0, overdueNcrCount: 0, overdueHseCount: 0 });
  });
});
