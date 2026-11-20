/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportTemplatesList, SaveTemplateForm, SuggestedTemplateCard, templateApplied } from "./ImportTemplates";

// Q-50 batch 2b: the company's column-mapping templates on the import screens. Synthetic names and headers only.
const state = vi.hoisted(() => ({
  reanalyze: vi.fn(), save: vi.fn(), remove: vi.fn(), invalidate: vi.fn(),
  saveState: { isSuccess: false, data: undefined as undefined | { name: string }, error: null as null | unknown },
  removeError: null as null | unknown,
  list: [] as Array<{ id: string; name: string; kind: string; mapping: Record<string, string>; updatedAt: string }>,
}));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ dataImports: { progress: { invalidate: state.invalidate }, diff: { invalidate: state.invalidate }, templates: { invalidate: state.invalidate } } }),
  dataImports: {
    reanalyze: { useMutation: () => ({ mutate: state.reanalyze, isPending: false, error: null }) },
    saveTemplate: { useMutation: () => ({ mutate: state.save, reset: vi.fn(), isPending: false, ...state.saveState }) },
    deleteTemplate: { useMutation: () => ({ mutate: state.remove, reset: vi.fn(), isPending: false, error: state.removeError }) },
    templates: { useQuery: () => ({ data: state.list, error: null }) },
  },
} }));

const template = { id: "tpl-1", name: "Example costs layout", score: 0.86, mapping: { wbsCode: "Ref WBS", amount: "Value" } };
const nameTaken = { data: { projectError: { messages: { ar: "الاسم مستعمل", en: "That name is already used by another template", ur: "یہ نام استعمال ہو چکا ہے" } } } };
beforeEach(() => { state.reanalyze.mockReset(); state.save.mockReset(); state.remove.mockReset(); state.saveState = { isSuccess: false, data: undefined, error: null }; state.removeError = null; state.list = []; });
afterEach(() => cleanup());

describe("SuggestedTemplateCard (Q-50 2b)", () => {
  it("POSITIVE: shows the template and its match, and applying it only analyses again with its columns (the rest ignored) — nothing is confirmed", () => {
    render(<SuggestedTemplateCard tenantId="t-1" projectId="p-1" importId="i-1" template={template} currentMapping={{ amount: "Amount" }} language="en" />);
    expect(screen.getByText(/Example costs layout/)).toBeTruthy();
    expect(screen.getByText("Header match 86%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply the template and analyse again" }));
    expect(state.reanalyze).toHaveBeenCalledWith({ tenantId: "t-1", projectId: "p-1", importId: "i-1", mappingOverride: { wbsCode: "Ref WBS", amount: "Value", __others__: "ignore" } });
  });

  it("NEGATIVE: once the analysis already reads the template's columns, it says so and offers no second apply", () => {
    render(<SuggestedTemplateCard tenantId="t-1" projectId="p-1" importId="i-1" template={template} currentMapping={{ wbsCode: "Ref WBS", amount: "Value", category: "Kind" }} language="en" />);
    expect(screen.getByRole("status").textContent).toBe("The template is applied to this analysis");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("templateApplied: every column the template names must match; no mapping is not applied", () => {
    expect(templateApplied(template, { wbsCode: "Ref WBS", amount: "Value" })).toBe(true);
    expect(templateApplied(template, { wbsCode: "Ref WBS", amount: "Total" })).toBe(false);
    expect(templateApplied(template, undefined)).toBe(false);
  });

  it("speaks Arabic and Urdu too", () => {
    render(<SuggestedTemplateCard tenantId="t-1" projectId="p-1" importId="i-1" template={template} language="ar" />);
    expect(screen.getByRole("button", { name: "طبّق القالب وأعد التحليل" })).toBeTruthy();
    cleanup();
    render(<SuggestedTemplateCard tenantId="t-1" projectId="p-1" importId="i-1" template={template} language="ur" />);
    expect(screen.getByRole("button", { name: "ٹیمپلیٹ لاگو کریں اور دوبارہ تجزیہ کریں" })).toBeTruthy();
  });
});

describe("SaveTemplateForm (Q-50 2b)", () => {
  it("POSITIVE: saves the mapping of this import under the trimmed name, and says it was saved", () => {
    const { rerender } = render(<SaveTemplateForm tenantId="t-1" projectId="p-1" importId="i-1" language="en" />);
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "  Example costs layout  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save the template" }));
    expect(state.save).toHaveBeenCalledWith({ tenantId: "t-1", projectId: "p-1", importId: "i-1", name: "Example costs layout" });
    state.saveState = { isSuccess: true, data: { name: "Example costs layout" }, error: null };
    rerender(<SaveTemplateForm tenantId="t-1" projectId="p-1" importId="i-1" language="en" />);
    expect(screen.getByRole("status").textContent).toContain("Template saved");
  });

  it("NEGATIVE: a name under two characters is not sent; the server's refusal (a name another kind uses) is shown in the person's language", () => {
    const { rerender } = render(<SaveTemplateForm tenantId="t-1" projectId="p-1" importId="i-1" language="en" />);
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: " x " } });
    fireEvent.click(screen.getByRole("button", { name: "Save the template" }));
    expect(state.save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Enter a name of at least two characters.");
    state.saveState = { isSuccess: false, data: undefined, error: nameTaken };
    rerender(<SaveTemplateForm tenantId="t-1" projectId="p-1" importId="i-1" language="en" />);
    expect(screen.getAllByRole("alert").map(node => node.textContent)).toContain("That name is already used by another template");
  });
});

describe("ImportTemplatesList (Q-50 2b)", () => {
  const rows: Array<{ id: string; name: string; kind: string; mapping: Record<string, string>; updatedAt: string }> = [
    { id: "tpl-1", name: "Example costs layout", kind: "costs", mapping: { wbsCode: "Ref WBS", amount: "Value" }, updatedAt: "2026-11-19T10:00:00Z" },
    { id: "tpl-2", name: "Example villa list", kind: "pmc.locations", mapping: { unitNumber: "House" }, updatedAt: "2026-11-19T10:00:00Z" },
  ];

  it("POSITIVE: lists the templates of the kinds asked for, with the kind and field count; delete takes a second, explicit click", () => {
    state.list = rows;
    render(<ImportTemplatesList tenantId="t-1" projectId="p-1" kinds={["costs", "employees"]} kindLabel={kind => ({ costs: "Actual costs" } as Record<string, string>)[kind]} language="en" />);
    expect(screen.getByText("Example costs layout")).toBeTruthy();
    expect(screen.queryByText("Example villa list")).toBeNull();
    expect(screen.getByText("Actual costs · 2 fields")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete: Example costs layout" }));
    expect(state.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(state.remove).toHaveBeenCalledWith({ tenantId: "t-1", projectId: "p-1", templateId: "tpl-1" });
  });

  it("NEGATIVE: cancel deletes nothing; no template says how to get one; a refused delete is shown", () => {
    state.list = rows;
    const { unmount } = render(<ImportTemplatesList tenantId="t-1" projectId="p-1" kindLabel={() => undefined} language="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete: Example villa list" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(state.remove).not.toHaveBeenCalled();
    expect(screen.getByText("pmc.locations · 1 fields")).toBeTruthy();
    unmount();
    state.list = [];
    state.removeError = nameTaken;
    render(<ImportTemplatesList tenantId="t-1" projectId="p-1" kindLabel={() => undefined} language="ar" />);
    expect(screen.getByText(/لا قوالب بعد/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("الاسم مستعمل");
  });
});
