import { describe, expect, it } from "vitest";
import { requiresMandatoryHumanEscalation, validateKnowledgeBackedSupportReply } from "./supportAutoReply";

describe("validateKnowledgeBackedSupportReply", () => {
  const allowed = new Set(["article-a", "article-b"]);

  it("accepts an answer only when every citation is an approved knowledge source", () => {
    expect(validateKnowledgeBackedSupportReply({ reply: "Use the approved membership workflow.", citations: ["article-a"], shouldEscalate: false }, allowed)).toEqual({ reply: "Use the approved membership workflow.", citations: ["article-a"], shouldEscalate: false });
  });

  it("rejects an unknown citation and keeps the caller on the safe escalation path", () => {
    expect(validateKnowledgeBackedSupportReply({ reply: "Unverified answer", citations: ["foreign-article"], shouldEscalate: false }, allowed)).toBeNull();
  });

  it("accepts an explicit escalation when the cited source is within the allowed set", () => {
    expect(validateKnowledgeBackedSupportReply({ reply: "A specialist should review this case.", citations: ["article-b"], shouldEscalate: true }, allowed)).toMatchObject({ shouldEscalate: true, citations: ["article-b"] });
  });

  it("requires human escalation for commercial, commitment, and repair-time requests in both supported languages", () => {
    expect(requiresMandatoryHumanEscalation("Can you quote a price and guarantee a repair date?")).toBe(true);
    expect(requiresMandatoryHumanEscalation("هل يمكن عرض سعر أو تحديد موعد إصلاح؟")).toBe(true);
    expect(requiresMandatoryHumanEscalation("How do I assign an approved tenant role?")).toBe(false);
  });
});
