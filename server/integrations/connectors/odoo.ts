// The Odoo connector (work order 12, item 10). It speaks Odoo's documented external API: JSON-RPC at /jsonrpc, service `common` to sign in (authenticate) and service
// `object` (execute_kw) to read and write models. Pull: suppliers (res.partner), purchase orders (purchase.order), actual costs (account.analytic.line), supplier invoices
// (account.move) and payments (account.payment) become the platform's inbound records and go through applyErpBatch, so the same rules, mapping and log apply as for a push over the API.
// Push: projects (project.project), suppliers (res.partner) and progress (project.update) are written to Odoo and remembered, so a second push changes nothing.
// Proven in CI against a real Odoo Community 17 started in a container (docker/odoo in .github/workflows/odoo.yml); see docs/INTEGRATIONS.md.
export type OdooConfig = { baseUrl: string; database: string; login: string; secret: string; fetchImpl?: typeof fetch };

export class OdooClient {
  private uid: number | null = null;
  constructor(private readonly config: OdooConfig) {}
  private async rpc<T>(service: "common" | "object", method: string, args: unknown[]): Promise<T> {
    const doFetch = this.config.fetchImpl ?? fetch;
    const response = await doFetch(new URL("/jsonrpc", this.config.baseUrl), { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(30_000), body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args }, id: Math.floor(Math.random() * 1e9) }) });
    if (!response.ok) throw new Error(`ODOO_HTTP_${response.status}`);
    const body = await response.json() as { result?: T; error?: { message?: string; data?: { message?: string } } };
    if (body.error) throw new Error(`ODOO_ERROR: ${(body.error.data?.message ?? body.error.message ?? "error").slice(0, 200)}`);
    return body.result as T;
  }
  async version() { return this.rpc<{ server_version: string }>("common", "version", []); }
  async authenticate(): Promise<number> {
    if (this.uid) return this.uid;
    const uid = await this.rpc<number | false>("common", "authenticate", [this.config.database, this.config.login, this.config.secret, {}]);
    if (!uid) throw new Error("ODOO_AUTH_FAILED");
    this.uid = uid;
    return uid;
  }
  async call<T>(model: string, method: string, args: unknown[] = [], kwargs: Record<string, unknown> = {}): Promise<T> {
    const uid = await this.authenticate();
    return this.rpc<T>("object", "execute_kw", [this.config.database, uid, this.config.secret, model, method, args, kwargs]);
  }
  searchRead<T = Record<string, unknown>>(model: string, domain: unknown[], fields: string[], extra: { limit?: number; offset?: number; order?: string; context?: Record<string, unknown> } = {}) {
    return this.call<T[]>(model, "search_read", [domain], { fields, ...extra });
  }
  create(model: string, values: Record<string, unknown>) { return this.call<number>(model, "create", [values]); }
  write(model: string, ids: number[], values: Record<string, unknown>) { return this.call<boolean>(model, "write", [ids, values]); }
}

export type OdooSettings = {
  /** The project code a record belongs to when nothing says otherwise. */
  defaultProject?: string;
  /** Odoo analytic account id → project code. */
  analyticProjectMap?: Record<string, string>;
  /** Pull only what changed since this many days ago on a scheduled run (default: everything, which the log reports as unchanged). */
  sinceDays?: number;
};

const idOf = (value: unknown): number | null => (Array.isArray(value) && typeof value[0] === "number" ? (value[0] as number) : typeof value === "number" ? value : null);
const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() && value !== "false" ? value.trim() : undefined);
const day = (value: unknown) => (typeof value === "string" && value ? value.replace(" ", "T") + (value.length === 10 || /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? "" : "Z") : "");

export type PulledRecords = { suppliers: unknown[]; "purchase-orders": unknown[]; "actual-costs": unknown[]; invoices: unknown[]; payments: unknown[] };

/** Reads Odoo and shapes what it finds as the platform's inbound records. Reads only; nothing is written to Odoo here. */
export async function pullFromOdoo(client: OdooClient, settings: OdooSettings, since?: Date): Promise<{ records: PulledRecords; skipped: Array<{ entity: string; externalId: string; reason: string }> }> {
  const changed = since ? [["write_date", ">=", since.toISOString().replace("T", " ").slice(0, 19)]] : [];
  const skipped: Array<{ entity: string; externalId: string; reason: string }> = [];
  const projectOf = (analyticId: number | null): string | undefined => (analyticId !== null ? settings.analyticProjectMap?.[String(analyticId)] : undefined) ?? settings.defaultProject;

  const partners = await client.searchRead<{ id: number; name: string; ref: string | false; email: string | false; phone: string | false; active: boolean }>("res.partner", [["supplier_rank", ">", 0], ...changed], ["name", "ref", "email", "phone", "active"], { limit: 2000, order: "id" });
  const suppliers = partners.map(partner => ({ externalId: String(partner.id), code: text(partner.ref) ?? `ODOO-${partner.id}`, legalName: partner.name, contactEmail: text(partner.email), contactPhone: text(partner.phone), active: partner.active }));

  const orders = await client.searchRead<{ id: number; name: string; partner_id: [number, string]; date_order: string; amount_total: number; currency_id: [number, string]; state: string; notes: string | false; order_line: number[] }>("purchase.order", [["state", "!=", "cancel"], ...changed], ["name", "partner_id", "date_order", "amount_total", "currency_id", "state", "notes", "order_line"], { limit: 2000, order: "id" });
  const lines = orders.length ? await client.searchRead<{ id: number; order_id: [number, string]; analytic_distribution: Record<string, number> | false }>("purchase.order.line", [["order_id", "in", orders.map(order => order.id)]], ["order_id", "analytic_distribution"], { limit: 20000 }) : [];
  const analyticOfOrder = new Map<number, number>();
  for (const line of lines) { const first = line.analytic_distribution ? Object.keys(line.analytic_distribution)[0] : undefined; const orderId = idOf(line.order_id); if (first && orderId && !analyticOfOrder.has(orderId)) analyticOfOrder.set(orderId, Number(first.split(",")[0])); }
  const purchaseOrders = orders.flatMap(order => {
    const project = projectOf(analyticOfOrder.get(order.id) ?? null);
    if (!project) { skipped.push({ entity: "purchase-orders", externalId: String(order.id), reason: "PROJECT_NOT_MAPPED" }); return []; }
    return [{ externalId: String(order.id), project, number: order.name, supplier: String(idOf(order.partner_id)), orderDate: day(order.date_order), amount: order.amount_total, currency: order.currency_id?.[1] ?? "SAR", summary: text(order.notes) ?? "" }];
  });

  const analytic = await client.searchRead<{ id: number; name: string; date: string; amount: number; account_id: [number, string]; general_account_id: [number, string] | false }>("account.analytic.line", [["amount", "<", 0], ...(since ? [["write_date", ">=", since.toISOString().replace("T", " ").slice(0, 19)]] : [])], ["name", "date", "amount", "account_id", "general_account_id"], { limit: 5000, order: "id" });
  const accountIds = Array.from(new Set(analytic.map(line => idOf(line.general_account_id)).filter((value): value is number => value !== null)));
  const accounts = accountIds.length ? await client.searchRead<{ id: number; code: string }>("account.account", [["id", "in", accountIds]], ["code"], {}) : [];
  const codeOf = new Map(accounts.map(account => [account.id, account.code]));
  const actualCosts = analytic.flatMap(line => {
    const project = projectOf(idOf(line.account_id));
    const costCode = codeOf.get(idOf(line.general_account_id) ?? -1);
    if (!project) { skipped.push({ entity: "actual-costs", externalId: String(line.id), reason: "PROJECT_NOT_MAPPED" }); return []; }
    if (!costCode) { skipped.push({ entity: "actual-costs", externalId: String(line.id), reason: "COST_CODE_MISSING" }); return []; }
    return [{ externalId: String(line.id), project, costCode, amount: Math.abs(line.amount), incurredAt: day(line.date), description: line.name }];
  });

  const bills = await client.searchRead<{ id: number; name: string; partner_id: [number, string] | false; invoice_date: string | false; amount_total: number; state: string; payment_state: string; currency_id: [number, string] }>("account.move", [["move_type", "=", "in_invoice"], ...changed], ["name", "partner_id", "invoice_date", "amount_total", "state", "payment_state", "currency_id"], { limit: 2000, order: "id" });
  const invoices = bills.map(bill => ({ externalId: String(bill.id), number: bill.name, supplier: String(idOf(bill.partner_id) ?? ""), invoiceDate: bill.invoice_date || null, amount: bill.amount_total, currency: bill.currency_id?.[1], state: bill.state, paymentState: bill.payment_state }));

  const pays = await client.searchRead<{ id: number; name: string; partner_id: [number, string] | false; amount: number; date: string; state: string; payment_type: string; currency_id: [number, string] }>("account.payment", [...changed], ["name", "partner_id", "amount", "date", "state", "payment_type", "currency_id"], { limit: 2000, order: "id" });
  const payments = pays.map(payment => ({ externalId: String(payment.id), number: payment.name, supplier: String(idOf(payment.partner_id) ?? ""), amount: payment.amount, date: payment.date, state: payment.state, direction: payment.payment_type, currency: payment.currency_id?.[1] }));

  return { records: { suppliers, "purchase-orders": purchaseOrders, "actual-costs": actualCosts, invoices, payments }, skipped };
}

export type PushPlan = {
  projects: Array<{ id: string; code: string; name: string }>;
  suppliers: Array<{ id: string; code: string; legalName: string; contactEmail: string | null; contactPhone: string | null; active: boolean }>;
  progress: Array<{ projectId: string; code: string; percent: number }>;
};
export type PushMemory = { get: (kind: "project" | "supplier" | "progress", ourId: string) => Promise<{ odooId: number; hash: string } | null>; set: (kind: "project" | "supplier" | "progress", ourId: string, odooId: number, hash: string) => Promise<void> };
export type PushOutcome = { kind: string; ourId: string; outcome: "created" | "updated" | "unchanged" | "rejected"; reason?: string; odooId?: number };

/** Writes the platform's projects, suppliers and progress to Odoo. What was written is remembered with a hash, so a second push of the same facts changes nothing. */
export async function pushToOdoo(client: OdooClient, plan: PushPlan, memory: PushMemory, hash: (value: unknown) => string, today = new Date()): Promise<PushOutcome[]> {
  const results: PushOutcome[] = [];
  const safely = async (kind: string, ourId: string, work: () => Promise<PushOutcome>) => { try { results.push(await work()); } catch (error) { results.push({ kind, ourId, outcome: "rejected", reason: error instanceof Error ? error.message.slice(0, 120) : "error" }); } };

  for (const project of plan.projects) await safely("project", project.id, async () => {
    const values = { name: `${project.code} — ${project.name}` };
    const digest = hash(values); const known = await memory.get("project", project.id);
    if (known?.hash === digest) return { kind: "project", ourId: project.id, outcome: "unchanged", odooId: known.odooId };
    if (known) { await client.write("project.project", [known.odooId], values); await memory.set("project", project.id, known.odooId, digest); return { kind: "project", ourId: project.id, outcome: "updated", odooId: known.odooId }; }
    const found = await client.searchRead<{ id: number }>("project.project", [["name", "=", values.name]], ["id"], { limit: 1 });
    const odooId = found[0]?.id ?? await client.create("project.project", values);
    await memory.set("project", project.id, odooId, digest);
    return { kind: "project", ourId: project.id, outcome: found[0] ? "updated" : "created", odooId };
  });

  for (const supplier of plan.suppliers) await safely("supplier", supplier.id, async () => {
    const values = { name: supplier.legalName, ref: supplier.code, email: supplier.contactEmail || false, phone: supplier.contactPhone || false, supplier_rank: 1, active: supplier.active };
    const digest = hash(values); const known = await memory.get("supplier", supplier.id);
    if (known?.hash === digest) return { kind: "supplier", ourId: supplier.id, outcome: "unchanged", odooId: known.odooId };
    if (known) { await client.write("res.partner", [known.odooId], values); await memory.set("supplier", supplier.id, known.odooId, digest); return { kind: "supplier", ourId: supplier.id, outcome: "updated", odooId: known.odooId }; }
    const found = await client.searchRead<{ id: number }>("res.partner", [["ref", "=", supplier.code], ["supplier_rank", ">", 0], "|", ["active", "=", true], ["active", "=", false]], ["id"], { limit: 1 });
    const odooId = found[0]?.id ?? await client.create("res.partner", values);
    if (found[0]) await client.write("res.partner", [odooId], values);
    await memory.set("supplier", supplier.id, odooId, digest);
    return { kind: "supplier", ourId: supplier.id, outcome: found[0] ? "updated" : "created", odooId };
  });

  for (const item of plan.progress) await safely("progress", item.projectId, async () => {
    const projectMemory = await memory.get("project", item.projectId);
    if (!projectMemory) return { kind: "progress", ourId: item.projectId, outcome: "rejected", reason: "PROJECT_NOT_PUSHED" };
    const percent = Math.max(0, Math.min(100, Math.round(item.percent)));
    const digest = hash({ percent }); const known = await memory.get("progress", item.projectId);
    if (known?.hash === digest) return { kind: "progress", ourId: item.projectId, outcome: "unchanged", odooId: known.odooId };
    const odooId = await client.create("project.update", { name: `Dashio progress ${today.toISOString().slice(0, 10)}`, project_id: projectMemory.odooId, status: "on_track", progress: percent, description: `<p>${item.code}: ${percent}% (earned value over budget)</p>` });
    await memory.set("progress", item.projectId, odooId, digest);
    return { kind: "progress", ourId: item.projectId, outcome: known ? "updated" : "created", odooId };
  });
  return results;
}
