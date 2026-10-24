import type { ProjectKpi, ScopeLevels } from "@/lib/levels";

// Synthetic fixtures for the four level screens (no real person, company or project). They are typed through the server's own router
// output, so a change to `scopes.*` breaks these fixtures at compile time instead of passing a stale shape in a test.

export const TENANT = "11111111-1111-4111-8111-111111111111";

export const PROJECT_A: ProjectKpi = {
  projectId: "22222222-2222-4222-8222-222222222222", code: "LV-01", name: "Synthetic project A", currency: "SAR",
  expectedProfit: { value: 120000 },
  evm: { pv: 500000, ev: 450000, ac: 480000, bac: 900000, cpi: 0.94, spi: 0.9, eac: 957446.81, vac: -57446.81 },
  progress: { percent: 50 },
  overdueActivities: 3,
  pendingConsultant: { inspectionRequests: 2, submittals: 1 },
  pendingQuality: { inspectionsAwaitingResult: 1, openNcrs: 0 },
  stock: { value: 15000, materialsBelowReorder: 1 },
};

export const PROJECT_B: ProjectKpi = {
  projectId: "33333333-3333-4333-8333-333333333333", code: "LV-02", name: "Synthetic project B", currency: "SAR",
  expectedProfit: { value: null, reason: "PROFITABILITY_UNAVAILABLE" },
  evm: { value: null, reason: "EVM_UNAVAILABLE" },
  progress: { value: null, reason: "NO_UNITS" },
  overdueActivities: 0,
  pendingConsultant: { inspectionRequests: 0, submittals: 0 },
  pendingQuality: { inspectionsAwaitingResult: 0, openNcrs: 2 },
  stock: { value: 0, materialsBelowReorder: 0 },
};

const totals = {
  projectCount: 2, currency: "SAR", expectedProfit: 120000, stockValue: 15000, avgProgress: 50, overdueActivities: 3,
  pendingConsultant: { inspectionRequests: 2, submittals: 1 }, pendingQuality: { inspectionsAwaitingResult: 1, openNcrs: 2 }, materialsBelowReorder: 1,
};

export const COMPANY: ScopeLevels["company"] = { level: "company", readOnly: true, totals, projects: [PROJECT_A, PROJECT_B] };
export const PORTFOLIO: ScopeLevels["portfolio"] = { level: "portfolio", totals, projects: [PROJECT_A, PROJECT_B] };
export const PROJECT_LEVEL: ScopeLevels["project"] = { level: "project", project: PROJECT_A, totals: { ...totals, projectCount: 1 } };

export const WAREHOUSE_ID = "44444444-4444-4444-8444-444444444444";
export const SECOND_WAREHOUSE_ID = "55555555-5555-4555-8555-555555555555";

export const WAREHOUSE: ScopeLevels["warehouse"] = {
  level: "warehouse",
  warehouse: { id: WAREHOUSE_ID, code: "WH-1", name: "Synthetic store", active: true },
  totals: { materials: 2, stockValue: 15000, materialsBelowReorder: 1 },
  stock: [
    { materialId: "m-1", code: "MAT-1", description: "Synthetic cement", unit: "bag", quantity: 2, value: 1000, reorderLevel: 5, belowReorder: true },
    { materialId: "m-2", code: "MAT-2", description: "Synthetic steel", unit: "kg", quantity: 900, value: 14000, reorderLevel: null, belowReorder: false },
  ],
  recentMovements: [
    { id: "t-1", materialId: "m-1", transactionType: "receipt", quantityDelta: 2, valueDelta: 1000, occurredAt: new Date("2026-10-20T08:00:00Z"), referenceNumber: "GRN-SYN-1" },
  ],
} as unknown as ScopeLevels["warehouse"];

/** The warehouse list the screen chooses from (`warehouses.list`): the first is active and is the default. */
export const WAREHOUSE_LIST = {
  warehouses: [
    { id: WAREHOUSE_ID, code: "WH-1", name: "Synthetic store", active: true },
    { id: SECOND_WAREHOUSE_ID, code: "WH-2", name: "Synthetic yard", active: true },
  ],
};

/** Field reports: two daily (one newer), one inspection report that the daily list must not show. */
export const FIELD_REPORTS = [
  { id: "r-old", reportNumber: "DR-0001", reportType: "daily", reportedAt: new Date("2026-10-18T06:00:00Z"), workforceCount: 10, status: "reviewed", summary: "Synthetic day one" },
  { id: "r-insp", reportNumber: "IR-0001", reportType: "inspection", reportedAt: new Date("2026-10-20T06:00:00Z"), workforceCount: 4, status: "submitted", summary: "Synthetic inspection" },
  { id: "r-new", reportNumber: "DR-0002", reportType: "daily", reportedAt: new Date("2026-10-21T06:00:00Z"), workforceCount: 12, status: "submitted", summary: "Synthetic day two" },
];

export const INSPECTIONS = [
  { id: "q-1", inspectionNumber: "QI-0001", inspectionType: "hold_point", inspectedAt: new Date("2026-10-19T06:00:00Z"), outcome: "pass", summary: "Synthetic check", status: "accepted" },
];

/** Work order 16 (G-190 to G-192): the reads the level screens take from `levelReads.*` (server/levelReads.ts). Synthetic counts only. */
export const DELIVERIES = { level: "project" as const, projectId: PROJECT_A.projectId, submittals: { total: 6, draft: 1, awaitingReply: 2, replied: 2, closed: 1 } };

export const UNAPPROVED = {
  level: "warehouse" as const, warehouseId: WAREHOUSE_ID, stockedMaterials: 2, unapprovedCount: 1,
  unapproved: [{ materialId: "m-1", code: "MAT-1", description: "Synthetic cement", state: "no_submittal" as const }],
};

export const COMMITMENTS = {
  level: "company" as const, projectCount: 2,
  contracts: { count: 2, byCurrency: [{ currency: "SAR", amount: 1250 }, { currency: "USD", amount: 40 }] },
  purchaseOrders: { count: 1, byCurrency: [{ currency: "SAR", amount: 500 }] },
  commitments: { count: 0, byCurrency: [] as { currency: string; amount: number }[] },
};
