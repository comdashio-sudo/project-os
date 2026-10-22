import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conflictingPermissionPairs, findPermissionConflict, governedActionPermissions, importModulePermissions } from "./operationalPermissions";
import { operationalPermissionCatalog, operationalRoleDefinitions } from "./operationalRoles";

const db = readFileSync(new URL("../db.ts", import.meta.url), "utf8");
const importJobs = readFileSync(new URL("../importJobs.ts", import.meta.url), "utf8");
const pmcSources = ["../pmcService.ts", "../pmcScreensService.ts", "../pmcPlanService.ts", "../pmcImportService.ts", "../pmcProgrammeService.ts", "../designService.ts", "./designCoordination.ts", "../tenderService.ts"].map(file => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
const catalogCodes = operationalPermissionCatalog.map(permission => permission.code) as string[];

/** The text of one exported function of db.ts. */
function bodyOf(name: string) {
  const start = db.search(new RegExp(`export (?:async )?function ${name}\\(`));
  if (start < 0) throw new Error(`db.ts has no exported function ${name}`);
  const next = db.slice(start + 10).search(/\nexport (?:async )?function /);
  return db.slice(start, next < 0 ? undefined : start + 10 + next);
}

describe("operational permissions are enforced by the server (G-120)", () => {
  it("every governed function exists in db.ts, asks for exactly its permission, and no longer accepts the generic project.write", () => {
    for (const [name, needs] of Object.entries(governedActionPermissions)) {
      const body = bodyOf(name);
      expect(body, `${name} must not use project.write`).not.toContain('permission: "project.write"');
      for (const code of needs) expect(body, `${name} must check ${code}`).toContain(`"${code}"`);
      expect(body, `${name} must check its permission with assertTenantAccess`).toMatch(/assertTenantAccess\(snapshot, \{[^}]*permission: (?:"project\.[a-z.]+"|\[[^\]]+\])/);
    }
  });

  it("every operational permission is enforced somewhere: by a governed action, a named check in db.ts, or a PMC service", () => {
    const missing = catalogCodes.filter(code => {
      const governed = Object.values(governedActionPermissions).some(list => (list as readonly string[]).includes(code));
      const imported = Object.values(importModulePermissions).some(list => (list as readonly string[]).includes(code));
      const named = db.includes(`permission: "${code}"`) || pmcSources.includes(`"${code}"`);
      return !(governed || imported || named);
    });
    expect(missing).toEqual([]);
  });

  it("the writes that still ask for the generic project.write are only the non-operational ones (projects, documents, master plans)", () => {
    const allowed = new Set(["createProjectForTenant", "transitionProjectLifecycle", "createProjectDocumentWithVersion", "addProjectDocumentVersion", "saveMasterPlanVisualizationRuleForTenant", "createMasterPlanForTenant", "createMasterPlanVersionForTenant", "createMasterPlanSpatialEntityForTenant", "applyMasterPlanMappingFile", "importMasterPlanSpatialEntitiesFromFile", "transitionProjectDocumentStatus"]);
    const offenders: string[] = [];
    for (const match of db.matchAll(/export (?:async )?function (\w+)\(/g)) {
      if (bodyOf(match[1]).includes('permission: "project.write"') && !allowed.has(match[1])) offenders.push(match[1]);
    }
    expect(offenders).toEqual([]);
  });

  it("the data importer asks for the permission of the module, not the generic one", () => {
    // a new import: createAndAnalyzeDataImport (base64) and createImportUpload / registerImportUpload (direct upload) all pass through authorizeNewImport
    for (const name of ["authorizeNewImport", "reanalyzeDataImport", "confirmAndImportData"]) {
      const body = bodyOf(name);
      expect(body).not.toContain('permission: "project.write"');
      expect(body).toMatch(/importPermissionFor|anyImportPermission/);
    }
    expect(bodyOf("authorizeNewImport")).toContain("importPermissionFor(input.moduleCode)");
    expect(bodyOf("createAndAnalyzeDataImport")).toContain("authorizeNewImport(input)");
    expect(bodyOf("reanalyzeDataImport")).toContain("importPermissionFor(record.moduleCode)");
    expect(bodyOf("confirmAndImportData")).toContain("importPermissionFor(record.moduleCode)");
    // the background-job entry points read the record, then ask for ITS module's permission before they start anything
    const jobBody = (name: string) => { const start = importJobs.search(new RegExp(`export async function ${name}\\(`)); const next = importJobs.slice(start + 10).search(/\nexport (?:async )?function |\n\/\*\*/); return importJobs.slice(start, next < 0 ? undefined : start + 10 + next); };
    for (const name of ["createImportUpload", "registerImportUpload"]) expect(jobBody(name), name).toContain("authorizeNewImport(input)");
    for (const name of ["requestImportConfirmation", "requestImportReanalysis"]) {
      expect(jobBody(name), name).toContain("importPermissionFor(record.moduleCode)");
      expect(jobBody(name), name).not.toContain('permission: "project.write"');
    }
  });
});

describe("separation of duties by power (G-120, G-121)", () => {
  it("no built-in role holds both sides of a pair", () => {
    for (const role of operationalRoleDefinitions) expect(findPermissionConflict(role.permissions), role.code).toBeNull();
  });

  it("every pair names real permissions, and each of the three required duties is covered", () => {
    for (const { pair } of conflictingPermissionPairs) for (const code of pair) expect(catalogCodes).toContain(code);
    const covered = (a: string, b: string) => Boolean(findPermissionConflict([a, b]));
    // procurement != warehouse
    expect(covered("project.procurement.manage", "project.inventory.manage")).toBe(true);
    // accountant != finance manager (the powers that separate them: run vs approve payroll)
    expect(covered("project.payroll.run", "project.payroll.approve")).toBe(true);
    // HR != accountant
    expect(covered("project.payroll.run", "project.hr.manage")).toBe(true);
  });

  it("each built-in role pair of the work order is split by powers too, so renaming a role cannot dissolve it", () => {
    const powers = (code: string) => operationalRoleDefinitions.find(role => role.code === code)!.permissions as readonly string[];
    for (const [a, b] of [["PROCUREMENT_OFFICER", "WAREHOUSE_CUSTODIAN"], ["ACCOUNTANT", "FINANCE_MANAGER"], ["HR_MANAGER", "ACCOUNTANT"]]) {
      expect(findPermissionConflict([...powers(a), ...powers(b)]), `${a} + ${b}`).not.toBeNull();
    }
  });
});
