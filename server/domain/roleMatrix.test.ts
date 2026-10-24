import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { operationalPermissionCatalog, operationalRoleDefinitions } from "./operationalRoles";
import { cellFor, matrixColumns, matrixRoles, ownerBaseCodes, renderRoleMatrix, renderViewerAdditions, roleNamesAr, unenforcedCodes } from "./roleMatrix";

// docs/ROLE_MATRIX.md describes what the code does today. This file is what makes that description impossible to let drift: it fails when a role template, a server check,
// the owner's grant or the schema no longer matches the document. A failure here is NOT "the test is wrong": it means the access picture changed -- regenerate the document
// (`pnpm exec tsx scripts/write-role-matrix.ts`), read the diff, and let the owner see it.

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const knownCodes = new Set<string>([...ownerBaseCodes, ...operationalPermissionCatalog.map(entry => entry.code)]);

/** The catalogue codes a top-level function's text mentions in quotes. A function runs from its declaration to the next top-level declaration or closing brace. */
function codesInFunction(file: string, fn: string): string[] {
  const lines = read(file).split("\n");
  const declaration = new RegExp(`^(?:export )?(?:async )?function ${fn}\\b`);
  const start = lines.findIndex(line => declaration.test(line));
  if (start < 0) throw new Error(`${file}: function ${fn} was not found -- it was renamed or removed; update server/domain/roleMatrix.ts and docs/ROLE_MATRIX.md`);
  let end = start + 1;
  while (end < lines.length && !/^(?:export )?(?:async )?function |^(?:export )?const \w+ = (?:async )?\(|^}$/.test(lines[end])) end++;
  const text = lines.slice(start, end + 1).join("\n");
  return [...new Set([...text.matchAll(/"((?:project|pmo|executive|tenant|payment|schedule)\.[a-z_.]+)"/g)].map(match => match[1]).filter(code => knownCodes.has(code)))].sort();
}

describe("role matrix: the declared checks are the ones the code makes", () => {
  const sources = matrixColumns.flatMap(column => column.actions.flatMap(action => action.sources.map(source => ({ column: column.id, ...source }))));
  it("declares at least one source per action and covers every column that has actions", () => {
    expect(sources.length).toBeGreaterThan(30);
    for (const column of matrixColumns) for (const action of column.actions) expect(action.sources.length, `${column.id}/${action.tier}`).toBeGreaterThan(0);
  });
  it.each(sources.map(source => [`${source.column}: ${source.file} ${source.fn}`, source] as const))("%s demands exactly the declared permission codes", (_name, source) => {
    expect(codesInFunction(source.file, source.fn)).toEqual([...source.codes].sort());
  });
  it("only uses codes that exist in the catalogue", () => {
    for (const source of sources) for (const code of source.codes) expect(knownCodes.has(code), `${source.fn}: ${code}`).toBe(true);
  });
});

describe("role matrix: the rows are the roles the product installs", () => {
  it("has the owner and every operational role template, once, with an Arabic name that the screens also use", () => {
    expect(matrixRoles.map(role => role.code)).toEqual(["TENANT_OWNER", ...operationalRoleDefinitions.map(role => role.code)]);
    expect(Object.keys(roleNamesAr).sort()).toEqual(operationalRoleDefinitions.map(role => role.code).sort());
    const presentation = read("client/src/lib/operationalRolePresentation.ts");
    for (const role of matrixRoles) expect(presentation, role.code).toContain(`ar: "${role.ar}"`);
  });
  it("gives the owner the six base codes db.ts grants (ownerPermissions) plus the whole operational catalogue", () => {
    const block = read("server/db.ts").match(/const ownerPermissions = \[([\s\S]*?)\n\];/)?.[1] ?? "";
    expect([...block.matchAll(/code: "([a-z_.]+)"/g)].map(match => match[1])).toEqual([...ownerBaseCodes]);
    const owner = matrixRoles.find(role => role.code === "TENANT_OWNER")!;
    expect([...owner.permissions].sort()).toEqual([...knownCodes].sort());
  });
});

describe("role matrix: docs/ROLE_MATRIX.md is exactly what the code produces", () => {
  const doc = read("docs/ROLE_MATRIX.md");
  const between = (name: string) => doc.match(new RegExp(`<!-- ${name}:BEGIN -->\\n([\\s\\S]*?)\\n<!-- ${name}:END -->`))?.[1];
  it("the table equals the generated table", () => {
    expect(between("ROLE_MATRIX")).toBe(renderRoleMatrix());
  });
  it("the list of what the viewer role adds equals the generated list", () => {
    expect(between("VIEWER_ADDITIONS")).toBe(renderViewerAdditions());
  });
  it("is one table: a header, a separator, and a row per role, each with a cell per column", () => {
    const rows = renderRoleMatrix().split("\n");
    expect(rows).toHaveLength(2 + matrixRoles.length);
    for (const line of rows) expect(line.split(" | ").length).toBe(1 + matrixColumns.length);
  });
  it("every cell is one of the four words", () => {
    for (const role of matrixRoles) for (const column of matrixColumns) expect(["see", "edit", "approve", "none"]).toContain(cellFor(column, role.permissions));
  });
});

describe("role matrix: the claims the document makes about the code", () => {
  const walk = (dir: string): string[] => readdirSync(path.join(root, dir)).flatMap(name => {
    const relative = `${dir}/${name}`;
    if (statSync(path.join(root, relative)).isDirectory()) return name === "node_modules" ? [] : walk(relative);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [relative] : [];
  });
  const sourceFiles = [...walk("server"), ...walk("shared"), ...walk("client/src")];
  // the catalogue, the role templates, the matrix itself, the labels and a comment in paymentApproval.ts name the codes without checking them
  const mayNameWithoutChecking = new Set(["server/domain/operationalRoles.ts", "server/domain/roleMatrix.ts", "client/src/lib/labels.ts", "server/domain/paymentApproval.ts", "client/src/lib/operationalRolePresentation.ts"]);

  it("section 3: payment.prepare, payment.approve, project.create and schedule.write are granted but checked by no server function and no screen", () => {
    for (const code of unenforcedCodes) {
      const users = sourceFiles.filter(file => !mayNameWithoutChecking.has(file) && read(file).includes(`"${code}"`));
      expect(users, `${code} is now referenced outside the catalogue: update docs/ROLE_MATRIX.md section 3 and roleMatrix.ts`).toEqual([]);
    }
    for (const code of unenforcedCodes) expect(knownCodes.has(code)).toBe(true);
  });
  it("section 3, point 1: getProjectControlsForTenant demands only project.read yet returns budgets, costs and the cash flow", () => {
    const text = read("server/db.ts");
    const start = text.indexOf("export async function getProjectControlsForTenant");
    const body = text.slice(start, text.indexOf("type AdvisoryKind", start));
    expect(codesInFunction("server/db.ts", "getProjectControlsForTenant")).toEqual(["project.read"]);
    for (const returned of ["budgets", "costs", "cashFlow"]) expect(body).toMatch(new RegExp(`return \\{[^\\n]*\\b${returned}\\b`));
  });
  it("section 3, point 2: contract values, the BOQ, sub-contracts and the tender comparison are all readable with project.read alone", () => {
    for (const [file, fn] of [["server/db.ts", "getContractsCommitmentsForTenant"], ["server/db.ts", "getBoqItemsForTenant"], ["server/db.ts", "getSubcontractContractsForTenant"], ["server/tenderService.ts", "getTenderComparison"]]) expect(codesInFunction(file, fn), fn).toEqual(["project.read"]);
  });
  it("section 3, point 4: the consultant-submittal reply and write lists accept project.manage", () => {
    const text = read("server/consultantSubmittals.ts");
    expect(text).toMatch(/const REPLY = \[[^\]]*"project\.manage"/);
    expect(text).toMatch(/const WRITE = \[[^\]]*"project\.manage"/);
  });
  it("section 3, point 5: the schema stores no beneficiary data (the column of that name is empty for that reason)", () => {
    expect(read("drizzle/schema.ts")).not.toMatch(/beneficiar|مستفيد/i);
    expect(matrixColumns.find(column => column.id === "beneficiaries")?.actions).toEqual([]);
  });
  it("section 1: eleven of the seventeen templates lack project.read (all but QA/QC and the five of work order 5 that open projects), as the document says", () => {
    const without = operationalRoleDefinitions.filter(role => !(role.permissions as readonly string[]).includes("project.read")).map(role => role.code);
    expect(without).toEqual(["WAREHOUSE_CUSTODIAN", "PROCUREMENT_OFFICER", "FINANCE_MANAGER", "ACCOUNTANT", "HR_MANAGER", "PLANNING_ENGINEER", "SITE_ENGINEER", "HSE_MANAGER", "PROJECT_MANAGER", "EXECUTIVE", "PMO_LEAD"]);
    expect(operationalRoleDefinitions.length).toBe(17);
  });
});
