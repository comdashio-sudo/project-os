import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 7.4 (#186, D-25): an isolation test is only as good as its "other side". This reads every database test file and fails when
//   1. two different company (or project) constants of one file hold the SAME id — the "other company" would be the actor's own;
//   2. a company constant is never created as a company, or a project constant never as a project (an "other side" that does not exist
//      proves nothing — the refusal could come from "not found" alone);
//   3. two files use the same company or project id — one suite's clean-up would delete the other's fixtures.
// Constants named like T, T2, T_OTHER, TENANT…, *_TENANT and P, P1, P_OTHER, PROJECT…, *_PROJECT are read; a company or project is
// "created" when the name appears in an INSERT INTO companies / projects (with the line before it, for a loop that feeds the
// insert) or in a seed…Tenant(…) helper call.
type Finding = string;
const UUID = /const\s+([A-Za-z_]\w*)\s*=\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/g;
const isTenant = (name: string) => /^(T\d*|T_[A-Z0-9_]+|TENANT\w*|OTHER_TENANT\w*|[A-Z_]*_TENANT\d*)$/.test(name);
const isProject = (name: string) => /^(P\d*|P_[A-Z0-9_]+|PROJECT\w*|OTHER_PROJECT\w*|[A-Z_]*_PROJECT\d*)$/.test(name);
const created = (source: string, table: "companies" | "projects") => [
  ...Array.from(source.matchAll(new RegExp(`(?:[^\\n]*\\n)?[^\\n]*INSERT INTO ${table}\\b[\\s\\S]{0,1500}?\\]\\s*\\)`, "g")), match => match[0]),
  ...Array.from(source.matchAll(/seed\w*Tenant\w*\([^)]*\)/g), match => match[0]),
].join("\n");

export function scanIsolationFixtures(files: Record<string, string>): Finding[] {
  const findings: Finding[] = []; const owner = new Map<string, string>();
  for (const [file, source] of Object.entries(files)) {
    const constants = Array.from(source.matchAll(UUID), match => ({ name: match[1], value: match[2] }));
    const tenants = constants.filter(item => isTenant(item.name)); const projects = constants.filter(item => isProject(item.name));
    for (const group of [tenants, projects]) {
      const seen = new Map<string, string>();
      for (const item of group) { const other = seen.get(item.value); if (other) findings.push(`${file}: ${item.name} has the same id as ${other}`); seen.set(item.value, item.name); }
    }
    const companies = created(source, "companies"); const projectRows = created(source, "projects");
    for (const item of tenants) if (!new RegExp(`\\b${item.name}\\b`).test(companies)) findings.push(`${file}: company ${item.name} is never created`);
    for (const item of projects) if (!new RegExp(`\\b${item.name}\\b`).test(projectRows)) findings.push(`${file}: project ${item.name} is never created`);
    for (const item of [...tenants, ...projects]) { const other = owner.get(item.value); if (other && other !== file) findings.push(`${file}: ${item.name} reuses an id of ${other}`); owner.set(item.value, file); }
  }
  return findings;
}

const serverDir = new URL("../", import.meta.url);
const databaseTests = Object.fromEntries(readdirSync(serverDir).filter(name => name.endsWith(".database.test.ts")).map(name => [name, readFileSync(new URL(name, serverDir), "utf8")]));

describe("isolation fixtures of the database tests (7.4)", () => {
  it("every other company and project is a different one, really created, and owned by one test file", () => {
    expect(Object.keys(databaseTests).length).toBeGreaterThan(100);
    expect(scanIsolationFixtures(databaseTests)).toEqual([]);
  });

  it("NEGATIVE: catches an 'other' company equal to the actor's, one never created, and an id two files share", () => {
    const same = `const T = "11111111-1111-4111-8111-111111111111"; const T2 = "11111111-1111-4111-8111-111111111111";
      const P = "22222222-2222-4222-8222-222222222222";
      beforeAll(async () => {
      await c.query("INSERT INTO companies (id) VALUES (?), (?)", [T, T2]); await c.query("INSERT INTO projects (id) VALUES (?)", [P]);`;
    const missing = `const T = "33333333-3333-4333-8333-333333333333"; const T_OTHER = "44444444-4444-4444-8444-444444444444";
      beforeAll(async () => {
      await c.query("INSERT INTO companies (id) VALUES (?)", [T]);`;
    const reuse = `const T = "33333333-3333-4333-8333-333333333333"; await c.query("INSERT INTO companies (id) VALUES (?)", [T]);`;
    expect(scanIsolationFixtures({ "a.database.test.ts": same, "b.database.test.ts": missing, "c.database.test.ts": reuse })).toEqual([
      "a.database.test.ts: T2 has the same id as T",
      "b.database.test.ts: company T_OTHER is never created",
      "c.database.test.ts: T reuses an id of b.database.test.ts",
    ]);
  });

  it("accepts the loop and helper ways the suites create the other side", () => {
    const loop = `const T = "55555555-5555-4555-8555-555555555555"; const T2 = "66666666-6666-4666-8666-666666666666";
      for (const [tenant, slug] of [[T, "a"], [T2, "b"]] as const) {
        await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, ?, ?)", [tenant, slug, slug]);
      }`;
    const helper = `const T = "77777777-7777-4777-8777-777777777777"; const T2 = "88888888-8888-4888-8888-888888888888"; const P2 = "99999999-9999-4999-8999-999999999999";
      await c.query("INSERT INTO companies (id) VALUES (?)", [T]); await seedOutsiderTenant(c, { tenantId: T2, projectId: P2, prefix: "x" });`;
    expect(scanIsolationFixtures({ "loop.database.test.ts": loop, "helper.database.test.ts": helper })).toEqual([]);
  });
});
