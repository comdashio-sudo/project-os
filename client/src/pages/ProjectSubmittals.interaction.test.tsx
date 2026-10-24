/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectSubmittals from "./ProjectSubmittals";

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const h = vi.hoisted(() => ({ language: "en" as "ar" | "en" | "ur", canWrite: true, canReply: true, create: vi.fn(), send: vi.fn(), reply: vi.fn(), close: vi.fn(), error: null as unknown }));
const base = { revision: 0, replyNote: null, materialId: null, pmcUnitId: null, pmcActivityDefinitionId: null };
const rows = () => [
  { ...base, id: "s1", submittalType: "shop_drawing", submittalNumber: "SD-1", title: "Facade shop drawings", status: "replied", consultant: "Alpha", sentAt: day(12), dueAt: day(5), repliedAt: day(2), replyCode: "A", daysAtConsultant: 10, overdue: false, approved: true },
  { ...base, id: "s2", submittalType: "shop_drawing", submittalNumber: "SD-2", title: "Roof detail", status: "replied", consultant: "Alpha", sentAt: day(9), dueAt: null, repliedAt: day(1), replyCode: "C", daysAtConsultant: 8, overdue: false, approved: false },
  { ...base, id: "s3", submittalType: "material_approval", submittalNumber: "MA-1", title: "Porcelain tile", status: "sent", consultant: "Beta", sentAt: day(20), dueAt: day(10), repliedAt: null, replyCode: null, daysAtConsultant: 20, overdue: true, approved: null },
  { ...base, id: "s4", submittalType: "method_statement", submittalNumber: "MS-1", title: "Concrete method", status: "draft", consultant: null, sentAt: null, dueAt: null, repliedAt: null, replyCode: null, daysAtConsultant: null, overdue: false, approved: null },
];
const codes = [
  { code: "A", labelAr: "معتمد", labelEn: "Approved", approved: true, active: true }, { code: "B", labelAr: "معتمد بملاحظات", labelEn: "Approved as noted", approved: true, active: true },
  { code: "C", labelAr: "أعد التقديم", labelEn: "Revise and resubmit", approved: false, active: true }, { code: "D", labelAr: "مرفوض", labelEn: "Rejected", approved: false, active: true },
];
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()], Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));
vi.mock("@/components/ExportExcelButton", () => ({ ExportExcelButton: ({ rows: exported }: { rows: unknown[] }) => <button type="button">export {exported.length}</button> }));
vi.mock("@/lib/permissions", () => ({ WriteGate: ({ permission, children, reason }: { permission: string[]; children: React.ReactNode; reason?: { en: string } }) => ((permission.includes("project.design.approve") ? h.canReply : h.canWrite) ? <>{children}</> : reason ? <p>{reason.en}</p> : null) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "localized error" }));
vi.mock("@/lib/trpc", () => {
  const mutation = (name: "create" | "send" | "reply" | "close") => ({ useMutation: (config: { onSuccess?: () => void }) => ({ mutate: (input: unknown) => { h[name](input); config.onSuccess?.(); }, isPending: false, error: h.error }) });
  return { trpc: {
    useUtils: () => ({ submittals: { list: { invalidate: vi.fn() } } }),
    submittals: { list: { useQuery: () => ({ data: rows(), isLoading: false, error: null, refetch: vi.fn() }) }, replyCodes: { useQuery: () => ({ data: codes, isLoading: false, error: null, refetch: vi.fn() }) }, create: mutation("create"), send: mutation("send"), reply: mutation("reply"), close: mutation("close") },
    materials: { list: { useQuery: () => ({ data: [{ id: "m1", code: "TILE-1", description: "Porcelain tile" }], isLoading: false, error: null, refetch: vi.fn() }) } },
  } };
});

beforeEach(() => { h.language = "en"; h.canWrite = true; h.canReply = true; h.error = null; for (const key of ["create", "send", "reply", "close"] as const) h[key].mockReset(); });
afterEach(cleanup);
const card = (number: string) => document.querySelector(`[data-submittal="${number}"]`) as HTMLElement;

describe("ProjectSubmittals", () => {
  it("shows the register with age and overdue, and the tiles add up", () => {
    render(<ProjectSubmittals />);
    expect(document.querySelectorAll("[data-submittal]")).toHaveLength(4);
    expect(card("MA-1").textContent).toContain("20 d · Overdue");
    expect(card("SD-1").textContent).toContain("Answered · A");
    expect(card("SD-1").textContent).toContain("counts as an approval");
    expect(card("SD-2").textContent).toContain("does not count as an approval");
    const tiles = screen.getByRole("region", { name: "Total" });
    expect(tiles.textContent).toContain("Total4"); expect(tiles.textContent).toContain("With the consultant1"); expect(tiles.textContent).toContain("Overdue1");
    expect(tiles.textContent).toContain("Average days with the consultant13 d"); // (10 + 8 + 20) / 3
    expect(tiles.textContent).toContain("Approved, of those answered50%");
  });

  it("the distribution is per consultant and per the company's codes, with those still waiting", () => {
    render(<ProjectSubmittals />);
    const table = document.querySelector("[data-distribution]") as HTMLTableElement;
    expect(Array.from(table.querySelectorAll("thead th"), th => th.textContent)).toEqual(["Consultant", "A", "B", "C", "D", "Awaiting reply", "Total"]);
    const line = (name: string) => Array.from(within(table).getByText(name).closest("tr")!.querySelectorAll("th,td"), cell => cell.textContent);
    expect(line("Alpha")).toEqual(["Alpha", "1", "0", "1", "0", "0", "2"]);
    expect(line("Beta")).toEqual(["Beta", "0", "0", "0", "0", "1", "1"]);
    expect(line("No consultant")).toEqual(["No consultant", "0", "0", "0", "0", "1", "1"]);
  });

  it("filters by status, type, consultant, overdue and text; the distribution follows the filters", () => {
    render(<ProjectSubmittals />);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "replied" } });
    expect(document.querySelectorAll("[data-submittal]")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Consultant"), { target: { value: "Alpha" } });
    fireEvent.change(screen.getByLabelText("Search by number or title"), { target: { value: "roof" } });
    expect(Array.from(document.querySelectorAll("[data-submittal]"), li => li.getAttribute("data-submittal"))).toEqual(["SD-2"]);
    expect(within(document.querySelector("[data-distribution]") as HTMLElement).queryByText("Beta")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search by number or title"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Consultant"), { target: { value: "all" } });
    fireEvent.click(screen.getByLabelText("Overdue only"));
    expect(Array.from(document.querySelectorAll("[data-submittal]"), li => li.getAttribute("data-submittal"))).toEqual(["MA-1"]);
    fireEvent.click(screen.getByLabelText("Overdue only"));
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "method_statement" } });
    expect(Array.from(document.querySelectorAll("[data-submittal]"), li => li.getAttribute("data-submittal"))).toEqual(["MS-1"]);
    fireEvent.change(screen.getByLabelText("Search by number or title"), { target: { value: "zzz" } });
    expect(screen.getByText("No submittal matches the filters.")).toBeTruthy();
  });

  it("each row offers only the step it is at: send a draft, answer a sent one with the company's codes, close or resubmit an answered one", () => {
    render(<ProjectSubmittals />);
    fireEvent.click(within(card("MS-1")).getByText("Send to the consultant"));
    expect(h.send).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", submittalId: "s4" });
    expect(within(card("MA-1")).queryByText("Send to the consultant")).toBeNull();
    fireEvent.click(within(card("MA-1")).getByText("Record the reply"));
    const form = card("MA-1").querySelector("[data-reply-form]") as HTMLElement;
    const select = within(form).getByLabelText("Reply code") as HTMLSelectElement;
    expect(Array.from(select.options, option => option.value)).toEqual(["A", "B", "C", "D"]);
    fireEvent.change(select, { target: { value: "B" } });
    fireEvent.change(within(form).getByLabelText("Reply note"), { target: { value: "Use the matt finish" } });
    fireEvent.click(within(form).getByText("Save the reply"));
    expect(h.reply).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", submittalId: "s3", replyCode: "B", replyNote: "Use the matt finish" });
    fireEvent.click(within(card("SD-1")).getByText("Close"));
    expect(h.close).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", submittalId: "s1" });
    expect(within(card("SD-1")).queryByText("Resubmit (new revision)")).toBeNull(); // an approval is not resubmitted
    fireEvent.click(within(card("SD-2")).getByText("Resubmit (new revision)"));
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ resubmissionOfId: "s2", submittalNumber: "SD-2", submittalType: "shop_drawing" }));
  });

  it("creates a submittal; a material approval must name its material", () => {
    render(<ProjectSubmittals />);
    const save = screen.getByText("Create submittal").closest("button") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Submittal number"), { target: { value: "SD-3" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Stair rails" } });
    fireEvent.change(screen.getByLabelText("Sent to (consultant)"), { target: { value: "Gamma" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ submittalType: "shop_drawing", submittalNumber: "SD-3", title: "Stair rails", consultant: "Gamma" }));
    expect(screen.getByText("Submittal created")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Submittal type"), { target: { value: "material_approval" } });
    fireEvent.change(screen.getByLabelText("Submittal number"), { target: { value: "MA-2" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Tile" } });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Material"), { target: { value: "m1" } });
    expect(save.disabled).toBe(false);
  });

  it("a person who may not write sees the register but none of the buttons; one who may write but not answer sees no reply button", () => {
    h.canWrite = false; h.canReply = false;
    const first = render(<ProjectSubmittals />);
    expect(screen.getByText("Your role does not allow creating submittals.")).toBeTruthy();
    expect(screen.queryByText("Send to the consultant")).toBeNull(); expect(screen.queryByText("Record the reply")).toBeNull(); expect(screen.queryByText("Close")).toBeNull();
    first.unmount(); h.canWrite = true; h.canReply = false;
    render(<ProjectSubmittals />);
    expect(screen.getByText("Send to the consultant")).toBeTruthy(); expect(screen.queryByText("Record the reply")).toBeNull();
  });

  it.each([["ar", "سجل تسليمات الاستشاري", "rtl"], ["en", "Consultant submittals register", "ltr"], ["ur", "کنسلٹنٹ کی سبمٹلز کا رجسٹر", "rtl"]] as const)("%s: the title and the direction", (language, title, dir) => {
    h.language = language;
    const { container } = render(<ProjectSubmittals />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
    expect(container.querySelector("main")!.getAttribute("dir")).toBe(dir);
  });
});
