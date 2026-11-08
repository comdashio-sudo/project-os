// Unit-test doubles of the database answer each select by the shape of its columns. The access snapshot reads its permissions as (permission, scope)
// pairs in ONE select since D-18 (G-142); the older doubles script «code» and «scopeId,scopeType» separately, each standing for a single assignment.
// This makes such a double answer the paired select with their product: every scripted permission on every scripted scope — exactly one assignment.
// The merged case (different permissions on different scopes) is tested with real pairs in domain/authorization.grants.test.ts and accessGrants.database.test.ts.
import type { Mock } from "vitest";

type Thenable = PromiseLike<unknown[]>;
export function pairGrantSelects(select: Mock) {
  const original = select.mockImplementation.bind(select);
  select.mockImplementation = ((implementation: (selection: Record<string, unknown>) => unknown) => original((selection: Record<string, unknown>) => {
    if (Object.keys(selection).sort().join(",") !== "code,scopeId,scopeType") return implementation(selection);
    const codes = implementation({ code: true }) as Thenable;
    const scopes = implementation({ scopeId: true, scopeType: true }) as Thenable;
    const rows = Promise.all([codes, scopes]).then(([codeRows, scopeRows]) => codeRows.flatMap(row => scopeRows.map(scope => ({ ...(row as object), ...(scope as object) }))));
    const query: Record<string, unknown> = { then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => rows.then(resolve, reject) };
    for (const step of ["from", "where", "orderBy", "innerJoin", "for", "limit"]) query[step] = () => query;
    return query;
  })) as typeof select.mockImplementation;
}
