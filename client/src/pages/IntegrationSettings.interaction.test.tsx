/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IntegrationSettings from "./IntegrationSettings";

const h = vi.hoisted(() => ({
  language: "en" as "ar" | "en" | "ur", manager: true, metaError: null as unknown, error: null as unknown,
  createConnection: vi.fn(), testConnection: vi.fn(), runConnection: vi.fn(), setActive: vi.fn(), createKey: vi.fn(), revokeKey: vi.fn(), createWebhook: vi.fn(), testWebhook: vi.fn(), saveMappings: vi.fn(),
  testResult: { ok: true, serverVersion: "17.0" } as Record<string, unknown>,
}));
const ok = <T,>(data: T) => ({ data, isLoading: false, error: null, refetch: vi.fn() });
const connections = [
  { id: "c1", system: "odoo", name: "Main Odoo", baseUrl: "https://odoo.example.test", database: "db1", username: "svc", active: true, scheduledDaily: false, lastRunAt: null, connector: { status: "PROVEN_IN_CI", pulls: ["supplier"], pushes: ["purchase_order"] } },
  { id: "c2", system: "sap_b1", name: "Old SAP", baseUrl: "https://sap.example.test", database: null, username: null, active: true, scheduledDaily: true, lastRunAt: new Date().toISOString(), connector: { status: "UNVERIFIED", pulls: ["supplier"], pushes: [] } },
];
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()], Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "t" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));
vi.mock("@/lib/permissions", () => ({ useCan: () => h.manager, WriteGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "localized error" }));
vi.mock("@/lib/trpc", () => {
  const mutation = (name: string, result?: () => unknown) => ({ useMutation: (config: { onSuccess?: (r: unknown, v: unknown) => void }) => ({ mutate: (input: unknown) => { (h as never as Record<string, ReturnType<typeof vi.fn>>)[name](input); config.onSuccess?.(result ? result() : {}, input); }, isPending: false, variables: undefined, error: h.error }) });
  const inv = { invalidate: vi.fn() };
  return { trpc: {
    useUtils: () => ({ integrations: { listConnections: inv, listKeys: inv, listWebhooks: inv, mappings: inv, syncRuns: inv } }),
    integrations: {
      scopes: { useQuery: () => (h.metaError ? { data: undefined, isLoading: false, error: h.metaError, refetch: vi.fn() } : ok({ scopes: ["read:projects", "write:progress"], events: ["inspection.replied", "webhook.test"] })) },
      listConnections: { useQuery: () => ok(connections) }, listKeys: { useQuery: () => ok([{ id: "k1", name: "ERP key", keyPrefix: "pos_abcd", scopes: "read:projects", rateLimitPerMinute: 120, lastUsedAt: null, revokedAt: null }]) },
      listWebhooks: { useQuery: () => ok([{ id: "w1", url: "https://hook.example.test/in", events: "inspection.replied", active: true, createdAt: new Date().toISOString(), deliveries: { delivered: 3, failed: 1 } }]) },
      mappings: { useQuery: () => ok([{ type: "supplier", externalId: "ext-1", internalCode: "SUP-1" }]) },
      syncRuns: { useQuery: () => ok([{ id: "r1", system: "odoo", direction: "in", entityType: "supplier", trigger: "manual", received: 5, accepted: 3, rejected: 2, status: "partial", startedAt: new Date().toISOString() }]) },
      syncItems: { useQuery: () => ok([{ id: "i1", entityType: "supplier", externalId: "ext-9", outcome: "rejected", reason: "UNKNOWN_PROJECT", detail: null }]) },
      createConnection: mutation("createConnection"), setConnectionActive: mutation("setActive"),
      testConnection: mutation("testConnection", () => h.testResult),
      runConnection: mutation("runConnection", () => ({ pulled: [{ entity: "supplier", received: 5, accepted: 3, rejected: 2 }], pushed: null, skipped: [] })),
      createKey: mutation("createKey", () => ({ key: "pos_abcd_SECRETVALUE" })), revokeKey: mutation("revokeKey"),
      createWebhook: mutation("createWebhook", () => ({ secret: "whsec_ONCE" })), setWebhookActive: mutation("setActive"), testWebhook: mutation("testWebhook", () => ({ status: "delivered", lastStatusCode: 200, lastError: null })),
      saveMappings: mutation("saveMappings", () => ({ items: [{ outcome: "created", reason: null }] })),
    },
  } };
});

beforeEach(() => { h.language = "en"; h.manager = true; h.metaError = null; h.error = null; h.testResult = { ok: true, serverVersion: "17.0" }; for (const key of ["createConnection", "testConnection", "runConnection", "setActive", "createKey", "revokeKey", "createWebhook", "testWebhook", "saveMappings"] as const) h[key].mockReset(); });
afterEach(cleanup);
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

describe("IntegrationSettings", () => {
  it("is the company manager's: anyone else sees a sentence, not empty lists", () => {
    h.manager = false;
    render(<IntegrationSettings />);
    expect(screen.getByRole("note").textContent).toContain("belong to the company manager");
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("shows a load failure with a retry instead of an empty screen", () => {
    h.metaError = new Error("x");
    render(<IntegrationSettings />);
    expect(screen.getByRole("alert").textContent).toBe("localized error");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("states what each connector has been proven to do, and tests a connection", () => {
    render(<IntegrationSettings />);
    expect(document.querySelector('[data-connection="Main Odoo"] [data-connector-status]')!.textContent).toContain("Proven in CI");
    expect(document.querySelector('[data-connection="Old SAP"] [data-connector-status]')!.textContent).toContain("Unverified");
    expect(document.querySelector('[data-connection="Old SAP"]')!.textContent).toContain("read only");
    fireEvent.click(document.querySelector('[data-connection="Main Odoo"]')!.querySelector("button")!);
    expect(h.testConnection).toHaveBeenCalledWith({ tenantId: "t", connectionId: "c1" });
    expect(document.querySelector('[data-connection="Main Odoo"] [data-result="test"]')!.textContent).toContain("The connection works (17.0)");
  });

  it("reports a failed test with its reason, and a run with what was refused", () => {
    h.testResult = { ok: false, reason: "AUTH_FAILED" };
    render(<IntegrationSettings />);
    const odoo = document.querySelector('[data-connection="Main Odoo"]') as HTMLElement;
    fireEvent.click(odoo.querySelector("button")!);
    expect(odoo.querySelector("[data-result=test]")!.textContent).toContain("The connection failed: AUTH_FAILED");
    fireEvent.click(Array.from(odoo.querySelectorAll("button")).find(b => b.textContent === "Run now")!);
    expect(h.runConnection).toHaveBeenCalledWith({ tenantId: "t", connectionId: "c1", direction: "in" });
    expect(odoo.querySelector("[data-result=run]")!.textContent).toContain("supplier: Received 5 · Accepted 3 · Refused 2");
  });

  it("does not create a connection from an insecure address or an empty secret", () => {
    render(<IntegrationSettings />);
    const create = screen.getAllByRole("button", { name: "Add" }).at(-1)!;
    expect((create as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "ERP" } });
    fireEvent.change(screen.getByLabelText("System address (https)"), { target: { value: "http://plain.example.test" } });
    fireEvent.change(screen.getByLabelText(/Password or key/), { target: { value: "s3cret-test" } }); // secret-scan:allow
    expect((create as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("System address (https)"), { target: { value: "https://erp.example.test" } });
    expect((create as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(create);
    expect(h.createConnection).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", system: "odoo", baseUrl: "https://erp.example.test", secret: "s3cret-test" })); // secret-scan:allow
  });

  it("shows a new API key once, and revokes", () => {
    render(<IntegrationSettings />);
    tab("API keys");
    expect(screen.getByText(/ERP key/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Key name"), { target: { value: "New key" } });
    fireEvent.click(screen.getByLabelText("read:projects"));
    fireEvent.click(screen.getAllByRole("button", { name: "Add" }).at(-1)!);
    expect(h.createKey).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", name: "New key", scopes: ["read:projects"] }));
    expect(document.querySelector("[data-new-key]")!.textContent).toContain("pos_abcd_SECRETVALUE");
    fireEvent.click(screen.getByRole("button", { name: "Revoke the key" }));
    expect(h.revokeKey).toHaveBeenCalledWith({ tenantId: "t", keyId: "k1" });
  });

  it("creates a webhook with its secret shown once, and sends a test", () => {
    render(<IntegrationSettings />);
    tab("Webhooks");
    expect(screen.queryByLabelText("webhook.test")).toBeNull();
    fireEvent.change(screen.getByLabelText("Receiving address (https)"), { target: { value: "https://hook2.example.test/x" } });
    fireEvent.click(screen.getByLabelText("inspection.replied"));
    fireEvent.click(screen.getAllByRole("button", { name: "Add" }).at(-1)!);
    expect(h.createWebhook).toHaveBeenCalledWith({ tenantId: "t", url: "https://hook2.example.test/x", events: ["inspection.replied"] });
    expect(document.querySelector("[data-new-secret]")!.textContent).toContain("whsec_ONCE");
    fireEvent.click(screen.getByRole("button", { name: "Send a test" }));
    expect(h.testWebhook).toHaveBeenCalledWith({ tenantId: "t", endpointId: "w1" });
    expect(screen.getByText(/Test result: Delivered · HTTP 200/)).toBeTruthy();
  });

  it("saves a mapping, and a cost code needs its project", () => {
    render(<IntegrationSettings />);
    tab("Mappings");
    expect(document.querySelector("[data-mappings]")!.textContent).toContain("SUP-1");
    fireEvent.change(screen.getByLabelText("The other system's identifier"), { target: { value: "X1" } });
    fireEvent.change(screen.getByLabelText("Ours (code)"), { target: { value: "SUP-9" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the mapping" }));
    expect(h.saveMappings).toHaveBeenCalledWith({ tenantId: "t", system: "odoo", type: "supplier", records: [{ externalId: "X1", ref: "SUP-9", project: undefined }] });
    fireEvent.change(screen.getByLabelText("Mapping type"), { target: { value: "cost_code" } });
    expect((screen.getByRole("button", { name: "Save the mapping" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText("Project (for a cost code)")).toBeTruthy();
  });

  it("lists the runs and drills into what was refused and why", () => {
    render(<IntegrationSettings />);
    tab("Sync log");
    const run = document.querySelector('[data-run="r1"]') as HTMLElement;
    expect(run.textContent).toContain("Partial");
    fireEvent.click(run.querySelector("button")!);
    expect(document.querySelector("[data-items]")!.textContent).toContain("UNKNOWN_PROJECT");
  });

  it("speaks Arabic and Urdu", () => {
    h.language = "ar";
    render(<IntegrationSettings />);
    expect(screen.getByRole("tab", { name: "الاتصالات" })).toBeTruthy();
    cleanup(); h.language = "ur";
    render(<IntegrationSettings />);
    expect(screen.getByRole("tab", { name: "کنکشنز" })).toBeTruthy();
  });
});
