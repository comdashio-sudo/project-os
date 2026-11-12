import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// G-110 (Gate 6), the part a scan can prove for every record at once. For each server function a router calls:
//   - a mutation leaves an audit row;
//   - a function that takes a projectId proves the project belongs to the caller's tenant (a role scope of "company"
//     matches any project id, so the scope check alone does not keep one tenant out of another's project).
// The tenant, licence and permission checks are `entitlementGate.test.ts` (G-130). What a scan cannot prove — that the
// refusal really happens and the allowed path really works — stays in the live tests; docs/GATE6_RECORDS.md lists which.
const dir = __dirname;
const sources = Object.fromEntries(readdirSync(dir).filter(name => /\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name)).map(name => [name, readFileSync(join(dir, name), "utf8")]));
const routers = sources["routers.ts"];

function bodyOf(name: string): string | null {
  for (const source of Object.values(sources)) {
    const match = new RegExp(`export (?:async )?function ${name}\\b`).exec(source);
    if (!match) continue;
    const rest = source.slice(match.index + match[0].length);
    const next = rest.search(/\nexport (?:async )?function /);
    return source.slice(match.index, match.index + match[0].length + (next === -1 ? rest.length : next));
  }
  return null;
}

// Mutation procedures and the function each one calls (directly, or inside withClientRequest).
const mutations = Array.from(routers.matchAll(/(\w+): protectedProcedure[\s\S]*?\.mutation\(\(\{[^\n]*?\}\) => (?:withClientRequest\([^\n]*?\(\) => )?(\w+)\(/g)).map(match => ({ procedure: match[1], fn: match[2] }));
const calledNames = new Set(Array.from(routers.matchAll(/\b([a-zA-Z]+)\(\{/g)).map(match => match[1]));

const NO_AUDIT_BY_DESIGN: Record<string, string> = {
  setPmcUnitActivityStatus: "delegates to applyCellStatus (pmcService.ts), which writes the pmc.unit_activity_changed audit row in the same transaction",
  issueMaterialToCellForTenant: "delegates to createMaterialIssueForTenant, which writes the warehouse.material_issued_to_work audit row in the same transaction",
  analyzePmcImport: "analysis only: nothing is written until the approved file is confirmed, and confirmation is audited",
  exportPmcScreen: "a read-only export; PMC reads are not audited (listed as a gap in docs/GATE6_RECORDS.md)",
  claimSupportTicket: "delegates to transitionSupportTicket, which writes the audit row",
  createImportUpload: "mints a signed upload URL and records nothing; the import is recorded by registerImportUpload, whose job writes data_import_uploaded (or data_import_failed)",
  requestImportConfirmation: "a small import is written by confirmAndImportData, which writes data_import_completed; a large one by runImportConfirmation, which calls the same function and writes data_import_failed when it cannot",
  requestImportReanalysis: "a small import is re-analysed by reanalyzeDataImport; a large one by runImportAnalysis, whose job writes data_import_uploaded (or data_import_failed)",
  createSmartUpload: "mints a signed upload URL for the smart import box and records nothing; the import is recorded (and audited) by confirmSmartImport, which writes smart_import_confirmed and hands the rows to registerImportUpload",
  analyzeSmartUpload: "reads the uploaded original and answers what it understood; nothing is imported. The only record it can make is the AI-reading usage counter (smart_reading_usage), when the owner has turned the AI reading on",
  createDirectUpload: "mints a signed upload URL and records nothing; the attachment or site plan is recorded (and audited) by the document / site-plan procedure that takes the uploadKey",
  createCompanyLogoUpload: "mints a signed upload URL and records nothing; the logo is recorded (and audited) by tenant.updateProfile, which takes the uploadKey",
  previewProjectBoq: "reads the uploaded file and returns the check report; writes nothing (the save, saveProjectBoq, is audited)",
  previewProjectLabour: "reads the uploaded file and returns the check report; writes nothing (the save, saveProjectLabour, is audited)",
  previewProjectCashFlow: "reads the uploaded file and returns the check report; writes nothing (the save, saveProjectCashFlow, is audited)",
  exportProjectData: "a read-only export: it delegates to createDataExport or exportLedgerData, each of which writes the data_export_generated audit row",
  buildImportTemplateForUser: "returns a blank template generated from the importer's field table: no tenant or project data is read or written",
  beginEnrolment: "two-step verification belongs to a person, not a company: audit_logs requires a company and the platform owner has none (docs/STATE.md, work order 20, C); a failed code is logged by the server",
  confirmEnrolment: "as beginEnrolment: a person-level security step with no company to attach an audit row to",
  verifySecondStep: "as beginEnrolment: a person-level security step with no company to attach an audit row to",
  setOwnTwoStep: "D-81: a person switches his OWN second step on or off (proved by a current code): as beginEnrolment, person-level with no company to attach an audit row to",
  generateProjectAdvisoryForTenant: "records the advisor usage against the tenant's quota; the text is not stored as a record",
  setAccountLanguage: "a person's own interface-language preference (user_language_preferences, one row per signed-in person): not tenant data and not a protected business write, so no audit row (G-203)",
};
const PROJECT_GUARD = /assertProjectWithinTenant|resolveScopedAccess|authorizeInventory|authorizeNewImport|assertImportAccess|authorizeUpload|importAccess|authorizeExternalImport|authorizeDirectUpload|assertDesignAccess|assertTenderAccess|assertAttendanceAccess|assertPerformance|assertWbsItemWithinProject|where\(and\(eq\(projects\.id, input\.projectId\), eq\(projects\.tenantId, input\.tenantId\)\)\)|getProjectControlsForTenant/;

describe("Gate 6, static part (G-110)", () => {
  it("finds the mutations it is meant to guard (the scan is not vacuous)", () => {
    expect(mutations.length).toBeGreaterThan(100);
    expect(mutations.map(m => m.fn)).toEqual(expect.arrayContaining(["createProgressEntry", "createTeamTimeEntriesForTenant", "allocateApprovedPayrollCostForTenant"]));
  });

  it("every mutation writes an audit row, or is listed with the reason it does not", () => {
    const missing = mutations.map(m => m.fn).filter(fn => { const body = bodyOf(fn); return body !== null && !/auditLogs|audit/i.test(body) && !(fn in NO_AUDIT_BY_DESIGN); });
    expect(Array.from(new Set(missing))).toEqual([]);
  });

  it("every function that takes a project proves the project belongs to the caller's tenant", () => {
    const unguarded: string[] = [];
    for (const name of calledNames) {
      const body = bodyOf(name); if (!body) continue;
      const firstLine = body.split("\n")[0];
      if (!(firstLine.includes("projectId") && firstLine.includes("tenantId"))) continue;
      if (!PROJECT_GUARD.test(body)) unguarded.push(name);
    }
    expect(unguarded).toEqual([]);
  });

  it("keeps the audit exemption list honest", () => {
    const names = new Set(mutations.map(m => m.fn));
    const stale = Object.keys(NO_AUDIT_BY_DESIGN).filter(fn => names.has(fn) && bodyOf(fn) !== null && /auditLogs/.test(bodyOf(fn)!));
    expect(stale).toEqual([]);
  });
});
