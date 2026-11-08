// Proves, as the restricted application role, that the database protects itself. Run after every deploy (scripts/predeploy.mjs) and by hand.
//
//   AUDIT_APP_DATABASE_URL=postgres://project_os_app:…@host/db node --import tsx scripts/verify-db-security.mjs
//   (or DATABASE_URL = the owner's URL together with PROJECT_OS_APP_DB_PASSWORD)
//
// Evidence is read from the catalogue (has_table_privilege, pg_class, pg_roles) and confirmed with real statements inside a transaction that is
// always rolled back. A destructive probe (TRUNCATE) is attempted only when the catalogue already says the privilege is absent. Exit code 1
// unless every check passes. Prints names and counts, never a URL or a password.
import pg from "pg";
import { buildRestrictedAppDatabaseUrl } from "../server/domain/auditAccountIdentity.ts";
import { evaluateAuditGrantVerification } from "../server/domain/auditGrantVerification.ts";
import { describeDatabaseError } from "./lib/pgErrorReport.mjs";

const databaseUrl = process.env.AUDIT_APP_DATABASE_URL ?? (process.env.DATABASE_URL && process.env.PROJECT_OS_APP_DB_PASSWORD ? buildRestrictedAppDatabaseUrl(process.env.DATABASE_URL, process.env.PROJECT_OS_APP_DB_PASSWORD) : undefined);
if (!databaseUrl) {
  console.error("AUDIT_APP_DATABASE_URL, or DATABASE_URL with PROJECT_OS_APP_DB_PASSWORD, is required.");
  process.exit(2);
}

const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(databaseUrl).hostname);
const client = new pg.Client({ connectionString: databaseUrl, ssl: local || process.env.DATABASE_SSL === "off" ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== "off", ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n").trim() } : {}) } });
const codeOf = error => error?.code ?? "UNKNOWN";
// The stage that was running when something threw; a failure prints it with PostgreSQL's own fields (code, message, detail, hint, where) as ONE
// JSON line on stderr, so the release log says why (D-69: an uncaught DatabaseError reached the log as the single word "error").
let stage = "connect";
const secrets = [process.env.PROJECT_OS_APP_DB_PASSWORD, (() => { try { return decodeURIComponent(new URL(databaseUrl).password); } catch { return ""; } })()].filter(Boolean);
try {
  await client.connect();
  stage = "identify the connected role";
  const who = (await client.query("SELECT current_user AS name, current_database() AS database")).rows[0];
  if (who.name.split(".")[0] !== "project_os_app") throw new Error(`Connected as ${who.name}, not the restricted application role: refusing to certify the wrong account.`);

  stage = "audit_logs privileges";
  const privilege = async name => (await client.query("SELECT has_table_privilege(current_user, 'public.audit_logs', $1) AS yes", [name])).rows[0].yes;
  const auditPrivileges = { select: await privilege("SELECT"), insert: await privilege("INSERT"), update: await privilege("UPDATE"), delete: await privilege("DELETE"), truncate: await privilege("TRUNCATE"), references: await privilege("REFERENCES"), trigger: await privilege("TRIGGER") };

  // Real statements. UPDATE/DELETE use WHERE false: a privilege check happens before any row is looked at, so success changes nothing; the
  // transaction is rolled back regardless.
  stage = "audit_logs probes (rolled back)";
  const probe = async (operation, sql) => {
    await client.query("BEGIN");
    try { await client.query(sql); return { operation, denied: false }; }
    catch (error) { return { operation, denied: true, errorCode: codeOf(error) }; }
    finally { await client.query("ROLLBACK"); }
  };
  const probes = [
    await probe("update", "UPDATE public.audit_logs SET action = action WHERE false"),
    await probe("delete", "DELETE FROM public.audit_logs WHERE false"),
    auditPrivileges.truncate ? { operation: "truncate", denied: false } : await probe("truncate", "TRUNCATE public.audit_logs"),
  ];

  stage = "table catalogue";
  const catalogue = (await client.query(`
    SELECT c.relname AS name, c.relrowsecurity AS rls,
           has_table_privilege(current_user, c.oid, 'SELECT') AS readable,
           EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped) AS tenant
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`)).rows;
  const tables = { total: catalogue.length, withoutRowLevelSecurity: catalogue.filter(row => !row.rls).map(row => row.name), unreadable: catalogue.filter(row => !row.readable).map(row => row.name) };

  // Row-level security in action: with no per-request context, and as a tenant that does not exist, a tenant table shows nothing.
  const countRows = async setup => {
    let total = 0;
    await client.query("BEGIN");
    try {
      if (setup) await client.query(setup);
      for (const table of catalogue.filter(row => row.tenant && row.readable)) total += Number((await client.query(`SELECT count(*)::bigint AS n FROM public."${table.name}"`)).rows[0].n);
    } finally { await client.query("ROLLBACK"); }
    return total;
  };
  stage = "row-level security without a context (rolled back)";
  const noContextTenantRows = await countRows(null);
  stage = "row-level security as a stranger tenant (rolled back)";
  const strangerTenantRows = await countRows("SELECT set_config('app.tenant_ids', 'no-such-tenant', true), set_config('app.system', 'off', true)");

  stage = "Data API roles";
  const dataApi = (await client.query(`
    SELECT count(*)::int AS n FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE r.rolname IN ('anon', 'authenticated', 'service_role') AND ns.nspname = 'public' AND c.relkind = 'r'
       AND (has_table_privilege(r.oid, c.oid, 'SELECT') OR has_table_privilege(r.oid, c.oid, 'INSERT') OR has_table_privilege(r.oid, c.oid, 'UPDATE') OR has_table_privilege(r.oid, c.oid, 'DELETE'))`)).rows[0].n;
  stage = "role attributes";
  const role = (await client.query(`
    SELECT r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls,
           has_schema_privilege(current_user, 'public', 'CREATE') AS can_create,
           has_table_privilege(current_user, 'pg_catalog.pg_authid', 'SELECT') AS can_read_authid
      FROM pg_roles r WHERE r.rolname = current_user`)).rows[0];

  // Work order 18: sequences, function EXECUTE, and the default for functions created next. Read from the catalogue with the ACL functions (aclexplode, has_sequence_privilege), never a text pattern.
  stage = "sequences and functions";
  const sequencesUnusable = (await client.query(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'S' AND CASE WHEN c.relkind = 'S' THEN NOT has_sequence_privilege(current_user, c.oid, 'USAGE') END ORDER BY 1`)).rows.map(row => row.name);
  const functionsOpenToPublic = (await client.query(`
    SELECT DISTINCT p.proname AS name FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.pronamespace = 'public'::regnamespace AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') ORDER BY 1`)).rows.map(row => row.name);
  const newFunctionsClosedByDefault = (await client.query(`
    SELECT EXISTS (SELECT 1 FROM pg_default_acl d WHERE d.defaclobjtype = 'f' AND d.defaclnamespace = 0
                    AND d.defaclrole = (SELECT proowner FROM pg_proc WHERE proname = 'app_system' AND pronamespace = 'public'::regnamespace)
                    AND NOT EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 0)) AS closed`)).rows[0].closed;

  const evidence = { objects: { sequencesUnusable, functionsOpenToPublic, newFunctionsClosedByDefault }, auditPrivileges, probes, tables, noContextTenantRows, strangerTenantRows, dataApiRoleTablePrivileges: dataApi, role: { superuser: role.superuser, bypassRls: role.bypass_rls, canCreateInPublic: role.can_create, canReadPgAuthid: role.can_read_authid } };
  const result = evaluateAuditGrantVerification(evidence);
  console.log(JSON.stringify({ approved: result.approved, role: who.name, database: who.database, checks: result.checks, tables: tables.total, withoutRowLevelSecurity: tables.withoutRowLevelSecurity, unreadable: tables.unreadable, probeCodes: probes.map(({ operation, errorCode }) => ({ operation, errorCode })), noContextTenantRows, strangerTenantRows }, null, 2));
  if (!result.approved) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ verifyDbSecurity: "ERROR", ...describeDatabaseError(error, { stage, secrets }) }));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
