// SAP Business One, Microsoft Dynamics 365 and Oracle NetSuite (work order 12, item 11): one adapter each on the vendor's official REST API, read side only. Each reads the vendor's
// suppliers, purchase orders, supplier invoices and vendor payments and shapes them as the platform's inbound records, which then go through the same applyErpBatch as every other
// source. HONEST STATUS: these are written against the vendors' DOCUMENTED API shapes and tested against fixtures of those shapes (server/vendor.connectors.test.ts) — no SAP, Dynamics
// or NetSuite account has ever answered them. Their status is UNVERIFIED and docs/INTEGRATIONS.md says so. What the vendors' APIs need that this layer cannot assume (a field that holds
// the project, a company database) is a SETTING of the connection, not a guess. Actual costs and what the platform sends back go through the standard CSV template and the export API.
import type { PulledRecords } from "./odoo";

export const VENDOR_SYSTEMS = ["sap_b1", "dynamics365", "netsuite"] as const;
export type VendorSystem = (typeof VENDOR_SYSTEMS)[number];

export type VendorSettings = {
  /** The project code when the vendor's document names none. */
  defaultProject?: string;
  /** The vendor's project / class / dimension value → our project code. */
  projectMap?: Record<string, string>;
  /** Dynamics 365: the Azure AD tenant (directory) id the app registration lives in. */
  aadTenantId?: string;
  /** NetSuite: the field of a purchase order that names the project (default `class`). */
  projectField?: string;
  /** Pull only what changed since this many days ago on a scheduled run. */
  sinceDays?: number;
};
export type VendorConnection = { baseUrl: string; database?: string | null; username?: string | null; secret: string };
export type VendorPull = { records: PulledRecords; skipped: Array<{ entity: string; externalId: string; reason: string }> };
export interface VendorClient { test(): Promise<{ serverVersion?: string }>; pull(since?: Date): Promise<VendorPull> }

const MAX_PAGES = 40;
const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : undefined);
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0);
const odataDate = (since?: Date) => (since ? since.toISOString() : undefined);

class Http {
  constructor(private readonly origin: string, private readonly fetchImpl: typeof fetch, private readonly label: string) {}
  async json<T>(url: string, init: RequestInit = {}): Promise<T> {
    // a next-page link the vendor returns must stay on the vendor's own host
    if (new URL(url, this.origin).origin !== this.origin) throw new Error(`${this.label}_FOREIGN_LINK`);
    const response = await this.fetchImpl(new URL(url, this.origin), { ...init, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${this.label}_HTTP_${response.status}`);
    return (await response.json()) as T;
  }
  /** Follows OData `nextLink` (either spelling) up to a bound. */
  async odataAll<T>(first: string, headers: Record<string, string>): Promise<T[]> {
    const rows: T[] = []; let next: string | undefined = first;
    for (let page = 0; next && page < MAX_PAGES; page += 1) {
      const body: { value?: T[]; "odata.nextLink"?: string; "@odata.nextLink"?: string } = await this.json(next, { headers });
      rows.push(...(body.value ?? []));
      next = body["@odata.nextLink"] ?? body["odata.nextLink"];
    }
    return rows;
  }
}

const empty = (): PulledRecords => ({ suppliers: [], "purchase-orders": [], "actual-costs": [], invoices: [], payments: [] });
function projectResolver(settings: VendorSettings, skipped: VendorPull["skipped"], entity: string) {
  return (raw: unknown, externalId: string): string | undefined => {
    const key = text(raw);
    const project = key ? (settings.projectMap?.[key] ?? key) : settings.defaultProject;
    if (!project) skipped.push({ entity, externalId, reason: "PROJECT_NOT_MAPPED" });
    return project;
  };
}

// ----------------------------------------------------------------------------------------------------------------------------------- SAP Business One
// Service Layer: POST /b1s/v1/Login {CompanyDB, UserName, Password} → {SessionId}, then the session id travels as the B1SESSION cookie; entities are OData collections.
export function sapB1Client(connection: VendorConnection, settings: VendorSettings, fetchImpl: typeof fetch = fetch): VendorClient {
  const origin = new URL(connection.baseUrl).origin;
  const http = new Http(origin, fetchImpl, "SAP");
  const login = async () => {
    const result = await http.json<{ SessionId?: string; Version?: string }>("/b1s/v1/Login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ CompanyDB: connection.database ?? "", UserName: connection.username ?? "", Password: connection.secret }) });
    if (!result.SessionId) throw new Error("SAP_AUTH_FAILED");
    return { headers: { Cookie: `B1SESSION=${result.SessionId}`, Prefer: "odata.maxpagesize=200" } as Record<string, string>, version: result.Version };
  };
  return {
    async test() { const session = await login(); return { serverVersion: session.version }; },
    async pull(since) {
      const { headers } = await login();
      const skipped: VendorPull["skipped"] = []; const records = empty();
      const changed = since ? ` and UpdateDate ge '${odataDate(since)!.slice(0, 10)}'` : "";
      const partners = await http.odataAll<Record<string, unknown>>(`/b1s/v1/BusinessPartners?$filter=CardType eq 'cSupplier'${changed}&$select=CardCode,CardName,EmailAddress,Phone1,Valid,Frozen`, headers);
      records.suppliers = partners.flatMap(row => { const code = text(row.CardCode); return code ? [{ externalId: code, code, legalName: text(row.CardName) ?? code, contactEmail: text(row.EmailAddress), contactPhone: text(row.Phone1), active: row.Valid !== "tNO" && row.Frozen !== "tYES" }] : []; });
      const orderProject = projectResolver(settings, skipped, "purchase-orders");
      const orders = await http.odataAll<Record<string, unknown>>(`/b1s/v1/PurchaseOrders?$filter=Cancelled eq 'tNO'${changed}&$select=DocEntry,DocNum,CardCode,CardName,DocDate,DocTotal,DocCurrency,Comments,Project`, headers);
      records["purchase-orders"] = orders.flatMap(row => { const id = text(row.DocEntry); if (!id) return []; const project = orderProject(row.Project, id); return project ? [{ externalId: id, project, number: text(row.DocNum) ?? id, supplier: text(row.CardCode), supplierName: text(row.CardName), orderDate: text(row.DocDate) ?? "", amount: num(row.DocTotal), currency: text(row.DocCurrency) ?? "SAR", summary: text(row.Comments) ?? "" }] : []; });
      const bills = await http.odataAll<Record<string, unknown>>(`/b1s/v1/PurchaseInvoices?$filter=Cancelled eq 'tNO'${changed}&$select=DocEntry,DocNum,CardCode,DocDate,DocTotal,DocCurrency,Project`, headers);
      records.invoices = bills.flatMap(row => { const id = text(row.DocEntry); return id ? [{ externalId: id, number: text(row.DocNum), supplier: text(row.CardCode), date: text(row.DocDate), amount: num(row.DocTotal), currency: text(row.DocCurrency), project: text(row.Project) }] : []; });
      const payments = await http.odataAll<Record<string, unknown>>(`/b1s/v1/VendorPayments?$filter=Cancelled eq 'tNO'${changed}&$select=DocEntry,DocNum,CardCode,DocDate,CashSum,TransferSum,CheckSum,DocCurrency`, headers);
      records.payments = payments.flatMap(row => { const id = text(row.DocEntry); return id ? [{ externalId: id, number: text(row.DocNum), supplier: text(row.CardCode), date: text(row.DocDate), amount: num(row.CashSum) + num(row.TransferSum) + num(row.CheckSum), currency: text(row.DocCurrency) }] : []; });
      return { records, skipped };
    },
  };
}

// ----------------------------------------------------------------------------------------------------------------------------------- Dynamics 365 Finance
// OAuth 2.0 client credentials against Azure AD (client id = username, client secret = the sealed secret), then OData entities under /data.
export function dynamics365Client(connection: VendorConnection, settings: VendorSettings, fetchImpl: typeof fetch = fetch): VendorClient {
  const origin = new URL(connection.baseUrl).origin;
  const http = new Http(origin, fetchImpl, "D365");
  const token = async () => {
    if (!settings.aadTenantId || !/^[0-9a-fA-F-]{8,64}$/.test(settings.aadTenantId)) throw new Error("D365_AAD_TENANT_MISSING");
    const response = await fetchImpl(`https://login.microsoftonline.com/${settings.aadTenantId}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: connection.username ?? "", client_secret: connection.secret, scope: `${origin}/.default` }), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`D365_AUTH_HTTP_${response.status}`);
    const body = (await response.json()) as { access_token?: string };
    if (!body.access_token) throw new Error("D365_AUTH_FAILED");
    return { Authorization: `Bearer ${body.access_token}` } as Record<string, string>;
  };
  return {
    async test() { const headers = await token(); await http.json("/data/VendorsV2?$top=1&$select=VendorAccountNumber", { headers }); return {}; },
    async pull(since) {
      const headers = await token();
      const skipped: VendorPull["skipped"] = []; const records = empty();
      const changed = since ? ` and ModifiedDateTime ge ${odataDate(since)}` : "";
      const vendors = await http.odataAll<Record<string, unknown>>(`/data/VendorsV2?cross-company=true&$select=VendorAccountNumber,VendorOrganizationName,PrimaryContactEmail,PrimaryContactPhone${since ? `&$filter=ModifiedDateTime ge ${odataDate(since)}` : ""}`, headers);
      records.suppliers = vendors.flatMap(row => { const code = text(row.VendorAccountNumber); return code ? [{ externalId: code, code, legalName: text(row.VendorOrganizationName) ?? code, contactEmail: text(row.PrimaryContactEmail), contactPhone: text(row.PrimaryContactPhone) }] : []; });
      const orderProject = projectResolver(settings, skipped, "purchase-orders");
      const heads = await http.odataAll<Record<string, unknown>>(`/data/PurchaseOrderHeadersV2?cross-company=true&$filter=PurchaseOrderStatus ne Microsoft.Dynamics.DataEntities.PurchStatus'Canceled'${changed}&$select=PurchaseOrderNumber,OrderVendorAccountNumber,VendorOrderReference,OrderCreationDate,CurrencyCode`, headers);
      const lines = await http.odataAll<Record<string, unknown>>(`/data/PurchaseOrderLinesV2?cross-company=true&$select=PurchaseOrderNumber,LineAmount,ProjectID`, headers);
      const sum = new Map<string, number>(); const projectOfOrder = new Map<string, string>();
      for (const line of lines) { const number = text(line.PurchaseOrderNumber); if (!number) continue; sum.set(number, (sum.get(number) ?? 0) + num(line.LineAmount)); const projectId = text(line.ProjectID); if (projectId && !projectOfOrder.has(number)) projectOfOrder.set(number, projectId); }
      records["purchase-orders"] = heads.flatMap(row => { const number = text(row.PurchaseOrderNumber); if (!number) return []; const project = orderProject(projectOfOrder.get(number), number); return project ? [{ externalId: number, project, number, supplier: text(row.OrderVendorAccountNumber), orderDate: text(row.OrderCreationDate) ?? "", amount: sum.get(number) ?? 0, currency: text(row.CurrencyCode) ?? "SAR", summary: text(row.VendorOrderReference) ?? "" }] : []; });
      const bills = await http.odataAll<Record<string, unknown>>(`/data/VendorInvoiceHeaders?cross-company=true${since ? `&$filter=ModifiedDateTime ge ${odataDate(since)}` : ""}`, headers);
      records.invoices = bills.flatMap(row => { const number = text(row.InvoiceNumber) ?? text(row.InvoiceId); return number ? [{ externalId: `${text(row.dataAreaId) ?? ""}:${number}`, ...row }] : []; });
      const payments = await http.odataAll<Record<string, unknown>>(`/data/VendorPaymentJournalLines?cross-company=true${since ? `&$filter=ModifiedDateTime ge ${odataDate(since)}` : ""}`, headers);
      records.payments = payments.flatMap(row => { const voucher = text(row.Voucher); return voucher ? [{ externalId: `${text(row.dataAreaId) ?? ""}:${text(row.JournalBatchNumber) ?? ""}:${voucher}`, ...row }] : []; });
      return { records, skipped };
    },
  };
}

// ----------------------------------------------------------------------------------------------------------------------------------- Oracle NetSuite
// SuiteTalk REST: https://<account>.suitetalk.api.netsuite.com/services/rest/record/v1/<type>. A list answers ids; each record is then read. The sealed secret is an OAuth 2.0 access
// token the company obtains for an integration record (machine-to-machine); how it is renewed is the company's, not this layer's.
export function netsuiteClient(connection: VendorConnection, settings: VendorSettings, fetchImpl: typeof fetch = fetch): VendorClient {
  const origin = new URL(connection.baseUrl).origin;
  const http = new Http(origin, fetchImpl, "NETSUITE");
  const headers = { Authorization: `Bearer ${connection.secret}`, Accept: "application/json" } as Record<string, string>;
  const list = async (type: string, since?: Date): Promise<string[]> => {
    const ids: string[] = [];
    for (let offset = 0, page = 0; page < MAX_PAGES; page += 1) {
      const q = since ? `&q=${encodeURIComponent(`lastModifiedDate AFTER "${since.toISOString().slice(0, 10)}"`)}` : "";
      const body = await http.json<{ items?: Array<{ id?: string }>; hasMore?: boolean; count?: number }>(`/services/rest/record/v1/${type}?limit=200&offset=${offset}${q}`, { headers });
      for (const item of body.items ?? []) if (item.id) ids.push(item.id);
      if (!body.hasMore || !body.items?.length) break;
      offset += body.items.length;
    }
    return ids;
  };
  const read = async (type: string, ids: string[]): Promise<Array<Record<string, unknown>>> => {
    const out: Array<Record<string, unknown>> = [];
    for (const id of ids.slice(0, 2000)) out.push(await http.json<Record<string, unknown>>(`/services/rest/record/v1/${type}/${encodeURIComponent(id)}`, { headers }));
    return out;
  };
  const ref = (value: unknown): string | undefined => (value && typeof value === "object" ? text((value as { id?: unknown }).id) : text(value));
  const refName = (value: unknown): string | undefined => (value && typeof value === "object" ? text((value as { refName?: unknown }).refName) : undefined);
  return {
    async test() { await http.json("/services/rest/record/v1/vendor?limit=1", { headers }); return {}; },
    async pull(since) {
      const skipped: VendorPull["skipped"] = []; const records = empty();
      const field = settings.projectField ?? "class";
      records.suppliers = (await read("vendor", await list("vendor", since))).flatMap(row => { const id = text(row.id); const code = text(row.entityId); return id && code ? [{ externalId: id, code, legalName: text(row.companyName) ?? code, contactEmail: text(row.email), contactPhone: text(row.phone), active: row.isInactive !== true }] : []; });
      const orderProject = projectResolver(settings, skipped, "purchase-orders");
      records["purchase-orders"] = (await read("purchaseOrder", await list("purchaseOrder", since))).flatMap(row => { const id = text(row.id); if (!id) return []; const project = orderProject(ref(row[field]), id); return project ? [{ externalId: id, project, number: text(row.tranId) ?? id, supplier: ref(row.entity), supplierName: refName(row.entity), orderDate: text(row.tranDate) ?? "", amount: num(row.total), currency: refName(row.currency) ?? "SAR", summary: text(row.memo) ?? "" }] : []; });
      records.invoices = (await read("vendorBill", await list("vendorBill", since))).flatMap(row => { const id = text(row.id); return id ? [{ externalId: id, number: text(row.tranId), supplier: ref(row.entity), date: text(row.tranDate), amount: num(row.total), currency: refName(row.currency), project: ref(row[field]) }] : []; });
      records.payments = (await read("vendorPayment", await list("vendorPayment", since))).flatMap(row => { const id = text(row.id); return id ? [{ externalId: id, number: text(row.tranId), supplier: ref(row.entity), date: text(row.tranDate), amount: num(row.total ?? row.payment), currency: refName(row.currency) }] : []; });
      return { records, skipped };
    },
  };
}

export function vendorClientFor(system: VendorSystem, connection: VendorConnection, settings: VendorSettings, fetchImpl?: typeof fetch): VendorClient {
  return system === "sap_b1" ? sapB1Client(connection, settings, fetchImpl) : system === "dynamics365" ? dynamics365Client(connection, settings, fetchImpl) : netsuiteClient(connection, settings, fetchImpl);
}
