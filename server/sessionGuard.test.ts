import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Work order 20, item 14 (audit 6.13): the session guard is checked by a machine, not by memory. Every way into the server that does NOT require a signed-in session is listed
// here, with the reason it may stay open. A new public procedure or a new /api route fails this test until someone adds it HERE, on purpose, with a reason a reviewer can read.
const root = join(__dirname);
const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
  return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) && !path.includes(`${join("server", "testing")}`) ? [path] : [];
});
const files = sources(root).map(path => ({ file: relative(root, path), text: readFileSync(path, "utf8") }));

// name: why it needs no session
const PUBLIC_PROCEDURES: Record<string, string> = {
  me: "returns null for a signed-out visitor — the app asks who is signed in before it knows",
  logout: "ends the session named by the cookie; must work when the user lookup would not",
  health: "liveness probe, returns no data",
};
const OPEN_ROUTES: Record<string, string> = {
  "/healthz": "liveness probe for the platform",
  "/api/readyz": "readiness: whether the database has what this release names; answers with migration names only, no data",
  "/api/auth/config": "which sign-in methods exist (the login page needs it before anyone is signed in)",
  "/api/auth/email/request": "asks for a sign-in code; answers the same for every address (no account enumeration) and is rate limited",
  "/api/auth/email/verify": "exchanges the code for a session; attempt-limited per address",
  "/api/auth/google/start": "starts the optional Google sign-in",
  "/api/auth/google/callback": "completes the optional Google sign-in (state-checked)",
  "/api/storage/file/:token": "D-79: a file from the database storage by a link this server signed (15 minutes, one key) for a caller that passed its checks — as an S3 presigned URL",
  "/api/storage/upload/:token": "D-79: a direct upload into the database storage by a link this server signed (15 minutes, one key of one company), within the 5 MB and company limits",
  "/openapi.json": "the integration API's public description, under /api/v1",
};
const SESSION_ROUTES = ["/api/tenant-export/:tenantId"]; // authenticate with the session cookie themselves (and the second-step gate)
const SECRET_ROUTES = ["/api/scheduled/licenseExpiry", "/api/scheduled/profitabilitySnapshots", "/api/scheduled/emailNotifications", "/api/scheduled/importJobs", "/api/scheduled/daily"]; // Bearer CRON_SECRET
const KEY_ROUTES_PREFIX = "/api/v1"; // company API keys (its own authentication)

describe("the session guard: every door that is open without a session is on the list", () => {
  it("scans the server (the scan is not vacuous)", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some(({ file }) => file === "routers.ts")).toBe(true);
  });

  it("the only procedures reachable without a session are the listed ones", () => {
    const found = new Set<string>();
    for (const { text } of files) for (const match of Array.from(text.matchAll(/(\w+):\s*publicProcedure\b/g))) found.add(match[1]);
    expect(Array.from(found).sort()).toEqual(Object.keys(PUBLIC_PROCEDURES).sort());
  });

  it("no procedure is built on the bare tRPC base, which would skip the session check", () => {
    const bare: string[] = [];
    for (const { file, text } of files) {
      if (file === join("_core", "trpc.ts")) continue;
      for (const match of Array.from(text.matchAll(/\bt\.procedure\b/g))) bare.push(`${file}: ${match[0]}`);
    }
    expect(bare).toEqual([]);
  });

  it("every Express route under the public paths is listed, with the reason it is open or how it authenticates", () => {
    const known = new Set([...Object.keys(OPEN_ROUTES), ...SESSION_ROUTES, ...SECRET_ROUTES]);
    const unlisted: string[] = [];
    for (const { file, text } of files) {
      if (file.startsWith(join("_core", "vite"))) continue; // the single-page app's own files
      for (const match of Array.from(text.matchAll(/\b(?:app|router)\.(?:get|post|put|patch|delete)\(\s*"([^"]+)"/g))) {
        const path = match[1];
        if (known.has(path) || path.startsWith(KEY_ROUTES_PREFIX)) continue;
        // the integration router mounts under /api/v1 and registers relative paths; those authenticate by key inside the router
        if (file.startsWith("integrations") && !path.startsWith("/api/")) continue;
        unlisted.push(`${file}: ${path}`);
      }
    }
    expect(unlisted).toEqual([]);
  });

  it("every route on the list still exists (a stale entry would hide a removed door's replacement)", () => {
    const text = files.map(entry => entry.text).join("\n");
    for (const path of [...Object.keys(OPEN_ROUTES), ...SESSION_ROUTES]) expect(text.includes(`"${path}"`), path).toBe(true);
    for (const path of SECRET_ROUTES) expect(text.includes(`"${path}"`), path).toBe(true);
  });

  it("each listed-open route says why (an entry without a reason is not accepted)", () => {
    for (const reason of [...Object.values(PUBLIC_PROCEDURES), ...Object.values(OPEN_ROUTES)]) expect(reason.length).toBeGreaterThan(15);
  });
});
