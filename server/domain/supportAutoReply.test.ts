import { describe, expect, it } from "vitest";
import { validateKnowledgeBackedSupportReply } from "./supportAutoReply";

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
});
