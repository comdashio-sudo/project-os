import { describe, expect, it } from "vitest";
import { localizedHealthException, parseStoredHealthExceptions } from "./healthPresentation";

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
});
