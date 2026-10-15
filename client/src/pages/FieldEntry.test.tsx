/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FieldEntry from "./FieldEntry";

const state = vi.hoisted(() => ({
  arabic: false, query: {} as Record<string, unknown>, progress: vi.fn(), issue: vi.fn(), refetch: vi.fn(), issueError: null as unknown,
  progressError: null as unknown, sheet: { data: undefined, isLoading: false, error: null } as Record<string, unknown>, sheetCalls: vi.fn(), team: vi.fn(), teamResult: { saved: 0, errors: [] } as { saved: number; errors: Array<{ index: number; assignmentId: string; code: string }> },
  teamError: null as unknown, sheetRefetch: vi.fn(), sent: vi.fn(), receipt: vi.fn(), receiptError: null as unknown, sendError: null as unknown, me: { id: 7 } as { id: number } | null,
}));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  auth: { me: { useQuery: () => ({ data: state.me }) } },
  fieldEntry: { context: { useQuery: () => ({ ...state.query, refetch: state.refetch }) } },
  useUtils: () => ({ client: { progress: { create: { mutate: (input: unknown) => { state.sent("progress", input); return state.sendError ? Promise.reject(state.sendError) : Promise.resolve({}); } } }, warehouses: { issueToWork: { mutate: (input: unknown) => { state.sent("issue", input); return Promise.resolve({}); } } }, teamHours: { save: { mutate: (input: unknown) => { state.sent("team", input); return Promise.resolve({ saved: 1, errors: [] }); } } }, goodsReceipts: { create: { mutate: (input: unknown) => { state.sent("receipt", input); return Promise.resolve({}); } } } } }),
  goodsReceipts: { create: { useMutation: (options: { onSuccess: () => void; onError: (error: unknown, variables: unknown) => void }) => ({ mutate: (input: unknown) => { state.receipt(input); if (state.receiptError) options.onError(state.receiptError, input); else options.onSuccess(); }, isPending: false, error: state.receiptError }) } },
  teamHours: {
    sheet: { useQuery: (input: unknown) => { state.sheetCalls(input); return { ...state.sheet, refetch: state.sheetRefetch }; } },
    save: { useMutation: (options: { onSuccess: (result: unknown, variables: unknown) => void; onError: (error: unknown, variables: unknown) => void }) => ({ mutate: (input: unknown) => { state.team(input); if (state.teamError) options.onError(state.teamError, input); else options.onSuccess(state.teamResult, input); }, isPending: false, error: state.teamError }) },
  },
  progress: { create: { useMutation: (options: { onSuccess: () => void; onError: (error: unknown, variables: unknown) => void }) => ({ mutate: (input: unknown) => { state.progress(input); if (state.progressError) options.onError(state.progressError, input); else options.onSuccess(); }, isPending: false, error: state.progressError }) } },
  warehouses: { issueToWork: { useMutation: (options: { onSuccess: () => void }) => ({ mutate: (input: unknown) => { state.issue(input); if (!state.issueError) options.onSuccess(); }, isPending: false, error: state.issueError }) } },
} }));

const context = {
  warehouses: [{ id: "w1", code: "WH-1", name: "Main" }],
  materials: [
    { id: "m1", code: "CEM", description: "Cement", unitOfMeasure: "bag", lastUnitCost: 18.5, timesIssued: 4, onHand: [{ warehouseId: "w1", quantity: 120 }] },
    { id: "m2", code: "NEW", description: "Never issued", unitOfMeasure: "m", lastUnitCost: null, timesIssued: 0, onHand: [{ warehouseId: "w1", quantity: 0 }] },
  ],
  wbs: [{ id: "x1", code: "1", name: "Foundations", lastPercent: 40, lastMeasuredAt: new Date() }, { id: "x2", code: "2", name: "Structure", lastPercent: null, lastMeasuredAt: null }],
  lastIssuedWbsItemId: "x2",
  can: { logProgress: true, issueMaterial: true },
};
const load = (data: unknown = context) => { state.query = { data, isLoading: false, error: null }; render(<FieldEntry />); };
afterEach(() => { cleanup(); state.arabic = false; state.query = {}; state.issueError = null; state.progressError = null; state.teamError = null; state.receiptError = null; state.sendError = null; state.me = { id: 7 }; state.sheet = { data: undefined, isLoading: false, error: null }; state.teamResult = { saved: 0, errors: [] }; vi.clearAllMocks(); try { localStorage.clear(); } catch { /* jsdom storage */ } });

describe("FieldEntry (phone entry)", () => {
  it("logs progress in three taps: pick the item, choose the percentage, save", () => {
    load();
    fireEvent.click(screen.getByText("1 · Foundations")); // tap 1
    fireEvent.click(screen.getByText("75%")); // tap 2
    fireEvent.click(screen.getByText("Save")); // tap 3
    expect(state.progress).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", projectId: "p", wbsItemId: "x1", percentComplete: 75 }));
    expect(screen.getByRole("status").textContent).toContain("Saved: 1 · Foundations → 75%");
    expect(screen.getByText("Record another")).toBeTruthy();
  });

  it("cannot save progress before a percentage is chosen, and steps by five from the last value", () => {
    load();
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("1 · Foundations"));
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("+5"));
    expect(screen.getByText("45%")).toBeTruthy();
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(false);
  });

  it("issues material with the last unit cost, the last work item and the first warehouse already filled in", () => {
    load();
    fireEvent.click(screen.getByText("Issue material"));
    fireEvent.click(screen.getByText("CEM · Cement")); // tap 1
    expect((screen.getByLabelText("Unit cost") as HTMLInputElement).value).toBe("18.5");
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "10" } }); // typing
    expect(screen.getByText("185.00")).toBeTruthy();
    fireEvent.click(screen.getByText("Save")); // tap 2
    expect(state.issue).toHaveBeenCalledWith(expect.objectContaining({ warehouseId: "w1", materialId: "m1", wbsItemId: "x2", issuedQuantity: 10, unitCost: 18.5 }));
    expect(screen.getByRole("status").textContent).toContain("Issued: 10 bag CEM to 2");
  });

  it("asks for a unit cost the first time a material is issued and never saves a zero or empty quantity", () => {
    load();
    fireEvent.click(screen.getByText("Issue material"));
    fireEvent.click(screen.getByText("NEW · Never issued"));
    expect((screen.getByLabelText("Unit cost") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "5" } });
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Unit cost"), { target: { value: "7" } });
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "0" } });
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the form and shows the error when the issue is refused", () => {
    state.issueError = new Error("refused");
    load();
    fireEvent.click(screen.getByText("Issue material"));
    fireEvent.click(screen.getByText("CEM · Cement"));
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "500" } });
    fireEvent.click(screen.getByText("Save"));
    expect(screen.getByRole("alert").textContent).toContain("could not complete");
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe("500");
  });

  it("makes every button and field at least 44px high", () => {
    load();
    const tooSmall = Array.from(document.querySelectorAll("button, input, select")).filter(node => !/min-h-\[44px\]/.test(node.getAttribute("class") ?? ""));
    expect(tooSmall.map(node => node.outerHTML.slice(0, 80))).toEqual([]);
    fireEvent.click(screen.getByText("Issue material"));
    fireEvent.click(screen.getByText("CEM · Cement"));
    const tooSmallIssue = Array.from(document.querySelectorAll("button, input, select")).filter(node => !/min-h-\[44px\]/.test(node.getAttribute("class") ?? ""));
    expect(tooSmallIssue.map(node => node.outerHTML.slice(0, 80))).toEqual([]);
  });

  it("shows loading, error with retry, and the empty cases", () => {
    state.query = { data: undefined, isLoading: true, error: null };
    const loading = render(<FieldEntry />);
    expect(screen.getByText("Loading…")).toBeTruthy();
    loading.unmount();
    state.query = { data: undefined, isLoading: false, error: new Error("x") };
    const failed = render(<FieldEntry />);
    fireEvent.click(screen.getByText("Retry"));
    expect(state.refetch).toHaveBeenCalledTimes(1);
    failed.unmount();
    load({ ...context, wbs: [] });
    expect(screen.getByText("This project has no work items yet.")).toBeTruthy();
  });

  it("renders in Arabic, right to left", () => {
    state.arabic = true;
    load();
    expect(screen.getByText("إدخال سريع من الموقع")).toBeTruthy();
    expect(screen.getByText("تسجيل تقدم")).toBeTruthy();
    expect(document.querySelector("main")?.getAttribute("dir")).toBe("rtl");
  });

  it("offers only what the role may do: a storekeeper lands on issue with progress disabled, and a role with neither sees why", () => {
    load({ ...context, can: { logProgress: false, issueMaterial: true } });
    expect((screen.getByRole("tab", { name: "Log progress" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("tab", { name: "Issue material" }).getAttribute("aria-selected")).toBe("true");
    cleanup();
    load({ ...context, can: { logProgress: false, issueMaterial: false } });
    expect(screen.getByRole("alert").textContent).toContain("Your role does not allow");
    expect(screen.queryByText("Save")).toBeNull();
  });
});

const QUEUE_KEY = "projectOs.offlineQueue.v1:7:t:p"; // person 7, tenant t, project p
const queued = () => JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as Array<{ id: string; kind: string; status: string; error?: string; payload: Record<string, unknown> }>;
const setOnline = (value: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
const sheet = {
  workDate: new Date("2026-10-15T00:00:00.000Z"),
  rows: [
    { assignmentId: "a1", employeeNumber: "E-1", fullName: "Worker One", wbsCode: "1", attendanceApproved: true, entered: null },
    { assignmentId: "a2", employeeNumber: "E-2", fullName: "Worker Two", wbsCode: "1", attendanceApproved: true, entered: null },
    { assignmentId: "a3", employeeNumber: "E-3", fullName: "Worker Three", wbsCode: "1", attendanceApproved: false, entered: null },
    { assignmentId: "a4", employeeNumber: "E-4", fullName: "Worker Four", wbsCode: "2", attendanceApproved: true, entered: { hours: 6, status: "draft" } },
  ],
};
const withTeam = { ...context, can: { ...context.can, logTeamHours: true } };

describe("FieldEntry: requests that survive a lost connection (G-033)", () => {
  afterEach(() => setOnline(true));

  it("keeps a progress save on the phone when the network fails, under the identifier it was sent with", () => {
    state.progressError = new TypeError("Failed to fetch");
    load();
    fireEvent.click(screen.getByText("1 · Foundations")); fireEvent.click(screen.getByText("75%")); fireEvent.click(screen.getByText("Save"));
    const sentId = (state.progress.mock.calls[0][0] as { clientRequestId: string }).clientRequestId;
    expect(sentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(queued()).toMatchObject([{ id: sentId, kind: "progress", status: "pending" }]);
    expect(screen.getByText(/Saved on this phone/)).toBeTruthy();
    expect(screen.getByTestId("queue-status").textContent).toContain("1 waiting to send");
  });

  it("does not queue an answer from the server: a refusal is shown, not kept", () => {
    state.progressError = Object.assign(new Error("PROJECT_OS_PERMISSION_DENIED"), { data: { code: "FORBIDDEN" } });
    load();
    fireEvent.click(screen.getByText("1 · Foundations")); fireEvent.click(screen.getByText("75%")); fireEvent.click(screen.getByText("Save"));
    expect(queued()).toEqual([]);
    expect(screen.getByRole("alert").textContent).toContain("could not complete");
  });

  it("says so, and does not pretend, when the phone cannot keep the request", () => {
    state.progressError = new TypeError("Failed to fetch");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    load();
    fireEvent.click(screen.getByText("1 · Foundations")); fireEvent.click(screen.getByText("75%")); fireEvent.click(screen.getByText("Save"));
    setItem.mockRestore();
    expect(screen.getByRole("alert").textContent).toContain("Could not keep it on this phone");
    expect(screen.queryByText(/Saved on this phone/)).toBeNull();
  });

  it("sends what is waiting by itself, in the original identifier, with its dates restored", async () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111", kind: "progress", payload: { tenantId: "t", projectId: "p", wbsItemId: "x1", percentComplete: 60, reportedAt: "2026-10-15T08:00:00.000Z" }, summary: "1 → 60%", createdAt: "2026-10-15T08:00:00.000Z", status: "pending" }]));
    load();
    await waitFor(() => expect(state.sent).toHaveBeenCalledTimes(1));
    const [kind, input] = state.sent.mock.calls[0] as [string, { clientRequestId: string; reportedAt: Date }];
    expect(kind).toBe("progress");
    expect(input.clientRequestId).toBe("11111111-1111-4111-8111-111111111111");
    expect(input.reportedAt).toBeInstanceOf(Date);
    await waitFor(() => expect(queued()).toEqual([]));
  });

  it("shows offline, waits, and sends when the connection returns", async () => {
    setOnline(false);
    localStorage.setItem(QUEUE_KEY, JSON.stringify([{ id: "22222222-2222-4222-8222-222222222222", kind: "issue", payload: { tenantId: "t", projectId: "p", warehouseId: "w1", materialId: "m1", wbsItemId: "x1", issuedQuantity: 3, unitCost: 5, issuedAt: "2026-10-15T08:00:00.000Z" }, summary: "Issued: 3 bag CEM to 1", createdAt: "2026-10-15T08:00:00.000Z", status: "pending" }]));
    load();
    expect(screen.getByTestId("queue-status").textContent).toContain("Offline · 1 waiting to send");
    expect((screen.getByText("Send now") as HTMLButtonElement).disabled).toBe(true);
    expect(state.sent).not.toHaveBeenCalled();
    setOnline(true);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(state.sent).toHaveBeenCalledWith("issue", expect.objectContaining({ clientRequestId: "22222222-2222-4222-8222-222222222222", issuedAt: expect.any(Date) })));
    await waitFor(() => expect(screen.getByTestId("queue-status").textContent).toBe("Online"));
  });

  it("keeps a request the server refused as failed, with the reason in the user's language, and lets it be discarded", async () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([{ id: "33333333-3333-4333-8333-333333333333", kind: "team", payload: {}, summary: "Team hours 2026-10-15: 2 rows", createdAt: "2026-10-15T08:00:00.000Z", status: "failed", error: "PROJECT_OS_ATTENDANCE_APPROVAL_REQUIRED" }]));
    load();
    expect(screen.getByText("Requests the server refused")).toBeTruthy();
    expect(screen.getByText("Team hours 2026-10-15: 2 rows")).toBeTruthy();
    expect(state.sent).not.toHaveBeenCalled(); // a failed item is not sent again by itself
    fireEvent.click(screen.getByText("Discard"));
    expect(queued()).toEqual([]);
  });

  it("opens from the last data saved on the phone when the connection is gone", () => {
    setOnline(false);
    localStorage.setItem("fieldEntry:context:t:p", JSON.stringify(context));
    state.query = { data: undefined, isLoading: false, error: null };
    render(<FieldEntry />);
    expect(screen.getByText(/last data saved on the phone/)).toBeTruthy();
    expect(screen.getByText("1 · Foundations")).toBeTruthy();
  });
});

describe("FieldEntry: team hours in one go (G-030)", () => {
  const loadTeam = (over: Record<string, unknown> = {}) => { state.sheet = { data: sheet, isLoading: false, error: null, ...over }; load(withTeam); fireEvent.click(screen.getByRole("tab", { name: "Team hours" })); };

  it("offers the team tab only to a role that may enter team hours", () => {
    load();
    expect(screen.queryByRole("tab", { name: "Team hours" })).toBeNull();
    cleanup();
    load(withTeam);
    expect(screen.getByRole("tab", { name: "Team hours" })).toBeTruthy();
  });

  it("fills 8 hours for everyone whose attendance is approved and saves the whole team with one tap", () => {
    state.teamResult = { saved: 2, errors: [] };
    loadTeam();
    expect((screen.getByLabelText("hours E-1") as HTMLInputElement).value).toBe("8");
    expect((screen.getByLabelText("E-3 Worker Three") as HTMLInputElement).disabled).toBe(true); // attendance not approved
    expect(screen.getByText(/Attendance not approved yet/)).toBeTruthy();
    expect(screen.getByText(/Entered: 6 hours/)).toBeTruthy(); // already entered: read only, no hours box
    expect(screen.queryByLabelText("hours E-4")).toBeNull();
    fireEvent.click(screen.getByText("Save team hours (2)"));
    expect(state.team).toHaveBeenCalledTimes(1);
    expect(state.team).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", projectId: "p", entries: [{ assignmentId: "a1", actualHours: 8 }, { assignmentId: "a2", actualHours: 8 }], clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/) }));
    expect(screen.getByText(/Hours saved: 2 rows/)).toBeTruthy();
    expect(state.sheetRefetch).toHaveBeenCalled();
  });

  it("sends the changed hours and leaves out the rows that were unticked", () => {
    loadTeam();
    fireEvent.change(screen.getByLabelText("hours E-1"), { target: { value: "6.5" } });
    fireEvent.click(screen.getByLabelText("E-2 Worker Two")); // untick
    fireEvent.click(screen.getByText("Save team hours (1)"));
    expect(state.team).toHaveBeenCalledWith(expect.objectContaining({ entries: [{ assignmentId: "a1", actualHours: 6.5 }] }));
  });

  it("cannot save a row with zero or more than 24 hours", () => {
    loadTeam();
    fireEvent.change(screen.getByLabelText("hours E-1"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("hours E-2"), { target: { value: "25" } });
    expect((screen.getByText("Save team hours") as HTMLButtonElement).disabled).toBe(true);
  });

  it("names every wrong row when the server saved nothing, and does not say saved", () => {
    state.teamResult = { saved: 0, errors: [{ index: 1, assignmentId: "a2", code: "PROJECT_OS_ATTENDANCE_APPROVAL_REQUIRED" }] };
    loadTeam();
    fireEvent.click(screen.getByText("Save team hours (2)"));
    expect(screen.getByRole("alert").textContent).toContain("Nothing was saved");
    expect(screen.getByRole("alert").textContent).toContain("E-2 · Worker Two");
    expect(screen.queryByText(/Hours saved/)).toBeNull();
  });

  it("keeps the whole sheet on the phone when the network fails, and reuses the same identifier", () => {
    state.teamError = new TypeError("Failed to fetch");
    loadTeam();
    fireEvent.click(screen.getByText("Save team hours (2)"));
    const sentId = (state.team.mock.calls[0][0] as { clientRequestId: string }).clientRequestId;
    expect(queued()).toMatchObject([{ id: sentId, kind: "team", status: "pending" }]);
    expect(screen.getByText(/Saved on this phone.*: 2 rows/)).toBeTruthy();
  });

  it("shows an empty day plainly, and the last saved sheet when offline", () => {
    state.sheet = { data: { workDate: new Date(), rows: [] }, isLoading: false, error: null };
    load(withTeam);
    fireEvent.click(screen.getByRole("tab", { name: "Team hours" }));
    expect(screen.getByText("No assignment covers this day.")).toBeTruthy();
    cleanup();
    setOnline(false);
    const iso = new Date(); const day = `${iso.getFullYear()}-${String(iso.getMonth() + 1).padStart(2, "0")}-${String(iso.getDate()).padStart(2, "0")}`;
    localStorage.setItem(`fieldEntry:sheet:p:${day}`, JSON.stringify(sheet));
    state.sheet = { data: undefined, isLoading: false, error: null };
    load(withTeam);
    fireEvent.click(screen.getByRole("tab", { name: "Team hours" }));
    expect(screen.getByText("E-1 · Worker One")).toBeTruthy();
    setOnline(true);
  });

  it("renders the team tab in Arabic", () => {
    state.arabic = true;
    state.sheet = { data: sheet, isLoading: false, error: null };
    load(withTeam);
    fireEvent.click(screen.getByRole("tab", { name: "ساعات الفريق" }));
    expect(screen.getByText("حفظ ساعات الفريق (2)")).toBeTruthy();
  });

  it("keeps every control in the team tab at least 44px", () => {
    loadTeam();
    const tooSmall = Array.from(document.querySelectorAll("button, input, select")).filter(node => !/min-h-\[44px\]/.test(node.getAttribute("class") ?? ""));
    expect(tooSmall.map(node => node.outerHTML.slice(0, 80))).toEqual([]);
  });
});

describe("FieldEntry: receiving against a purchase order (G-031)", () => {
  const withReceive = { ...context, can: { ...context.can, receiveMaterial: true }, purchaseOrders: [{ id: "po1", purchaseOrderNumber: "PO-1", supplierName: "Supplier One", currency: "SAR", hasCommitment: true, lastReceivedMaterialId: "m1" }] };
  const open = (data: unknown = withReceive) => { load(data); fireEvent.click(screen.getByRole("tab", { name: "Receive material" })); };

  it("offers the receive tab only to a role that may receive", () => {
    load();
    expect(screen.queryByRole("tab", { name: "Receive material" })).toBeNull();
    cleanup();
    load(withReceive);
    expect(screen.getByRole("tab", { name: "Receive material" })).toBeTruthy();
  });

  it("receives in one quantity entry: the single order and the last-received material are already chosen, the last price fills the cost", () => {
    open();
    expect((screen.getByLabelText("Pick the material") as HTMLSelectElement).value).toBe("m1");
    expect((screen.getByLabelText("Unit cost") as HTMLInputElement).placeholder).toBe("18.5");
    fireEvent.change(screen.getByLabelText(/Quantity received/), { target: { value: "10" } });
    expect(screen.getByText("185.00")).toBeTruthy(); // 10 x 18.5
    fireEvent.click(screen.getByText("Save"));
    expect(state.receipt).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", projectId: "p", purchaseOrderId: "po1", materialId: "m1", receivedQuantity: 10, rejectedQuantity: 0, unitCost: 18.5, unitOfMeasure: "bag", grnNumber: expect.stringMatching(/^GRN-\d{8}-\d{6}-[0-9A-F]{4}$/), clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/) }));
    expect(screen.getByRole("status").textContent).toContain("Saved: Received: 10 bag CEM from PO-1");
  });

  it("cannot save without a quantity, and a typed cost beats the last price", () => {
    open();
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Quantity received/), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Unit cost"), { target: { value: "20" } });
    fireEvent.click(screen.getByText("Save"));
    expect(state.receipt).toHaveBeenCalledWith(expect.objectContaining({ receivedQuantity: 4, unitCost: 20 }));
  });

  it("keeps the receipt on the phone when the network fails, with the receipt number and identifier it was sent with", () => {
    state.receiptError = new TypeError("Failed to fetch");
    open();
    fireEvent.change(screen.getByLabelText(/Quantity received/), { target: { value: "10" } });
    fireEvent.click(screen.getByText("Save"));
    const sent = state.receipt.mock.calls[0][0] as { clientRequestId: string; grnNumber: string };
    expect(queued()).toMatchObject([{ id: sent.clientRequestId, kind: "receipt", status: "pending", payload: { grnNumber: sent.grnNumber, purchaseOrderId: "po1" } }]);
    expect(screen.getByText(/Saved on this phone/)).toBeTruthy();
  });

  it("sends a queued receipt when the connection returns, dates restored", async () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([{ id: "44444444-4444-4444-8444-444444444444", kind: "receipt", payload: { tenantId: "t", projectId: "p", grnNumber: "GRN-X", purchaseOrderId: "po1", materialId: "m1", receivedQuantity: 3, rejectedQuantity: 0, unitCost: 18.5, unitOfMeasure: "bag", receivedAt: "2026-10-15T08:00:00.000Z" }, summary: "Received: 3 bag", createdAt: "2026-10-15T08:00:00.000Z", status: "pending" }]));
    load();
    await waitFor(() => expect(state.sent).toHaveBeenCalledWith("receipt", expect.objectContaining({ clientRequestId: "44444444-4444-4444-8444-444444444444", grnNumber: "GRN-X", receivedAt: expect.any(Date) })));
  });

  it("says plainly when no purchase order is issued, shows the server's refusal, and renders in Arabic with 44px controls", () => {
    open({ ...withReceive, purchaseOrders: [] });
    expect(screen.getByText("This project has no issued purchase orders.")).toBeTruthy();
    cleanup();
    open({ ...withReceive, purchaseOrders: [{ ...withReceive.purchaseOrders[0] }, { ...withReceive.purchaseOrders[0], id: "po2", purchaseOrderNumber: "PO-2", lastReceivedMaterialId: null }] });
    expect(screen.getByText("Pick the purchase order")).toBeTruthy(); // two orders: the person chooses
    const tooSmall = Array.from(document.querySelectorAll("button, input, select")).filter(node => !/min-h-\[44px\]/.test(node.getAttribute("class") ?? ""));
    expect(tooSmall.map(node => node.outerHTML.slice(0, 80))).toEqual([]);
    cleanup();
    state.arabic = true;
    load(withReceive);
    expect(screen.getByRole("tab", { name: "استلام مواد" })).toBeTruthy();
  });

describe("FieldEntry: the queue keeps trying, without looping (hardening)", () => {
  const pendingItem = { id: "55555555-5555-4555-8555-555555555555", kind: "progress", payload: { tenantId: "t", projectId: "p", wbsItemId: "x1", percentComplete: 60, reportedAt: "2026-10-15T08:00:00.000Z" }, summary: "1 → 60%", createdAt: "2026-10-15T08:00:00.000Z", status: "pending" };
  afterEach(() => { vi.useRealTimers(); });

  it("does not re-send in a loop while the server stays unreachable (one attempt per trigger, even though the client object changes on every render)", async () => {
    state.sendError = new TypeError("Failed to fetch");
    localStorage.setItem(QUEUE_KEY, JSON.stringify([pendingItem]));
    load();
    await waitFor(() => expect(state.sent).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
    expect(state.sent).toHaveBeenCalledTimes(1);
    expect(queued()).toMatchObject([{ id: pendingItem.id, status: "pending" }]); // still kept
  });

  it("tries again every 30 seconds while something waits and the phone believes it is online, and stops once it got through", async () => {
    vi.useFakeTimers();
    state.sendError = new TypeError("Failed to fetch");
    localStorage.setItem(QUEUE_KEY, JSON.stringify([pendingItem]));
    load();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(state.sent).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(state.sent).toHaveBeenCalledTimes(2);
    state.sendError = null; // the server is back
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(state.sent).toHaveBeenCalledTimes(3);
    expect(queued()).toEqual([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(state.sent).toHaveBeenCalledTimes(3); // nothing left to send, no more attempts
  });

  it("sends a corrected team sheet under a new identifier after the server answered with row errors", () => {
    state.teamResult = { saved: 0, errors: [{ index: 0, assignmentId: "a1", code: "PROJECT_OS_ATTENDANCE_APPROVAL_REQUIRED" }] };
    state.sheet = { data: sheet, isLoading: false, error: null };
    load(withTeam);
    fireEvent.click(screen.getByRole("tab", { name: "Team hours" }));
    fireEvent.click(screen.getByText("Save team hours (2)"));
    const first = (state.team.mock.calls[0][0] as { clientRequestId: string }).clientRequestId;
    state.teamResult = { saved: 1, errors: [] };
    fireEvent.click(screen.getByLabelText("E-1 Worker One")); // correct the sheet: leave E-1 out
    fireEvent.click(screen.getByText("Save team hours (1)"));
    const second = (state.team.mock.calls[1][0] as { clientRequestId: string }).clientRequestId;
    expect(second).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).not.toBe(first); // the old identifier would have replayed the stored errors
  });
});

describe("FieldEntry: one person's queue is not another's", () => {
  it("does not send what person 7 left waiting when person 8 signs in on the same phone, and still sends it for person 7", async () => {
    localStorage.setItem("projectOs.offlineQueue.v1:7:t:p", JSON.stringify([{ id: "66666666-6666-4666-8666-666666666666", kind: "progress", payload: { tenantId: "t", projectId: "p", wbsItemId: "x1", percentComplete: 20, reportedAt: "2026-10-15T08:00:00.000Z" }, summary: "1 → 20%", createdAt: "2026-10-15T08:00:00.000Z", status: "pending" }]));
    state.me = { id: 8 };
    load();
    await act(async () => { await Promise.resolve(); });
    expect(state.sent).not.toHaveBeenCalled(); // person 8 sees an empty queue and sends nothing of person 7's
    expect(screen.getByTestId("queue-status").textContent).toBe("Online");
    cleanup();
    state.me = { id: 7 };
    load();
    await waitFor(() => expect(state.sent).toHaveBeenCalledTimes(1)); // person 7's own queue goes out under person 7
  });
  it("keeps nothing offline, and says so, until the signed-in person is known", () => {
    state.me = null; state.progressError = new TypeError("Failed to fetch");
    load();
    fireEvent.click(screen.getByText("1 · Foundations")); fireEvent.click(screen.getByText("75%")); fireEvent.click(screen.getByText("Save"));
    expect(screen.getByRole("alert").textContent).toContain("Could not keep it on this phone");
    expect(Object.keys(localStorage).filter(key => key.startsWith("projectOs.offlineQueue"))).toEqual([]);
  });
});
});
