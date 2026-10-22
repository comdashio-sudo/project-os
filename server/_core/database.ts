// The one place that opens a PostgreSQL connection (Supabase Postgres in production, a local PostgreSQL in tests).
//
// Two layers keep one company's rows from another's (work order 6, item 3):
//   1. the server layer, as before: every function resolves the caller's access snapshot and filters by tenant;
//   2. row-level security in the database, keyed to a per-request context this file installs. A function that forgot its
//      tenant filter then reads zero foreign rows instead of someone else's.
//
// The context travels in AsyncLocalStorage. Every statement that runs inside a context is sent as
//   BEGIN; SELECT set_config('app.user_id'|'app.tenant_ids'|'app.system', …, true);   <statement>;   COMMIT
// (and a drizzle transaction sets the same values right after its BEGIN), so the setting lives exactly as long as the
// statement or transaction and never leaks to the next user of a pooled connection. That also works behind a
// transaction-mode pooler (Supabase's port 6543), where a session-level SET would not survive between statements.
//
// A statement that runs with no context sees NO tenant rows: the safe default is denial. Code that legitimately needs
// every tenant (sign-up, accepting an invitation, the licence cron, a tenant export) says so with withSystemContext().
import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { logError } from "./logger";
import { assertTestDatabaseUrl } from "../testing/testDatabase";

// Counts and ids from COUNT(*)/SUM over bigint arrive as numbers (they never exceed 2^53 here); NUMERIC stays a string, exactly as DECIMAL did.
pg.types.setTypeParser(20, value => Number(value));

export type Db = NodePgDatabase;
export type DbContext = { userId: number | null; tenantIds: string[]; system: boolean; reason?: string };

const contextStorage = new AsyncLocalStorage<DbContext>();
// Tests that call a service function directly (no request, so no middleware) act as the server's own jobs. The test setup installs a system
// fallback here; code that runs inside a request, or inside runWithDbContext, never sees it. Production never sets it.
let fallbackForTests: DbContext | undefined;
export const useFallbackDbContextForTests = (context: DbContext | undefined) => { fallbackForTests = context; };
export const currentDbContext = () => contextStorage.getStore() ?? fallbackForTests;
/** Runs `work` with the caller's tenants installed for every database statement it makes. */
export const runWithDbContext = <T>(context: DbContext, work: () => Promise<T>): Promise<T> => contextStorage.run(context, work);
/** Runs `work` with all tenants visible. `reason` is a sentence for whoever reads the code later; it is not a credential. */
export const withSystemContext = <T>(reason: string, work: () => Promise<T>): Promise<T> => contextStorage.run({ userId: null, tenantIds: [], system: true, reason }, work);

/**
 * For the few acts that create or join a company, which nobody can see until the act is done: runs `work` with every company visible and then
 * teaches the caller's own context about the company, so the rest of their request (or test) sees it.
 */
export async function withSystemContextJoining<T>(reason: string, work: () => Promise<T>, tenantOf: (result: T) => string): Promise<T> {
  const caller = currentDbContext();
  const result = await withSystemContext(reason, work);
  if (caller && !caller.system) {
    const tenantId = tenantOf(result);
    if (!caller.tenantIds.includes(tenantId)) caller.tenantIds.push(tenantId);
  }
  return result;
}

const settingsSql = (client: pg.PoolClient | pg.Client, context: DbContext) =>
  `SELECT set_config('app.user_id', ${client.escapeLiteral(String(context.userId ?? ""))}, true), set_config('app.tenant_ids', ${client.escapeLiteral(context.tenantIds.join(","))}, true), set_config('app.system', ${client.escapeLiteral(context.system ? "on" : "off")}, true)`;

const textOf = (config: unknown): string => (typeof config === "string" ? config : String((config as { text?: string } | null)?.text ?? ""));

/** A pooled client that installs the context right after a transaction begins (drizzle opens its transactions through this client). */
function contextualClient(client: pg.PoolClient): pg.PoolClient {
  const original = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
  (client as unknown as { query: (...args: unknown[]) => Promise<unknown> }).query = async (...args: unknown[]) => {
    const result = await original(...args);
    const context = currentDbContext();
    if (context && /^\s*begin\b/i.test(textOf(args[0]))) await original(settingsSql(client, context));
    return result;
  };
  return client;
}

class ContextPool extends pg.Pool {
  // drizzle calls pool.query() for a statement outside any transaction, and pool.connect() to open a transaction.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(...args: any[]): any {
    const context = currentDbContext();
    if (!context) return (super.query as (...a: unknown[]) => unknown)(...args);
    return (async () => {
      const client = await super.connect();
      try {
        await client.query(`BEGIN; ${settingsSql(client, context)}`);
        const result = await (client.query as (...a: unknown[]) => Promise<unknown>).apply(client, args);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    })();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connect(...args: any[]): any {
    const connecting = (super.connect as (...a: unknown[]) => unknown)(...args);
    return args.length ? connecting : (connecting as Promise<pg.PoolClient>).then(contextualClient);
  }
}

/**
 * ssl is required off the local machine (Supabase). DATABASE_SSL_CA is the PEM of the certificate authority that signed the server's certificate
 * (Supabase publishes its own: Project Settings > Database > SSL Configuration), so the connection is verified, not merely encrypted.
 * DATABASE_SSL_VERIFY=off keeps encryption but skips verification, and DATABASE_SSL=off turns ssl off for a private network; neither is for production.
 */
export function poolConfigFor(connectionString: string): pg.PoolConfig {
  const url = new URL(connectionString);
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  const ca = (process.env.DATABASE_SSL_CA ?? "").replace(/\\n/g, "\n").trim();
  const ssl = process.env.DATABASE_SSL === "off" || local ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== "off", ...(ca ? { ca } : {}) };
  const parsed = Number(process.env.DATABASE_POOL_MAX ?? "");
  const max = Number.isInteger(parsed) && parsed > 0 ? parsed : 10;
  return { connectionString, ssl, max, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 };
}

let pool: ContextPool | null = null;
let database: Db | null = null;

/** The application's connection, as the restricted application role. Null when DATABASE_URL is not set. */
export async function getDb(): Promise<Db | null> {
  if (!database && process.env.DATABASE_URL) {
    // Under vitest the connection must name the test database; a production URL in the environment fails the test instead of being written to.
    if (process.env.VITEST === "true") assertTestDatabaseUrl(process.env.DATABASE_URL, "DATABASE_URL");
    try {
      pool = new ContextPool(poolConfigFor(process.env.DATABASE_URL));
      pool.on("error", error => logError("database.pool_error", error));
      database = drizzle(pool);
    } catch (error) {
      logError("database.connect_failed", error);
      database = null;
      pool = null;
    }
  }
  return database;
}

export async function closeDb(): Promise<void> {
  const current = pool;
  pool = null;
  database = null;
  if (current) await current.end();
}

/** The PostgreSQL error code (SQLSTATE) of a failure, looking through the query layer's wrapper. */
export function pgErrorCode(error: unknown): string | null {
  for (let depth = 0, current = error as { code?: unknown; cause?: unknown } | null; current && typeof current === "object" && depth < 5; depth++, current = current.cause as typeof current) {
    if (typeof current.code === "string" && /^[0-9A-Z]{5}$/.test(current.code)) return current.code;
  }
  return null;
}
export const isUniqueViolation = (error: unknown) => pgErrorCode(error) === "23505";
export const isForeignKeyViolation = (error: unknown) => pgErrorCode(error) === "23503";
/** Number of rows an UPDATE/DELETE changed (node-postgres reports it as rowCount). */
export const rowsAffected = (result: unknown): number => Number((result as { rowCount?: number | null } | null)?.rowCount ?? 0);
