// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionProvider, WriteGate, summaryAllows, useCan } from "./permissions";

const state = vi.hoisted(() => ({ arabic: true, query: { data: undefined as unknown, error: null as unknown } }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic, language: (state.arabic) ? "ar" : "en", isRtl: state.arabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { accessSummary: { mine: { useQuery: () => state.query } } } }));

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const summary = (over: Record<string, unknown> = {}) => ({ member: true, products: ["PROJECT"], permissions: ["project.read", "project.rfi.manage"], scopes: [{ scopeType: "company", scopeId: null }], ...over });

describe("summaryAllows mirrors the server's rule", () => {
  it("accepts any one of the listed permissions", () => {
    expect(summaryAllows(summary() as never, "project.rfi.manage")).toBe(true);
    expect(summaryAllows(summary() as never, ["project.ncr.manage", "project.rfi.manage"])).toBe(true);
    expect(summaryAllows(summary() as never, ["project.ncr.manage", "project.hse.manage"])).toBe(false);
  });
  it("needs the product the permission belongs to to be licensed", () => {
    expect(summaryAllows(summary({ products: ["PMO"] }) as never, "project.rfi.manage")).toBe(false);
    expect(summaryAllows(summary({ products: ["PMO"], permissions: ["pmo.write"] }) as never, "pmo.write")).toBe(true);
  });
  it("a person who is not an active member holds nothing", () => {
    expect(summaryAllows(summary({ member: false }) as never, "project.read")).toBe(false);
  });
  it("a role scoped to one project covers that project only", () => {
    const scoped = summary({ scopes: [{ scopeType: "project", scopeId: PROJECT }] }) as never;
    expect(summaryAllows(scoped, "project.rfi.manage", PROJECT)).toBe(true);
    expect(summaryAllows(scoped, "project.rfi.manage", OTHER)).toBe(false);
  });
});

function Probe() { return <span data-testid="probe">{useCan("project.rfi.manage") ? "yes" : "no"}</span>; }

describe("WriteGate states", () => {
  beforeEach(() => { state.arabic = true; state.query = { data: undefined, error: null }; });
  afterEach(cleanup);
  const gated = <WriteGate permission="project.rfi.manage" reason={{ ar: "لا تملك الصلاحية", en: "No permission", ur: "No permission" }}><button>write</button></WriteGate>;

  it("outside a company route there is nothing to ask, so the control shows (the server still decides)", () => {
    render(gated);
    expect(screen.getByRole("button", { name: "write" })).toBeTruthy();
  });
  it("while the answer is unknown nothing is drawn and no refusal line flashes either", () => {
    render(<PermissionProvider tenantId="t">{gated}</PermissionProvider>);
    expect(screen.queryByRole("button", { name: "write" })).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });
  it("a person who holds the permission sees the control", () => {
    state.query = { data: summary(), error: null };
    render(<PermissionProvider tenantId="t">{gated}</PermissionProvider>);
    expect(screen.getByRole("button", { name: "write" })).toBeTruthy();
  });
  it("a person who does not hold it gets the Arabic reason in place of the form, and no button", () => {
    state.query = { data: summary({ permissions: ["project.read"] }), error: null };
    render(<PermissionProvider tenantId="t">{gated}</PermissionProvider>);
    expect(screen.queryByRole("button", { name: "write" })).toBeNull();
    expect(screen.getByRole("note").textContent).toBe("لا تملك الصلاحية");
  });
  it("English reason in English", () => {
    state.arabic = false; state.query = { data: summary({ permissions: [] }), error: null };
    render(<PermissionProvider tenantId="t">{gated}</PermissionProvider>);
    expect(screen.getByRole("note").textContent).toBe("No permission");
  });
  it("row actions with no reason simply do not appear", () => {
    state.query = { data: summary({ permissions: [] }), error: null };
    render(<PermissionProvider tenantId="t"><WriteGate permission="project.rfi.manage"><button>move</button></WriteGate></PermissionProvider>);
    expect(screen.queryByRole("button", { name: "move" })).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });
  it("a failed lookup is not 'you may not': the control stays and the server refuses what it must", () => {
    state.query = { data: undefined, error: new Error("network") };
    render(<PermissionProvider tenantId="t"><Probe /></PermissionProvider>);
    expect(screen.getByTestId("probe").textContent).toBe("yes");
  });
});
