import { describe, expect, it } from "vitest";
import { dynamics365Client, netsuiteClient, sapB1Client, vendorClientFor } from "./integrations/connectors/vendors";
import { csvTemplate, csvToRecords, parseCsv } from "./integrations/csv";
import { connectorRegistry } from "./integrations/connections";

// Work order 12, item 11. SAP Business One, Dynamics 365 and NetSuite are written against each vendor's DOCUMENTED API and exercised here against FIXTURES of the documented shapes.
// This proves the adapter reads those shapes, follows the vendor's paging, signs in the documented way, stays on the vendor's host and shapes the platform's inbound records.
// It does NOT prove a real SAP, Dynamics or NetSuite answers it: no account of theirs has been reached, so all three stay UNVERIFIED (docs/INTEGRATIONS.md).
type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function fixtureFetch(routes: Array<[RegExp, (call: Call) => Response]>) {
  const calls: Call[] = [];
  const impl = (async (input: URL | string, init: RequestInit = {}) => {
    const call: Call = { url: String(input), method: init.method ?? "GET", headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)), body: typeof init.body === "string" ? init.body : init.body instanceof URLSearchParams ? init.body.toString() : undefined };
    calls.push(call);
    const route = routes.find(([pattern]) => pattern.test(decodeURIComponent(call.url)));
    return route ? route[1](call) : json({ error: "no fixture" }, 404);
  }) as typeof fetch;
  return { impl, calls };
}

describe("the vendor connectors are honest about what they are", () => {
  it("Odoo is the only connector proven against a real system; the three vendors are UNVERIFIED and read-only", () => {
    expect(connectorRegistry.odoo.status).toBe("PROVEN_IN_CI");
    for (const system of ["sap_b1", "dynamics365", "netsuite"]) { expect(connectorRegistry[system].status).toBe("UNVERIFIED"); expect(connectorRegistry[system].pushes).toEqual([]); expect(connectorRegistry[system].pulls).not.toContain("actual-costs"); }
  });
});

describe("SAP Business One (Service Layer shapes)", () => {
  const settings = { projectMap: { "P-100": "PRJ-1" } };
  const connection = { baseUrl: "https://sap.example.test:50000", database: "SBODEMO", username: "manager", secret: "fixture-only" };
  it("signs in with the company database, sends the session cookie, follows odata.nextLink, and shapes the records", async () => {
    const { impl, calls } = fixtureFetch([
      [/\/b1s\/v1\/Login/, () => json({ SessionId: "sess-1", Version: "1000190" })],
      [/BusinessPartners\?.*skip=1/, () => json({ value: [{ CardCode: "V2", CardName: "Second", EmailAddress: null, Phone1: null, Valid: "tNO", Frozen: "tNO" }] })],
      [/BusinessPartners/, () => json({ value: [{ CardCode: "V1", CardName: "First Supplier", EmailAddress: "a@sap.example.test", Phone1: "123", Valid: "tYES", Frozen: "tNO" }], "odata.nextLink": "BusinessPartners?$skip=1" })],
      [/PurchaseOrders/, () => json({ value: [{ DocEntry: 11, DocNum: 5001, CardCode: "V1", CardName: "First Supplier", DocDate: "2026-10-02", DocTotal: 5520, DocCurrency: "SAR", Comments: "Cement", Project: "P-100" }, { DocEntry: 12, DocNum: 5002, CardCode: "V1", DocDate: "2026-10-03", DocTotal: 10, DocCurrency: "SAR", Project: null }] })],
      [/PurchaseInvoices/, () => json({ value: [{ DocEntry: 21, DocNum: 7001, CardCode: "V1", DocDate: "2026-10-06", DocTotal: 5520, DocCurrency: "SAR", Project: "P-100" }] })],
      [/VendorPayments/, () => json({ value: [{ DocEntry: 31, DocNum: 9001, CardCode: "V1", DocDate: "2026-10-07", CashSum: 0, TransferSum: 5000, CheckSum: 520, DocCurrency: "SAR" }] })],
    ]);
    const result = await sapB1Client(connection, settings, impl).pull();
    expect(JSON.parse(calls[0].body!)).toEqual({ CompanyDB: "SBODEMO", UserName: "manager", Password: "fixture-only" });
    expect(calls.slice(1).every(call => call.headers.Cookie === "B1SESSION=sess-1")).toBe(true);
    expect(result.records.suppliers).toEqual([
      { externalId: "V1", code: "V1", legalName: "First Supplier", contactEmail: "a@sap.example.test", contactPhone: "123", active: true },
      { externalId: "V2", code: "V2", legalName: "Second", contactEmail: undefined, contactPhone: undefined, active: false },
    ]);
    expect(result.records["purchase-orders"]).toEqual([{ externalId: "11", project: "PRJ-1", number: "5001", supplier: "V1", supplierName: "First Supplier", orderDate: "2026-10-02", amount: 5520, currency: "SAR", summary: "Cement" }]);
    expect(result.skipped).toEqual([{ entity: "purchase-orders", externalId: "12", reason: "PROJECT_NOT_MAPPED" }]); // no project on it, none set as default
    expect(result.records.invoices[0]).toMatchObject({ externalId: "21", amount: 5520, project: "P-100" });
    expect(result.records.payments[0]).toMatchObject({ externalId: "31", amount: 5520 });
  });
  it("a wrong password is a clear error, and a next-page link to another host is not followed", async () => {
    await expect(sapB1Client(connection, settings, fixtureFetch([[/Login/, () => json({ error: "bad" }, 401)]]).impl).test()).rejects.toThrow("SAP_HTTP_401");
    const { impl, calls } = fixtureFetch([[/Login/, () => json({ SessionId: "s" })], [/BusinessPartners/, () => json({ value: [], "odata.nextLink": "https://evil.example.test/steal" })]]);
    await expect(sapB1Client(connection, settings, impl).pull()).rejects.toThrow("SAP_FOREIGN_LINK");
    expect(calls.some(call => call.url.includes("evil.example.test"))).toBe(false);
  });
});

describe("Microsoft Dynamics 365 Finance (OData shapes)", () => {
  const connection = { baseUrl: "https://contoso.operations.dynamics.example.test", username: "client-id-fixture", secret: "fixture-only" };
  const tenant = "11111111-2222-3333-4444-555555555555";
  it("gets a token by client credentials for its own resource, then reads vendors, orders (amount from lines) and the rest", async () => {
    const { impl, calls } = fixtureFetch([
      [/oauth2\/v2\.0\/token/, () => json({ access_token: "tok" })],
      [/VendorsV2/, () => json({ value: [{ VendorAccountNumber: "US-101", VendorOrganizationName: "Contoso Concrete", PrimaryContactEmail: "c@d365.example.test", PrimaryContactPhone: null }] })],
      [/PurchaseOrderHeadersV2/, () => json({ value: [{ PurchaseOrderNumber: "PO-1", OrderVendorAccountNumber: "US-101", VendorOrderReference: "ref", OrderCreationDate: "2026-10-02", CurrencyCode: "SAR" }] })],
      [/PurchaseOrderLinesV2/, () => json({ value: [{ PurchaseOrderNumber: "PO-1", LineAmount: 1000, ProjectID: "PRJ-1" }, { PurchaseOrderNumber: "PO-1", LineAmount: 250.5, ProjectID: "PRJ-1" }] })],
      [/VendorInvoiceHeaders/, () => json({ value: [{ dataAreaId: "usmf", InvoiceNumber: "INV-1", InvoiceAmount: 5 }] })],
      [/VendorPaymentJournalLines/, () => json({ value: [{ dataAreaId: "usmf", JournalBatchNumber: "B1", Voucher: "V-1", AmountCurDebit: 5 }] })],
    ]);
    const result = await dynamics365Client(connection, { aadTenantId: tenant }, impl).pull();
    expect(calls[0].url).toBe(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`);
    const form = new URLSearchParams(calls[0].body); expect(form.get("grant_type")).toBe("client_credentials"); expect(form.get("scope")).toBe(`${new URL(connection.baseUrl).origin}/.default`);
    expect(calls.slice(1).every(call => call.headers.Authorization === "Bearer tok")).toBe(true);
    expect(result.records.suppliers).toEqual([{ externalId: "US-101", code: "US-101", legalName: "Contoso Concrete", contactEmail: "c@d365.example.test", contactPhone: undefined }]);
    expect(result.records["purchase-orders"]).toEqual([{ externalId: "PO-1", project: "PRJ-1", number: "PO-1", supplier: "US-101", orderDate: "2026-10-02", amount: 1250.5, currency: "SAR", summary: "ref" }]);
    expect(result.records.invoices[0]).toMatchObject({ externalId: "usmf:INV-1", InvoiceAmount: 5 });
    expect(result.records.payments[0]).toMatchObject({ externalId: "usmf:B1:V-1" });
  });
  it("refuses to sign in without a valid directory id, and surfaces a token refusal", async () => {
    await expect(dynamics365Client(connection, {}, fixtureFetch([]).impl).test()).rejects.toThrow("D365_AAD_TENANT_MISSING");
    await expect(dynamics365Client(connection, { aadTenantId: "../../evil" }, fixtureFetch([]).impl).test()).rejects.toThrow("D365_AAD_TENANT_MISSING");
    await expect(dynamics365Client(connection, { aadTenantId: tenant }, fixtureFetch([[/token/, () => json({}, 401)]]).impl).test()).rejects.toThrow("D365_AUTH_HTTP_401");
  });
});

describe("Oracle NetSuite (SuiteTalk REST shapes)", () => {
  const connection = { baseUrl: "https://1234567.suitetalk.api.netsuite.example.test", secret: "fixture-only" };
  it("lists ids with paging, reads each record, takes the project from the configured field, and shapes the records", async () => {
    const { impl, calls } = fixtureFetch([
      [/record\/v1\/vendor\?.*offset=1/, () => json({ items: [{ id: "502" }], hasMore: false })],
      [/record\/v1\/vendor\?/, () => json({ items: [{ id: "501" }], hasMore: true })],
      [/record\/v1\/vendor\/501/, () => json({ id: "501", entityId: "NS-V1", companyName: "NS Steel", email: "s@ns.example.test", phone: "9", isInactive: false })],
      [/record\/v1\/vendor\/502/, () => json({ id: "502", entityId: "NS-V2", companyName: "NS Old", isInactive: true })],
      [/record\/v1\/purchaseOrder\?/, () => json({ items: [{ id: "601" }], hasMore: false })],
      [/record\/v1\/purchaseOrder\/601/, () => json({ id: "601", tranId: "PO101", entity: { id: "501", refName: "NS Steel" }, tranDate: "2026-10-02", total: 777.5, currency: { refName: "SAR" }, memo: "Rebar", department: { id: "D7" }, class: { id: "C9" } })],
      [/record\/v1\/vendorBill\?/, () => json({ items: [{ id: "701" }], hasMore: false })],
      [/record\/v1\/vendorBill\/701/, () => json({ id: "701", tranId: "BILL1", entity: { id: "501" }, tranDate: "2026-10-06", total: 777.5, currency: { refName: "SAR" }, class: { id: "C9" } })],
      [/record\/v1\/vendorPayment\?/, () => json({ items: [], hasMore: false })],
    ]);
    const result = await netsuiteClient(connection, { projectMap: { C9: "PRJ-1" } }, impl).pull();
    expect(calls.every(call => call.headers.Authorization === "Bearer fixture-only")).toBe(true);
    expect(result.records.suppliers.map(row => (row as { code: string; active: boolean }).code + (row as { active: boolean }).active)).toEqual(["NS-V1true", "NS-V2false"]);
    expect(result.records["purchase-orders"]).toEqual([{ externalId: "601", project: "PRJ-1", number: "PO101", supplier: "501", supplierName: "NS Steel", orderDate: "2026-10-02", amount: 777.5, currency: "SAR", summary: "Rebar" }]);
    expect(result.records.invoices[0]).toMatchObject({ externalId: "701", number: "BILL1", supplier: "501", amount: 777.5, project: "C9" });
    expect(result.records.payments).toEqual([]);
    const byDepartment = await netsuiteClient(connection, { projectField: "department", projectMap: { D7: "PRJ-D" } }, impl).pull();
    expect((byDepartment.records["purchase-orders"][0] as { project: string }).project).toBe("PRJ-D");
  });
  it("vendorClientFor picks the adapter by system", () => {
    for (const system of ["sap_b1", "dynamics365", "netsuite"] as const) expect(typeof vendorClientFor(system, { baseUrl: "https://x.example.test", secret: "s" }, {}).pull).toBe("function");
  });
});

describe("the standard CSV", () => {
  it("every template has its header and a synthetic example row that reads back as a valid record", () => {
    for (const entity of ["suppliers", "purchase-orders", "actual-costs", "invoices", "payments", "employee-costs"] as const) {
      const template = csvTemplate(entity);
      expect(template.startsWith("﻿")).toBe(true);
      const back = csvToRecords(entity, template);
      expect(back.errors, entity).toEqual([]); expect(back.records, entity).toHaveLength(1);
      expect(template).not.toMatch(/@(?!.*\.example\.test)/); // synthetic addresses only
    }
  });
  it("reads quotes, doubled quotes, embedded line breaks, thousands separators and both line endings", () => {
    expect(parseCsv('a,"b,c","d ""q"" e"\r\n1,2,3\n"x\ny",,')).toEqual([["a", "b,c", 'd "q" e'], ["1", "2", "3"], ["x\ny", "", ""]]);
    expect(() => parseCsv('a,"unterminated')).toThrow("CSV_UNTERMINATED_QUOTE");
    expect(csvToRecords("actual-costs", 'externalId,project,costCode,amount,incurredAt\n1,P,C,"2,500.25",2026-10-01').records[0]).toMatchObject({ amount: 2500.25 });
  });
  it("reports the line and the reason of a row that cannot be read, and refuses a file with the wrong columns", () => {
    const bad = csvToRecords("suppliers", "externalId,code,legalName\nA,B,C\n,D,E\nF,G,");
    expect(bad.records).toHaveLength(1);
    expect(bad.errors).toEqual([{ line: 3, reason: "CSV_VALUE_MISSING", detail: "externalId" }, { line: 4, reason: "CSV_VALUE_MISSING", detail: "legalName" }]);
    expect(csvToRecords("suppliers", "code\nA").errors[0]).toMatchObject({ reason: "CSV_COLUMN_MISSING" });
    expect(csvToRecords("suppliers", "").errors[0]).toMatchObject({ reason: "CSV_EMPTY" });
  });
});
