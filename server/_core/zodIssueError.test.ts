import { describe, expect, it } from "vitest";
import { zodIssueError } from "./trpc";

// A refused request names the first refused rule: a rule whose message is a catalogue code gives that code (the person sees the exact
// reason), any other rule gives the generic "check the marked field" message, never the English text of the schema.
describe("refused input is answered with a catalogue message", () => {
  it("gives the code a schema rule carries, so a short name with a capital letter says what is wrong", () => {
    expect(zodIssueError("PROJECT_OS_WORKSPACE_SLUG_FORMAT").code).toBe("PROJECT_OS_WORKSPACE_SLUG_FORMAT");
    expect(zodIssueError("PROJECT_OS_WORKSPACE_SLUG_FORMAT").messages.ur).toContain("fanaa");
  });

  it("gives the generic translated message for a rule without a catalogue code, and never the English schema text", () => {
    const generic = zodIssueError("Invalid input: expected string, received undefined");
    expect(generic.code).toBe("PROJECT_OS_INPUT_INVALID");
    expect(generic.messages.ar).toBe("تحقق من الحقل المحدد ثم أعد المحاولة.");
    expect(generic.messages.ur).toBe("نشان زدہ فیلڈ چیک کریں اور دوبارہ کوشش کریں۔");
  });
});
