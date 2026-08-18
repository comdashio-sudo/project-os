import { describe, expect, it } from "vitest";
import { nextDocumentStatuses } from "./ProjectDocuments";

describe("document review workflow options", () => {
  it("يعرض فقط الانتقالات المسموحة من حالة المراجعة", () => {
    expect(nextDocumentStatuses("for_review")).toEqual(["draft", "approved"]);
    expect(nextDocumentStatuses("for_review")).not.toContain("archived");
  });

  it("لا يعرض انتقالًا صادرًا من الحالة المؤرشفة النهائية", () => {
    expect(nextDocumentStatuses("archived")).toEqual([]);
  });
});
