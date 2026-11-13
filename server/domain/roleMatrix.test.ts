import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { operationalPermissionCatalog, operationalRoleDefinitions } from "./operationalRoles";
import { importPermissionFor } from "../../shared/importPermissions";
import { cellFor, matrixColumns, matrixRoles, outsideColumns, ownerBaseCodes, renderRoleMatrix, renderSensitiveSummary, renderViewerAdditions, roleNamesAr, unenforcedCodes } from "./roleMatrix";

// docs/ROLE_MATRIX.md describes what the code does today. This file is what makes that description impossible to let drift: it fails when a role template, a server check,
// the owner's grant or the schema no longer matches the document. A failure here is NOT "the test is wrong": it means the access picture changed -- regenerate the document
// (`pnpm exec tsx scripts/write-role-matrix.ts`), read the diff, and let the owner see it.

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const knownCodes = new Set<string>([...ownerBaseCodes, ...operationalPermissionCatalog.map(entry => entry.code)]);

const CODE = /"((?:project|pmo|executive|tenant|payment|schedule)\.[a-z_.]+)"/g;
const quoted = (text: string) => [...text.matchAll(CODE)].map(match => match[1]).filter(code => knownCodes.has(code));

/** The text of a top-level function: from its declaration to the next top-level declaration or closing brace. Null when the file has no such function. */
function functionText(file: string, fn: string): string | null {
  const lines = read(file).split("\n");
  const declaration = new RegExp(`^(?:export )?(?:async )?function ${fn}\\b`);
  const start = lines.findIndex(line => declaration.test(line));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !/^(?:export )?(?:async )?function |^(?:export )?const \w+ = (?:async )?\(|^}$/.test(lines[end])) end++;
  return lines.slice(start, end + 1).join("\n");
}

/** Where a name used in `file` is defined: the file itself, or the relative module it is imported from (server/x.ts, shared/x.ts). */
function definingFile(file: string, name: string): string | null {
  const text = read(file);
  if (new RegExp(`^(?:export )?(?:const ${name} = |(?:async )?function ${name}\\b)`, "m").test(text)) return file;
  const from = text.match(new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from "(\\.{1,2}/[^"]+|@shared/[^"]+)"`))?.[1];
  if (!from) return null;
  const target = from.startsWith("@shared/") ? `shared/${from.slice(8)}.ts` : path.posix.normalize(path.posix.join(path.posix.dirname(file), `${from}.ts`));
  return definingFile(target, name);
}

/** The codes a top-level constant names (`const WRITE = ["project.manage"] as const`, `export const FINANCIAL_PERMISSION = "project.budget.manage"`). */
function constantCodes(file: string, name: string): string[] {
  const where = definingFile(file, name);
  if (!where) return [];
  return quoted(read(where).match(new RegExp(`^(?:export )?const ${name} = ([^\\n]*)`, "m"))?.[1] ?? "");
}

/** Helpers that gate an action on behalf of their caller; the reader follows them (they take the permission as a value, or name it themselves). */
const GATE_HELPER = /\b(authorize\w*|load|\w*[gG]ate|assert\w*Access)\(/g;

/**
 * The catalogue codes a top-level function demands: the codes it quotes, the codes of the constants it names (READ / WRITE / ROLLBACK_PERMISSION / FINANCIAL_PERMISSION),
 * importPermissionFor("module") and a gate helper's `moduleCode: "module"` evaluated with the real table, and the codes a gate helper it calls names itself
 * (pmcImportService.authorize names project.pmc.manage). Fixing the READER, not the sources: a service may keep its codes in constants.
 */
function codesInFunction(file: string, fn: string, depth = 0): string[] {
  const whole = functionText(file, fn);
  // a followed helper's declaration line types its permission parameter ("a" | "b"): those are what it ACCEPTS from a caller, not what it demands itself
  const text = whole === null || depth === 0 ? whole : whole.split("\n").slice(1).join("\n");
  if (text === null) throw new Error(`${file}: function ${fn} was not found -- it was renamed or removed; update server/domain/roleMatrix.ts and docs/ROLE_MATRIX.md`);
  const codes = new Set(quoted(text));
  for (const [, name] of text.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) for (const code of constantCodes(file, name)) codes.add(code);
  for (const [, moduleCode] of text.matchAll(/importPermissionFor\("([a-zA-Z]+)"\)/g)) for (const code of importPermissionFor(moduleCode)) codes.add(code);
  for (const [, moduleCode] of text.matchAll(/moduleCode: "([a-zA-Z]+)"/g)) for (const code of importPermissionFor(moduleCode)) codes.add(code);
  if (depth < 2) for (const [, helper] of text.matchAll(GATE_HELPER)) {
    if (helper === fn) continue;
    const where = definingFile(file, helper);
    if (where && functionText(where, helper) !== null) for (const code of codesInFunction(where, helper, depth + 1)) codes.add(code);
  }
  return [...codes].filter(code => knownCodes.has(code)).sort();
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

describe("role matrix: every permission in the catalogue is accounted for (D-21)", () => {
  const inColumns = new Set(matrixColumns.flatMap(column => column.actions.flatMap(action => action.sources.flatMap(source => source.codes))));
  /** A code with no column, no named exception and no «granted but unchecked» entry: the guard's answer, also used by its negative control. */
  const unaccounted = (catalogue: Iterable<string>) => [...catalogue].filter(code => !inColumns.has(code) && !(code in outsideColumns) && !unenforcedCodes.includes(code));
  it("each catalogue code is in a column, or named outside the columns with its reason, or listed as granted-but-unchecked", () => {
    expect(unaccounted(knownCodes)).toEqual([]);
  });
  it("the exceptions are not stale: none is also in a column, each is in the catalogue, and the server really checks it", () => {
    const serverText = readdirSync(path.join(root, "server")).filter(name => /\.ts$/.test(name) && !/\.test\.ts$/.test(name)).map(name => read(`server/${name}`)).join("\n") + read("server/domain/designCoordination.ts");
    for (const code of Object.keys(outsideColumns)) {
      expect(inColumns.has(code), `${code} is in a column now: remove it from outsideColumns`).toBe(false);
      expect(knownCodes.has(code), code).toBe(true);
      expect(serverText.includes(`"${code}"`), `${code} is checked nowhere in the server: move it to unenforcedCodes`).toBe(true);
    }
  });
  it("negative control: a made-up catalogue code with no column is caught", () => {
    expect(unaccounted([...knownCodes, "project.madeup.manage"])).toEqual(["project.madeup.manage"]);
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
  it("the owner's summary of the sensitive columns equals the generated summary", () => {
    expect(between("SENSITIVE")).toBe(renderSensitiveSummary());
  });
  it("is one table: a header, a separator, and a row per role, each with a cell per column", () => {
    const rows = renderRoleMatrix().split("\n");
    expect(rows).toHaveLength(2 + matrixRoles.length);
    for (const line of rows) expect(line.split(" | ").length).toBe(1 + matrixColumns.length);
  });
  it("the project manager edits the project setup (profile, logos, companies); a site engineer sees nothing there (D-42 a)", () => {
    const setup = matrixColumns.find(column => column.id === "setup")!;
    expect(cellFor(setup, matrixRoles.find(role => role.code === "PROJECT_MANAGER")!.permissions)).toBe("edit");
    expect(cellFor(setup, matrixRoles.find(role => role.code === "SITE_ENGINEER")!.permissions)).toBe("none");
  });
  it("the site engineer sees the reference lists (the daily report is filled from them) and does not edit them; the project manager edits them (D-44 a)", () => {
    const lists = matrixColumns.find(column => column.id === "referenceLists")!;
    expect(cellFor(lists, matrixRoles.find(role => role.code === "SITE_ENGINEER")!.permissions)).toBe("see");
    expect(cellFor(lists, matrixRoles.find(role => role.code === "PROJECT_MANAGER")!.permissions)).toBe("edit");
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

  it("section 3: payment.prepare, payment.approve and schedule.write are granted but checked by no server function and no screen", () => {
    for (const code of unenforcedCodes) {
      const users = sourceFiles.filter(file => !mayNameWithoutChecking.has(file) && read(file).includes(`"${code}"`));
      expect(users, `${code} is now referenced outside the catalogue: update docs/ROLE_MATRIX.md section 3 and roleMatrix.ts`).toEqual([]);
    }
    for (const code of unenforcedCodes) expect(knownCodes.has(code)).toBe(true);
  });
  it("section 3, point 1 (closed by Q-17, 205-1): getProjectControlsForTenant opens with project.read and returns the money only through projectMoneyVisible", () => {
    expect(codesInFunction("server/db.ts", "getProjectControlsForTenant")).toEqual(["project.read"]);
    const body = functionText("server/db.ts", "getProjectControlsForTenant")!;
    expect(body).toMatch(/if \(projectMoneyVisible\(snapshot, input\.projectId\)\) return/);
    // NEGATIVE: the other answer empties every money list and amount
    for (const emptied of ["budgets: \\[\\]", "costs: \\[\\]", "latestEvm: null", "cashFlow: null", "currentBudget: null"]) expect(body).toMatch(new RegExp(emptied));
    expect(codesInFunction("server/db.ts", "projectMoneyVisible")).toEqual(["project.budget.manage", "project.cashflow.read", "project.cost.enter", "project.evm.manage"]);
  });
  it("section 3, point 2 (closed by Q-17, 205-1): contract values, BOQ rates, sub-contract values and the tender comparison need a money power, not project.read alone", () => {
    for (const fn of ["getContractsCommitmentsForTenant", "getBoqItemsForTenant", "getSubcontractContractsForTenant"]) {
      expect(codesInFunction("server/db.ts", fn)).toEqual(["project.read"]);
      expect(functionText("server/db.ts", fn)!).toMatch(/(contract|boq)MoneyVisible\(snapshot, input\.projectId\)/);
    }
    expect(codesInFunction("server/tenderService.ts", "getTenderComparison")).not.toContain("project.read");
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
