/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProjectControls from "./ProjectControls";
import { InShellProvider } from "@/components/pageFrame";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";

const state = vi.hoisted(() => ({ navigate: (() => undefined) as (to: string, options?: unknown) => void, saved: [] as unknown[], scheduleError: null as unknown, performancePartial: false, performanceEmpty: false, scheduleLoading: false, scheduleEmpty: false, financialsEmpty: false, contractsRenderFailure: false, withHealth: false, denied: [] as string[], performanceRefused: false }));

vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }), useLocation: () => ["/projects/tenant-1/project-1/controls", (to: string, options?: unknown) => state.navigate(to, options)], Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/components/DashboardSectionReporter", () => ({ DashboardSectionReporter: () => null }));
// the page's own permission reads (upload, + Add); WriteGate keeps its real behaviour (no provider = allowed)
vi.mock("@/lib/permissions", async importOriginal => {
  const real = await importOriginal<typeof import("@/lib/permissions")>();
  const holds = (codes: readonly string[]) => !codes.every(code => state.denied.includes(code));
  return { ...real, useCan: (permission: string | readonly string[]) => holds(Array.isArray(permission) ? permission : [permission as string]), useCanPage: (page: keyof typeof real.PAGE_ACCESS) => real.PAGE_ACCESS[page].every(group => holds(group)) };
});
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "safe error" }));
vi.mock("./ProjectContracts", () => ({ ProjectContracts: () => { if (state.contractsRenderFailure) throw new Error("deliberate project contracts render failure"); return null; } }));
vi.mock("./ProjectDocuments", () => ({ ProjectDocuments: () => <p>Documents panel alive</p> }));
vi.mock("./ProjectRfis", () => ({ ProjectRfis: () => null }));
vi.mock("./ProjectNcrs", () => ({ ProjectNcrs: () => null }));
vi.mock("./ProjectHse", () => ({ ProjectHse: () => null }));
vi.mock("./ProjectFieldReports", () => ({ ProjectFieldReports: () => null }));
vi.mock("./ProjectQualityInspections", () => ({ ProjectQualityInspections: () => null }));
vi.mock("./ProjectPurchaseOrders", () => ({ ProjectPurchaseOrders: () => null }));
vi.mock("./ProjectGoodsReceipts", () => ({ ProjectGoodsReceipts: () => null }));
vi.mock("./ProjectProcurement", () => ({ ProjectProcurement: () => null }));
vi.mock("./ProjectChanges", () => ({ ProjectChanges: () => null }));
vi.mock("./ProjectNotifications", () => ({ ProjectNotifications: () => null }));
vi.mock("./ProjectResources", () => ({ ProjectResources: () => null }));
vi.mock("./ProjectMaterials", () => ({ ProjectMaterials: () => null }));
vi.mock("./ProjectWarehouses", () => ({ ProjectWarehouses: () => null }));
vi.mock("./ProjectClaims", () => ({ ProjectClaims: () => null }));
vi.mock("./ProjectAdvisor", () => ({ ProjectAdvisor: () => null }));
vi.mock("./ProjectImports", () => ({ ProjectImports: () => null }));
vi.mock("./ProjectOperationalImports", () => ({ ProjectOperationalImports: () => null }));
vi.mock("./ProjectDataExport", () => ({ ProjectDataExport: () => null }));
vi.mock("./ProjectMasterPlan", () => ({ ProjectMasterPlan: () => null }));
vi.mock("./ProjectReferenceLists", () => ({ ProjectReferenceLists: () => null }));
vi.mock("@/components/MasterPlanDrawing", () => ({ MasterPlanDrawing: () => null }));

vi.mock("@/components/ProjectBoardAttention", () => ({ ProjectBoardAttention: () => <div data-board-attention /> }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: async (input: unknown) => { state.saved.push(input); return {}; }, isPending: false, error: null, data: null });
  return { trpc: {
    siteReports: { list: { useQuery: () => ({ data: [] }) }, get: { useQuery: () => ({ data: undefined }) } }, // Q-54: the labour card beside the hero
    pmc: { stalledUnits: { useQuery: () => ({ data: { threshold: 3, longDays: 14, counts: { stalled: 2, long: 1, active: 4 }, rows: [] }, isError: false, error: null }) } },
    reportPeriods: { monthly: { useQuery: () => ({ isLoading: false, error: null, data: undefined }) } },
    projects: {
      getControls: { useQuery: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: { project: { code: "P-01", name: "Delivery evidence" }, wbs: [{ id: "wbs-1", code: "W-01", name: "Still available", plannedValue: 100, progressPercent: 0 }], activities: [], budgets: [], costs: [], progress: [], latestEvm: null, latestHealth: null, cashFlow: null } }) },
      getControlsSchedule: { useQuery: () => ({ isLoading: state.scheduleLoading, error: state.scheduleError, refetch: vi.fn(), data: state.scheduleError || state.scheduleLoading ? undefined : { project: { code: "P-01", name: "Delivery evidence" }, wbs: state.scheduleEmpty ? [] : [{ id: "wbs-1", code: "W-01", name: "Still available", plannedValue: 100, progressPercent: 0 }], activities: [] } }) },
      getControlsFinancials: { useQuery: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: { wbs: state.financialsEmpty ? [] : [{ id: "wbs-1", code: "W-01", name: "Still available", plannedValue: 100, progressPercent: 0 }], budgets: [], costs: [], progress: [] } }) },
      getControlsPerformance: { useQuery: () => ({ isLoading: false, error: state.performanceRefused ? { message: "Role scope does not cover the requested resource.", data: { code: "FORBIDDEN" } } : state.performancePartial || state.performanceEmpty ? null : { message: "performance unavailable" }, data: state.performancePartial ? { latestEvm: { cpi: 1, spi: 1, eac: 100, vac: 0, periodAt: new Date("2026-09-30T00:00:00.000Z") }, latestHealth: state.withHealth ? { status: "amber", overallScore: 72, confidence: "medium", periodAt: new Date("2026-09-30T00:00:00.000Z"), exceptions: "[]", drivers: JSON.stringify({ overdueHseCount: 2 }) } : null, cashFlow: null } : state.performanceEmpty ? { latestEvm: null, latestHealth: null, cashFlow: null } : undefined, refetch: vi.fn() }) },
    },
    directUploads: { create: { useMutation: mutation } }, // attachments upload straight to storage (G-139)
    wbs: { create: { useMutation: mutation } }, activities: { create: { useMutation: mutation } }, budgets: { create: { useMutation: mutation } }, costs: { createActual: { useMutation: mutation } }, progress: { create: { useMutation: mutation } }, controls: { saveEvmSnapshot: { useMutation: mutation }, captureOperationalEvmSnapshot: { useMutation: mutation }, captureProjectHealthSnapshot: { useMutation: mutation } },
  } };
});

describe("ProjectControls section resilience", () => {
  afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); /* the PMC tab writes #pmc into the address, and the next render would open on it */ state.scheduleError = null; state.performancePartial = false; state.performanceEmpty = false; state.scheduleLoading = false; state.scheduleEmpty = false; state.financialsEmpty = false; state.withHealth = false; state.denied = []; state.performanceRefused = false; state.contractsRenderFailure = false; });

  it("inside the product frame draws no top bar or main of its own: the frame keeps the one banner and the one main (review of #156, item 2)", () => {
    const { container } = render(<InShellProvider><ProjectControls /></InShellProvider>);
    expect(screen.queryAllByRole("banner")).toHaveLength(0);
    expect(screen.queryAllByRole("main")).toHaveLength(0);
    expect(container.querySelectorAll("header, main")).toHaveLength(0);
    // the page's actions stay, as a toolbar in the content
    expect(container.querySelector("[data-page-toolbar]")?.textContent).toContain("Profitability");
    expect(screen.getByText("Delivery evidence")).toBeTruthy();
  });

  it("opened on its own (outside the frame) keeps its own main landmark", () => {
    render(<ProjectControls />);
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("keeps project controls available when the independent performance source fails", () => {
    render(<ProjectControls focus="planning" />);
    expect(screen.getAllByText("P-01").length).toBeGreaterThan(0); // the planning page names its project by code
    expect(screen.getAllByText("W-01 · Still available").length).toBeGreaterThan(0);
    expect(screen.getByText("This section could not be loaded. The rest of the dashboard remains available.")).toBeTruthy();
  });

  it("keeps financial WBS data available when the independent schedule source fails", () => {
    state.scheduleError = { message: "schedule unavailable" };
    render(<ProjectControls focus="planning" />);
    expect(screen.getAllByText("W-01 · Still available").length).toBeGreaterThan(0);
    expect(screen.getAllByText("This section could not be loaded. The rest of the dashboard remains available.").length).toBeGreaterThan(0);
  });

  it("names the missing health input when performance data is only partial", () => {
    state.performancePartial = true;
    render(<ProjectControls focus="planning" />);
    expect(screen.getByText("Available: part of the performance data. Missing: health snapshot.")).toBeTruthy();
    expect(screen.getAllByText("W-01 · Still available").length).toBeGreaterThan(0);
  });

  it("Q-18: while a main read (the schedule) is on its way, the page shows its grey shape once instead of a half page that jumps when it lands", () => {
    state.scheduleLoading = true;
    const { container } = render(<ProjectControls />);
    expect(container.querySelector('[data-skeleton="board"]')).toBeTruthy(); // Q-54: the board's own shape (dark hero, four cards, a list)
    expect(screen.getByRole("status").getAttribute("aria-label")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Project delivery board" })).toBeNull();
  });

  it("shows local empty states for independent project sources once the page is drawn", () => {
    state.financialsEmpty = true;
    state.performanceEmpty = true;
    render(<ProjectControls />);
    expect(within(screen.getAllByLabelText("Cost and progress records")[0]).getByText("No budget, cost or progress recorded yet. Add a line or upload a file.")).toBeTruthy();
    expect(within(screen.getAllByLabelText("Project performance data")[0]).getByText("No performance snapshot yet: it is calculated once the schedule, budget and progress are recorded.")).toBeTruthy();
  });

  it("keeps an empty PROJECT source distinct from a source error", () => {
    state.financialsEmpty = true;
    state.performanceEmpty = true;
    state.scheduleError = { message: "schedule unavailable" };
    render(<ProjectControls />);
    expect(screen.getAllByText(/recorded yet/).length).toBeGreaterThan(0);
    expect(screen.getByText("safe error")).toBeTruthy();
  });

  it("gives a scoped project manager a command center and opens the selected governed tool lane", () => {
    state.performancePartial = true;
    render(<ProjectControls />);
    expect(within(screen.getByLabelText("PROJECT MANAGER COMMAND CENTER")).getByText("Operate the project from one control point")).toBeTruthy();
    expect(screen.getByText("Operating scope: P-01")).toBeTruthy();
    // Q-59 (2): the board is a summary; the lane opens its group on its level's page
    const navigate = vi.fn(); state.navigate = navigate;
    cleanup(); render(<ProjectControls />);
    expect(document.getElementById("manager-commercial")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Contracts, documents & claims/i }));
    expect(navigate).toHaveBeenCalledWith("/projects/tenant-1/project-1/contracts#manager-commercial", undefined);
  });

  it("contains a deliberate operational render failure while the schedule section remains available", () => {
    state.performancePartial = true;
    state.contractsRenderFailure = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<ProjectControls focus="contracts" />);
    expect(screen.getAllByText("This section could not be loaded. The rest of the dashboard remains available.").length).toBeGreaterThan(0);
    expect(screen.getByText("Documents panel alive")).toBeTruthy(); // the page's other panels stay (the schedule is on the planning page now)
    consoleError.mockRestore();
  });

  it("contains a failing panel to itself: it is named, offers a retry, and the panel next to it keeps working (G-100)", () => {
    state.performancePartial = true;
    state.contractsRenderFailure = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<ProjectControls focus="contracts" />);
    const failed = screen.getByRole("region", { name: "Contracts", hidden: true });
    expect(failed.textContent).toContain("This section could not be loaded");
    expect(within(failed).getByRole("button", { name: "Try again", hidden: true })).toBeTruthy();
    expect(screen.getByText("Documents panel alive")).toBeTruthy(); // same group, next panel
    state.contractsRenderFailure = false;
    fireEvent.click(within(failed).getByRole("button", { name: "Try again", hidden: true }));
    expect(screen.queryByRole("region", { name: "Contracts", hidden: true })).toBeNull(); // retried and rendered
    consoleError.mockRestore();
  });

  it("Q-36 (step 4): the groups sit under titled level sections, each with its own address; every older group address still exists, under its level", () => {
    // Q-59 (2): each level is its own page, holding the groups it held on the board; every group still exists, on its level's page
    const groupsOf = (focus: "planning" | "site" | "supply" | "contracts") => { cleanup(); render(<ProjectControls focus={focus} />); return Array.from(document.querySelectorAll("details[id^=manager-]")).map(node => node.id); };
    expect(groupsOf("planning")).toEqual(["manager-schedule", "manager-assurance", "manager-oversight"]);
    expect(groupsOf("site")).toEqual(["manager-site", "manager-design"]);
    expect(groupsOf("supply")).toEqual(["manager-supply"]);
    expect(groupsOf("contracts")).toEqual(["manager-commercial", "manager-tenders"]);
    expect(document.querySelector("[data-focus-title]")!.textContent).toBe("Contracts and documents");
  });

  it("Q-36 (step 4): a link to a level (controls#supply) opens that level's groups, and only those", () => {
    // Q-59 (2): an old address of the board's level or group opens it on its level's page, the group still named
    const navigate = vi.fn(); state.navigate = navigate;
    window.history.replaceState(null, "", "/projects/tenant-1/project-1/controls#supply");
    render(<ProjectControls />);
    expect(navigate).toHaveBeenCalledWith("/projects/tenant-1/project-1/supply#supply", { replace: true });
    cleanup(); navigate.mockReset();
    window.history.replaceState(null, "", "/projects/tenant-1/project-1/controls#manager-tenders");
    render(<ProjectControls />);
    expect(navigate).toHaveBeenCalledWith("/projects/tenant-1/project-1/contracts#manager-tenders", { replace: true });
    // and on the level's page the group it names is open
    cleanup(); window.history.replaceState(null, "", "/projects/tenant-1/project-1/contracts#manager-tenders");
    render(<ProjectControls focus="contracts" />);
    expect((document.getElementById("manager-tenders") as HTMLDetailsElement).open).toBe(true);
    window.history.replaceState(null, "", "/");
  });

  it("Q-56 (2): «Planning» and «Supply» are pages of their own — their title, their level's groups open, and nothing of the board's other levels or head", async () => {
    render(<ProjectControls focus="supply" />);
    expect(document.querySelector("[data-focus-title]")!.textContent).toBe("Warehouses and procurement");
    expect(Array.from(document.querySelectorAll("[data-level-section]")).map(node => node.id)).toEqual(["supply"]);
    expect((document.getElementById("manager-supply") as HTMLDetailsElement).open).toBe(true);
    expect(document.getElementById("manager-commercial")).toBeNull();
    expect(document.getElementById("manager-oversight")).toBeNull();
    cleanup();
    render(<ProjectControls focus="planning" />);
    expect(Array.from(document.querySelectorAll("[data-level-section]")).map(node => node.id)).toEqual(["planning"]);
    expect((document.getElementById("manager-schedule") as HTMLDetailsElement).open).toBe(true);
    expect((document.getElementById("manager-assurance") as HTMLDetailsElement).open).toBe(true);
    // Q-64: a link that names a group (/planning#manager-assurance) opens it, and the address then drops the group's internal name
    cleanup();
    window.history.replaceState(null, "", "/projects/t/p/planning#manager-assurance");
    render(<ProjectControls focus="planning" />);
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect((document.getElementById("manager-assurance") as HTMLDetailsElement).open).toBe(true); // still open: it is the page's own state now
    // Q-59 (2): the board is a summary — no level's groups, what needs attention, and a card that opens each level's page
    cleanup();
    render(<ProjectControls />);
    expect(document.querySelector("[data-focus-title]")).toBeNull();
    expect(document.querySelectorAll("[data-level-section]")).toHaveLength(0);
    expect(document.querySelector("[data-board-attention]")).not.toBeNull();
    expect(Array.from(document.querySelectorAll("[data-board-level]")).map(node => [node.getAttribute("data-board-level"), node.querySelector("a")!.getAttribute("href")])).toEqual([
      ["planning", "/projects/tenant-1/project-1/planning"], ["site", "/projects/tenant-1/project-1/field-records"], ["supply", "/projects/tenant-1/project-1/supply"], ["contracts", "/projects/tenant-1/project-1/contracts"],
    ]);
  });

  it("Q-36 (step 3): no PMC tab inside the page — one link to the PMC page; the old address controls#pmc goes there; no link without PMC access", () => {
    const navigate = vi.fn(); state.navigate = navigate;
    render(<ProjectControls />);
    expect(screen.queryByRole("tab", { name: "PMC project control" })).toBeNull();
    expect(screen.getByRole("link", { name: "Project controls (PMC)" }).getAttribute("href")).toBe("/projects/tenant-1/project-1/pmc");
    expect(navigate).not.toHaveBeenCalled();
    cleanup();
    window.history.replaceState(null, "", "/projects/tenant-1/project-1/controls#pmc");
    render(<ProjectControls />);
    expect(navigate).toHaveBeenCalledWith("/projects/tenant-1/project-1/pmc", { replace: true });
    cleanup(); window.history.replaceState(null, "", "/");
    state.denied = ["project.pmc.read"];
    render(<ProjectControls />);
    expect(screen.queryByRole("link", { name: "Project controls (PMC)" })).toBeNull();
    state.denied = []; state.navigate = () => undefined;
  });

  it("puts the health results on a muted surface with full-contrast text, the overdue HSE count inside the health card", () => {
    state.performancePartial = true;
    state.withHealth = true;
    render(<ProjectControls focus="planning" />);
    const hse = screen.getByText(/Overdue HSE observations/);
    expect(hse.closest("section")?.textContent).toContain("Project health");
    const surface = hse.closest("div") as HTMLElement;
    expect(surface.className).toContain("bg-muted");
    expect(surface.className).toContain("text-foreground");
    expect(document.querySelector("main .bg-accent.text-muted-foreground, main .bg-accent .text-muted-foreground")).toBeNull();
  });

  it("an empty project opens on the start card, and its empty sections offer + Add and Upload file", () => {
    state.performancePartial = true;
    state.scheduleEmpty = true;
    render(<ProjectControls />);
    expect(screen.getByRole("heading", { name: "Start your project" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload the P6 programme" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add by hand" })).toBeTruthy();
    const emptyOf = (title: string) => screen.getAllByLabelText(title).find(node => node.textContent?.includes("recorded yet")) as HTMLElement;
    const schedule = emptyOf("Schedule and WBS");
    expect(within(schedule).getByRole("button", { name: "Add" })).toBeTruthy();
    expect(within(schedule).getByRole("button", { name: "Upload file" })).toBeTruthy();
    const records = emptyOf("Cost and progress records");
    expect(within(records).getByRole("button", { name: "Add" })).toBeTruthy();
  });

  it("no upload button for a person who may not import, and no + Add / Add by hand for one who may not write (D-1: no button the server refuses)", async () => {
    const { anyImportPermission } = await import("@shared/importPermissions");
    state.performancePartial = true;
    state.scheduleEmpty = true;
    state.denied = [...anyImportPermission, "project.wbs.manage", "project.schedule.manage", "project.budget.manage", "project.cost.enter", "project.progress.manage"];
    render(<ProjectControls />);
    expect(screen.getByRole("heading", { name: "Start your project" })).toBeTruthy(); // the card still says how a project begins
    for (const name of ["Upload any file", "Upload the P6 programme", "Upload the progress report", "Upload file", "Add by hand", "Add"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("Q-36 (3 c): the start card's upload opens the ONE import entry (it sends each kind of file where it is imported)", () => {
    state.performancePartial = true;
    const navigate = vi.fn(); state.navigate = navigate;
    render(<ProjectControls />);
    fireEvent.click(screen.getByRole("button", { name: "Upload the P6 programme" }));
    expect(navigate.mock.calls.map(call => call[0])).toEqual(["/projects/tenant-1/project-1/import"]);
    state.navigate = () => undefined;
  });

  it("an empty project says the section is empty and what to do; \"not in your access scope\" stays for a real refusal", () => {
    state.performanceEmpty = true;
    state.scheduleEmpty = true;
    render(<ProjectControls />);
    expect(document.body.textContent).toContain("No schedule recorded yet. Add an activity or upload the programme.");
    expect(document.body.textContent).toContain("No performance snapshot yet");
    expect(document.body.textContent).not.toContain("current access scope");
    cleanup();
    state.performanceEmpty = false;
    state.performanceRefused = true;
    render(<ProjectControls />);
    const refused = screen.getAllByLabelText("Project performance data").find(node => node.getAttribute("class")?.includes("bg-danger-soft")) as HTMLElement;
    expect(refused).toBeTruthy();
    expect(refused.textContent).not.toContain("No performance snapshot yet");
    expect(refused.textContent).not.toContain("recorded yet");
  });

  it("without + Add or upload the empty section says only what is missing, with no empty action row", () => {
    const denied = ["project.wbs.manage", "project.schedule.manage", "project.budget.manage", "project.cost.enter", "project.progress.manage"];
    return import("@shared/importPermissions").then(({ anyImportPermission }) => {
      state.performancePartial = true;
      state.scheduleEmpty = true;
      state.denied = [...anyImportPermission, ...denied];
      render(<ProjectControls />);
      const schedule = screen.getAllByLabelText("Schedule and WBS").find(node => node.textContent?.includes("recorded yet")) as HTMLElement;
      expect(schedule.textContent).toContain("No schedule recorded yet.");
      expect(schedule.textContent).not.toContain("Add an activity");
      expect(schedule.querySelector("[data-section-actions], div[hidden]")).toBeNull();
    });
  });

  it("\"Add by hand\" opens the schedule group and focuses its first field", () => {
    state.performancePartial = true;
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.push(callback); return frames.length; });
    // Q-59 (2): from the board, «Add by hand» opens the schedule group on the planning page
    const navigate = vi.fn(); state.navigate = navigate;
    render(<ProjectControls />);
    fireEvent.click(screen.getByRole("button", { name: "Add by hand" }));
    frames.forEach(callback => callback(0));
    expect(navigate).toHaveBeenCalledWith("/projects/tenant-1/project-1/planning#manager-schedule", undefined);
    raf.mockRestore();
  });

  it("shows the formula and the date beside each manager indicator (G-106)", () => {
    state.performancePartial = true;
    render(<ProjectControls />);
    const lines = screen.getAllByTestId("indicator-basis").map(node => node.textContent ?? "");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain("no snapshot saved yet"); // health: no snapshot in this fixture
    expect(lines[1]).toContain("CPI = EV ÷ AC"); expect(lines[1]).toContain("as of Sep 30, 2026"); // EVM: its snapshot date
    expect(lines[2]).toContain("Remaining = planned budget"); expect(lines[2]).toContain("as of now");
    expect(lines[3]).toContain("blocked"); expect(lines[4]).toContain("WBS");
    expect(lines.every(line => line.startsWith("Formula: ") && line.includes("Source: "))).toBe(true);
    // work order 21: the face shows the number and its status; each formula is folded behind "How is it calculated?"
    for (const node of screen.getAllByTestId("indicator-basis")) expect(node.closest("details")?.querySelector("summary")?.textContent).toBe("How is it calculated?");
  });
});

describe("ProjectControls checks its forms in the page's language (D-65)", () => {
  afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });
  it("an empty WBS item adds nothing and says so in English under its first field", () => {
    state.performancePartial = true;
    render(<ProjectControls focus="planning" />);
    const form = screen.getByRole("button", { name: /Add WBS item/ }).closest("form")!;
    expectEmptySubmitRefused(form, "en", vi.fn());
  });
});

// D-74 (b): the WBS and budget sheets (paste from Excel), each row saved by the one-row form's procedure
describe("ProjectControls — sheet entry", () => {
  afterEach(() => { cleanup(); state.saved = []; });
  const paste = (element: HTMLElement, text: string) => fireEvent.paste(element, { clipboardData: { getData: () => text } });
  it("a WBS block pasted from Excel is saved row by row through wbs.create, numbers read with their grouping commas", async () => {
    state.saved = [];
    render(<ProjectControls focus="planning" />);
    const sheet = screen.getByRole("table", { name: "WBS items sheet" });
    paste(within(sheet).getAllByRole("textbox")[0]!, "W-02\tStructure\t1,250.5\nW-03\tFinishes\t");
    await act(async () => { fireEvent.click(within(sheet.closest("[data-grid-editor]") as HTMLElement).getByRole("button", { name: "Save rows" })); });
    await waitFor(() => expect(state.saved).toHaveLength(2));
    expect(state.saved).toEqual([{ tenantId: expect.any(String), projectId: expect.any(String), code: "W-02", name: "Structure", plannedValue: 1250.5 }, { tenantId: expect.any(String), projectId: expect.any(String), code: "W-03", name: "Finishes" }]);
  });

  it("a budget row naming a WBS code the project does not have is refused on its row and nothing is sent; a known code is sent as its item", async () => {
    state.saved = [];
    render(<ProjectControls focus="planning" />);
    const sheet = screen.getByRole("table", { name: "Budget lines sheet" });
    paste(within(sheet).getAllByRole("textbox")[0]!, "X-99\tCC-1\t100\t100");
    await act(async () => { fireEvent.click(within(sheet.closest("[data-grid-editor]") as HTMLElement).getByRole("button", { name: "Save rows" })); });
    expect(sheet.textContent).toContain("No WBS item with this code in the project");
    expect(state.saved).toEqual([]);
    paste(within(sheet).getAllByRole("textbox")[0]!, "w-01\tCC-1\t1,000\t1,200");
    await act(async () => { fireEvent.click(within(sheet.closest("[data-grid-editor]") as HTMLElement).getByRole("button", { name: "Save rows" })); });
    await waitFor(() => expect(state.saved).toHaveLength(1));
    expect(state.saved[0]).toMatchObject({ wbsItemId: "wbs-1", costCode: "CC-1", originalAmount: 1000, currentAmount: 1200 });
  });
});
