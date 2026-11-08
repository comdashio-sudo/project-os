import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { assertTenantAccess, holdsPermission, type AccessGrant, type TenantAccessSnapshot } from "./authorization";
import { buildTenantNavigation } from "./navigation";

// G-142 (D-18): a permission counts only together with the scope of the assignment that carries it. A viewer on project A who manages project B
// does not manage A. On main @ 935516d the first three cases failed (the snapshot pooled every permission with every scope).
const snapshot = (grants: AccessGrant[]): TenantAccessSnapshot => ({
  tenantId: "tenant-a", membershipStatus: "active", entitledProducts: ["EXECUTIVE", "PMO", "PROJECT"],
  permissionCodes: Array.from(new Set(grants.map(grant => grant.code))), scopes: grants.map(({ scopeType, scopeId }) => ({ scopeType, scopeId })), grants,
});
const A = { type: "project" as const, id: "project-a" };
const B = { type: "project" as const, id: "project-b" };
const viewerAManagerB = snapshot([{ code: "project.read", scopeType: "project", scopeId: "project-a" }, { code: "project.read", scopeType: "project", scopeId: "project-b" }, { code: "project.manage", scopeType: "project", scopeId: "project-b" }]);
const denied = (run: () => void) => { try { run(); return "allowed"; } catch (error) { return (error as Error).message; } };

describe("holdsPermission: the permission and the scope from one assignment", () => {
  it("manage on B does not reach A; it does reach B", () => {
    expect(holdsPermission(viewerAManagerB, "project.manage", A)).toBe(false);
    expect(holdsPermission(viewerAManagerB, "project.manage", B)).toBe(true);
    expect(holdsPermission(viewerAManagerB, "project.read", A)).toBe(true);
  });
  it("assertTenantAccess refuses the write on A and allows it on B", () => {
    expect(denied(() => assertTenantAccess(viewerAManagerB, { tenantId: "tenant-a", product: "PROJECT", permission: ["project.manage", "project.commitment.manage"], scope: A }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(denied(() => assertTenantAccess(viewerAManagerB, { tenantId: "tenant-a", product: "PROJECT", permission: ["project.manage", "project.commitment.manage"], scope: B }))).toBe("allowed");
  });
  it("the sidebar: a company-wide viewer who runs payroll on one project is not offered the company payroll page; my-performance on B is not offered on A", () => {
    const pooled = snapshot([{ code: "project.read", scopeType: "company", scopeId: null }, { code: "project.payroll.run", scopeType: "project", scopeId: "project-b" }, { code: "project.performance.read_own", scopeType: "project", scopeId: "project-b" }]);
    const ids = (projectId: string) => buildTenantNavigation({ tenantId: "tenant-a", projectId, snapshot: pooled }).map(item => item.id);
    expect(ids("project-a")).not.toContain("payroll");
    expect(ids("project-a")).not.toContain("my-performance");
    expect(ids("project-b")).toContain("my-performance");
    expect(ids("project-a")).toContain("project-controls");
  });
  it("a company-wide grant still covers every project, portfolio and the company; an unscoped question asks «on any assignment»", () => {
    const owner = snapshot([{ code: "project.manage", scopeType: "company", scopeId: null }]);
    for (const scope of [A, B, { type: "company" as const }, { type: "portfolio" as const, id: "p-1" }]) expect(holdsPermission(owner, "project.manage", scope)).toBe(true);
    expect(holdsPermission(viewerAManagerB, "project.manage")).toBe(true);
    expect(holdsPermission(viewerAManagerB, "tenant.manage")).toBe(false);
    expect(holdsPermission(viewerAManagerB, "project.manage", { type: "company" })).toBe(false);
  });
});

// Guard against a return of the merge: outside authorization.ts, no server decision may read the pooled fields.
function serverSources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "testing" || name === "node_modules" ? [] : serverSources(path);
    return /\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name) ? [path] : [];
  });
}
const POOLED = [/permissionCodes\s*\.\s*(includes|some|indexOf|find|filter|every)\s*\(/, /hasScopeAccess\s*\(\s*[\w.]*\.scopes\b/, /\bsnapshot\.scopes\s*\.\s*(some|find|filter|every|length)\b/];

describe("no decision on the pooled permissions (G-142)", () => {
  const root = join(__dirname, "..");
  const files = serverSources(root).filter(file => relative(root, file) !== join("domain", "authorization.ts"));
  it("scans the server (the scan is not vacuous)", () => expect(files.length).toBeGreaterThan(80));
  it("no file outside authorization.ts reads snapshot.permissionCodes or snapshot.scopes to decide", () => {
    const hits = files.flatMap(file => readFileSync(file, "utf8").split("\n").map((line, index) => ({ file: relative(root, file), line: index + 1, text: line })).filter(({ text }) => POOLED.some(pattern => pattern.test(text))));
    expect(hits.map(hit => `${hit.file}:${hit.line}`)).toEqual([]);
  });
  it("the guard catches the shapes it is meant to (negative control)", () => {
    for (const bad of ['snapshot.permissionCodes.includes("project.manage")', "hasScopeAccess(snapshot.scopes, scope)", 'access.permissionCodes.some(code => code === "x")', 'snapshot.scopes.some(scope => scope.scopeType === "company")']) expect(POOLED.some(pattern => pattern.test(bad))).toBe(true);
  });
});
