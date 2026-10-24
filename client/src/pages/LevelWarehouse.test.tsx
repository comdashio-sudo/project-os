/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SECOND_WAREHOUSE_ID, UNAPPROVED, WAREHOUSE, WAREHOUSE_ID, WAREHOUSE_LIST, TENANT } from "@/test/levelFixtures";
import LevelWarehouse from "./LevelWarehouse";

const state = vi.hoisted(() => ({ list: {} as Record<string, unknown>, stock: {} as Record<string, unknown>, unapproved: {} as Record<string, unknown>, unapprovedInput: undefined as unknown, search: "", isArabic: true, stockInput: undefined as unknown }));
const refetch = vi.hoisted(() => vi.fn());
const ok = (data: unknown) => ({ isLoading: false, isFetching: false, error: null, data, refetch });
const failed = (error: unknown) => ({ isLoading: false, isFetching: false, error, data: undefined, refetch });

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "11111111-1111-4111-8111-111111111111", projectId: "22222222-2222-4222-8222-222222222222" }),
  useSearch: () => state.search,
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic }) }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    warehouses: { list: { useQuery: () => state.list } },
    scopes: { warehouse: { useQuery: (input: unknown) => { state.stockInput = input; return state.stock; } } },
    levelReads: { warehouseUnapprovedMaterials: { useQuery: (input: unknown) => { state.unapprovedInput = input; return state.unapproved; } } },
  },
}));

describe("LevelWarehouse (level 4, one project warehouse)", () => {
  beforeEach(() => {
    state.isArabic = true;
    state.search = "";
    state.list = ok(WAREHOUSE_LIST);
    state.stock = ok(WAREHOUSE);
    state.unapproved = ok(UNAPPROVED);
  });
  afterEach(() => { cleanup(); refetch.mockReset(); });

  it("opens the first active warehouse by default and shows its balance", () => {
    const { container } = render(<LevelWarehouse />);
    expect(screen.getByRole("heading", { name: "WH-1 · Synthetic store" })).toBeTruthy();
    expect(screen.getByText("المستوى 4 من 4 · المستودع")).toBeTruthy();
    expect(state.stockInput).toMatchObject({ tenantId: TENANT, warehouseId: WAREHOUSE_ID });
    expect(container.querySelectorAll("[data-material-row]")).toHaveLength(2);
  });

  it("lists the materials below their reorder level as shortages, and no others", () => {
    const { container } = render(<LevelWarehouse />);
    const shortages = container.querySelector("[data-section='warehouse-shortages']")!;
    expect(shortages.textContent).toContain("MAT-1 · Synthetic cement");
    expect(shortages.textContent).not.toContain("MAT-2");
  });

  it("shows the movements of the warehouse with their reference", () => {
    const { container } = render(<LevelWarehouse />);
    expect(container.querySelector("[data-section='warehouse-movements']")?.textContent).toContain("GRN-SYN-1");
  });

  it("counts the materials held in this warehouse that the project has not approved, from the server's read", () => {
    const { container } = render(<LevelWarehouse />);
    const section = container.querySelector("[data-section='warehouse-unapproved']")!;
    expect(section.querySelector("[data-state='awaiting-server']")).toBeNull();
    expect(Array.from(section.querySelectorAll("dd")).map(item => item.textContent)).toEqual(["2", "1"]);
    expect(section.querySelector("[data-unapproved-material='m-1']")?.textContent).toContain("لم يُقدَّم اعتماد");
  });

  it("asks the server about the warehouse on the screen, not another one", () => {
    render(<LevelWarehouse />);
    expect(state.unapprovedInput).toMatchObject({ warehouseId: WAREHOUSE_ID });
  });

  it("says the unapproved count could not be read, and shows no figure in its place", () => {
    state.unapproved = failed({ data: { code: "INTERNAL_SERVER_ERROR" }, message: "Synthetic failure" });
    const { container } = render(<LevelWarehouse />);
    const section = container.querySelector("[data-section='warehouse-unapproved']")!;
    expect(section.querySelector("[role='alert']")?.textContent).toContain("المواد غير المعتمدة");
    expect(section.querySelectorAll("dd")).toHaveLength(0);
  });

  it("says every held material is approved when none is unapproved", () => {
    state.unapproved = ok({ ...UNAPPROVED, unapprovedCount: 0, unapproved: [] });
    const { container } = render(<LevelWarehouse />);
    expect(container.querySelector("[data-section='warehouse-unapproved']")?.textContent).toContain("كل المواد المحجوزة في هذا المستودع معتمدة.");
  });

  it("has no level below: it is the lowest level, and says so", () => {
    const { container } = render(<LevelWarehouse />);
    expect(container.querySelector("[data-level-down]")).toBeNull();
    expect(container.querySelector("[data-level-lowest]")?.textContent).toContain("أدنى مستوى");
  });

  it("opens the warehouse named in the link, and offers the other warehouses to choose from", () => {
    state.search = `warehouse=${SECOND_WAREHOUSE_ID}`;
    const { container } = render(<LevelWarehouse />);
    expect(state.stockInput).toMatchObject({ warehouseId: SECOND_WAREHOUSE_ID });
    const current = container.querySelector("nav[aria-label='المستودعات'] a[aria-current='page']") as HTMLAnchorElement;
    expect(current.getAttribute("href")).toBe(`/levels/${TENANT}/projects/22222222-2222-4222-8222-222222222222/warehouse?warehouse=${SECOND_WAREHOUSE_ID}`);
    expect(container.querySelectorAll("nav[aria-label='المستودعات'] a")).toHaveLength(2);
  });

  it("shows an empty state when the project has no warehouse yet", () => {
    state.list = ok({ warehouses: [] });
    const { container } = render(<LevelWarehouse />);
    expect(container.querySelector("[data-screen-state='empty']")).toBeTruthy();
    expect(screen.getByText("لا مستودع لهذا المشروع بعد.")).toBeTruthy();
  });

  it("shows the no-permission sentence, not a 403, to a person without warehouse scope", () => {
    state.stock = failed({ data: { code: "FORBIDDEN" }, message: "Role scope does not cover the requested resource." });
    const { container } = render(<LevelWarehouse />);
    expect(container.querySelector("[data-screen-state='no-permission']")).toBeTruthy();
    expect(container.querySelector("[data-material-row]")).toBeNull();
    expect(container.textContent).not.toMatch(/403|FORBIDDEN/);
  });

  it("reads in English when English is chosen", () => {
    state.isArabic = false;
    render(<LevelWarehouse />);
    expect(screen.getByText("Level 4 of 4 · Warehouse")).toBeTruthy();
    expect(screen.getByText("This is the lowest level.")).toBeTruthy();
  });
});
