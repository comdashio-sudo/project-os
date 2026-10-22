// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MasterPlanCanvas, MasterPlanEntityTools, MasterPlanVersionTools, SnapshotShareToggle, type ToolsEntity } from "./MasterPlanTools";

const hoisted = vi.hoisted(() => ({ state: { arabic: true, calls: {} as Record<string, ReturnType<typeof vi.fn>> }, mutation: (name: string) => ({ useMutation: () => ({ mutate: hoisted.state.calls[name] ?? (hoisted.state.calls[name] = vi.fn()), isPending: false, error: null }) }) }));
const { state } = hoisted;
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "localized" }));
vi.mock("@/lib/trpc", () => ({ trpc: { masterPlans: { setVersionGeometry: hoisted.mutation("setVersionGeometry"), updateEntityLayout: hoisted.mutation("updateEntityLayout"), setSnapshotSharing: hoisted.mutation("setSnapshotSharing") } } }));

const entity = (id: string, code: string, parent: string | null, extra: Partial<ToolsEntity> = {}): ToolsEntity => ({ id, code, name: `Name ${code}`, parentEntityId: parent, geometry: JSON.stringify({ x: 10, y: 10, width: 25, height: 20 }), status: "in_progress", progressPercent: 40, plannedValue: 1000, actualValue: 900, wbsItemId: "w1", activityId: "a1", ...extra });
beforeEach(() => { state.arabic = true; state.calls = {}; });
afterEach(cleanup);

describe("MasterPlanVersionTools", () => {
  it("saves the rotation and the real size of the plan, and turns by 90° from the buttons", async () => {
    const user = userEvent.setup(); const saved = vi.fn();
    render(<MasterPlanVersionTools tenantId="t" projectId="p" version={{ id: "v1", rotationDegrees: 0, mapWidthMeters: null, mapHeightMeters: null }} onSaved={saved} />);
    await user.click(screen.getByRole("button", { name: "تدوير 90° لليمين" }));
    expect((screen.getByLabelText("زاوية التدوير (درجة)") as HTMLInputElement).value).toBe("90");
    await user.click(screen.getByRole("button", { name: "تدوير 90° لليمين" })); await user.click(screen.getByRole("button", { name: "تدوير 90° لليمين" }));
    expect((screen.getByLabelText("زاوية التدوير (درجة)") as HTMLInputElement).value).toBe("-90"); // 270 is -90
    await user.type(screen.getByLabelText("عرض منطقة الخطة (م)"), "400"); await user.type(screen.getByLabelText("طول منطقة الخطة (م)"), "250");
    await user.click(screen.getByRole("button", { name: "حفظ التدوير والمعايرة" }));
    expect(state.calls.setVersionGeometry).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", masterPlanVersionId: "v1", rotationDegrees: -90, mapWidthMeters: 400, mapHeightMeters: 250 });
  });
  it("shows nothing without a version", () => { const { container } = render(<MasterPlanVersionTools tenantId="t" projectId="p" version={undefined} onSaved={vi.fn()} />); expect(container.textContent).toBe(""); });
});

describe("MasterPlanEntityTools", () => {
  const all = [entity("root", "ROOT", null), entity("child", "CHILD", "root"), entity("grand", "GRAND", "child"), entity("other", "OTHER", null)];
  const render1 = (target: ToolsEntity, extra: Record<string, unknown> = {}) => render(<MasterPlanEntityTools tenantId="t" projectId="p" entity={target} entities={all} activity={null} mapWidthMeters={400} mapHeightMeters={250} onChanged={vi.fn()} {...extra} />);

  it("offers as parent only entities outside the entity's own branch (the tree stays a tree)", () => {
    render1(all[0]); // ROOT: CHILD and GRAND are its own branch
    const options = within(screen.getByLabelText("الأب في الشجرة")).getAllByRole("option").map(option => option.textContent);
    expect(options).toEqual(["بلا أب (جذر)", "OTHER · Name OTHER"]);
  });
  it("moves an entity under another parent, and to the root", async () => {
    const user = userEvent.setup(); render1(all[2]); // GRAND, currently under CHILD
    await user.selectOptions(screen.getByLabelText("الأب في الشجرة"), "other");
    await user.click(screen.getByRole("button", { name: "حفظ الأب" }));
    expect(state.calls.updateEntityLayout).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", entityId: "grand", parentEntityId: "other" });
    await user.selectOptions(screen.getByLabelText("الأب في الشجرة"), "");
    await user.click(screen.getByRole("button", { name: "حفظ الأب" }));
    expect(state.calls.updateEntityLayout).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", entityId: "grand", parentEntityId: null });
  });
  it("edits the position and size and shows the real size once the plan is calibrated", async () => {
    const user = userEvent.setup(); render1(all[3]);
    expect(screen.getByText(/الأبعاد الحقيقية: 100 × 50 م · 5000 م²/)).toBeTruthy();
    const width = screen.getByLabelText("العرض"); await user.clear(width); await user.type(width, "30");
    await user.click(screen.getByRole("button", { name: "حفظ الموضع والحجم" }));
    expect(state.calls.updateEntityLayout).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", entityId: "other", geometry: { x: 10, y: 10, width: 30, height: 20 } });
  });
  it("lists the alerts the entity has and the jumps to the sections that hold its WBS item and activity", () => {
    render1(entity("e", "E", null, { status: "blocked", actualValue: 1300, wbsItemId: null, activityId: null }), { activity: null });
    const alerts = screen.getByLabelText("تنبيهات الكيان");
    expect(within(alerts).getByText("الكيان متعثر")).toBeTruthy();
    expect(within(alerts).getByText(/التكلفة الفعلية تتجاوز المخطط بـ 30%/)).toBeTruthy();
    expect(within(alerts).getByText(/غير مرتبط ببند WBS ولا نشاط/)).toBeTruthy();
    const links = within(alerts).getAllByRole("link");
    expect(links.map(link => link.getAttribute("href"))).toEqual(["#manager-schedule", "#manager-commercial"]);
  });
  it("says there are no alerts for a healthy linked entity", () => {
    render1(all[3], { activity: { status: "in_progress", plannedFinishAt: "2999-01-01" } });
    expect(screen.getByText("لا تنبيهات")).toBeTruthy();
  });
});

describe("MasterPlanCanvas", () => {
  const drawn: Array<[string, unknown[]]> = [];
  beforeEach(() => {
    drawn.length = 0;
    const context = { clearRect: vi.fn(), fillRect: (...args: unknown[]) => drawn.push(["fill", args]), strokeRect: vi.fn(), set fillStyle(_: string) {}, set strokeStyle(_: string) {}, set lineWidth(_: number) {} };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  });
  afterEach(() => vi.restoreAllMocks());
  const list = [entity("a", "A", null, { geometry: JSON.stringify({ x: 0, y: 0, width: 50, height: 50 }) }), entity("b", "B", null, { geometry: JSON.stringify({ x: 60, y: 60, width: 20, height: 20 }) })];

  it("draws every entity once and reports the one under a click, in plan units", () => {
    const onSelect = vi.fn();
    render(<MasterPlanCanvas entities={list} selectedId={null} colorOf={() => "#047857"} onSelect={onSelect} label="الخريطة" />);
    expect(drawn).toHaveLength(2);
    const canvas = screen.getByTestId("master-plan-canvas");
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(canvas, { clientX: 700, clientY: 400 }); // 70%, 66.7% -> inside B
    expect(onSelect).toHaveBeenLastCalledWith("b");
    fireEvent.click(canvas, { clientX: 900, clientY: 100 }); // empty ground
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("SnapshotShareToggle", () => {
  it("lets the author share and un-share, and only tells everyone else that it was shared", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SnapshotShareToggle tenantId="t" projectId="p" snapshot={{ id: "s1", createdByUserId: 7, sharedWithProject: false }} currentUserId={7} onChanged={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "مشاركة مع المشروع" }));
    expect(state.calls.setSnapshotSharing).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", snapshotId: "s1", shared: true });
    rerender(<SnapshotShareToggle tenantId="t" projectId="p" snapshot={{ id: "s1", createdByUserId: 7, sharedWithProject: true }} currentUserId={7} onChanged={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "إيقاف المشاركة" }));
    expect(state.calls.setSnapshotSharing).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", snapshotId: "s1", shared: false });
    rerender(<SnapshotShareToggle tenantId="t" projectId="p" snapshot={{ id: "s1", createdByUserId: 7, sharedWithProject: true }} currentUserId={9} onChanged={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("مشاركة من زميل")).toBeTruthy();
    rerender(<SnapshotShareToggle tenantId="t" projectId="p" snapshot={{ id: "s1", createdByUserId: 7, sharedWithProject: false }} currentUserId={9} onChanged={vi.fn()} />);
    expect(screen.queryByText("مشاركة من زميل")).toBeNull();
  });
});
