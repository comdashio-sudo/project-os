import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const text = (file: string) => readFileSync(path.join(root, file), "utf8");
const build = text("scripts/build-vercel.mjs");
const guide = text("docs/GO_LIVE.md");
const vercel = JSON.parse(text("vercel.json")) as Record<string, unknown>;

describe("vercel.json and the Vercel build", () => {
  it("builds with one command, installs from the lockfile, and names no framework (the build writes the whole output itself)", () => {
    expect(vercel).toMatchObject({ framework: null, installCommand: "pnpm install --frozen-lockfile", buildCommand: "pnpm build:vercel" });
    expect(JSON.parse(text("package.json")).scripts["build:vercel"]).toBe("node --import tsx scripts/build-vercel.mjs");
  });

  it("holds no secret: vercel.json and the build script carry no key, password, token or connection string", () => {
    for (const file of ["vercel.json", "scripts/build-vercel.mjs"]) expect(text(file), file).not.toMatch(/postgres(ql)?:\/\/[^\s'"`]*@|eyJ[A-Za-z0-9_-]{20,}|sk_[a-z]+_|service_role/);
  });

  it("serves the API as one function and everything else from the CDN, with the single-page fallback last", () => {
    expect(build).toContain('{ src: "/api/(.*)", dest: "/api" }');
    expect(build).toContain('{ src: "/healthz", dest: "/api" }');
    expect(build.indexOf('handle: "filesystem"')).toBeLessThan(build.indexOf('dest: "/index.html"'));
    expect(build).toContain('runtime: "nodejs22.x"');
    expect(build).toContain("supportsResponseStreaming: true");
  });

  it("attaches the same security headers to every response the CDN serves, before any other route", () => {
    expect(build).toContain('{ src: "/(.*)", headers: responseSecurityHeaders(true), continue: true }');
    expect(build.indexOf("responseSecurityHeaders(true)")).toBeLessThan(build.indexOf('dest: "/api"'));
  });

  it("schedules the three jobs the server answers, daily licence expiry and snapshots and hourly e-mail", () => {
    const crons = [...build.matchAll(/\{ path: "(\/api\/scheduled\/\w+)", schedule: "([^"]+)" \}/g)].map(match => [match[1], match[2]]);
    expect(crons).toEqual([["/api/scheduled/licenseExpiry", "0 2 * * *"], ["/api/scheduled/profitabilitySnapshots", "10 2 * * *"], ["/api/scheduled/emailNotifications", "0 * * * *"]]);
    const app = text("server/_core/app.ts");
    for (const [route] of crons) expect(app, route).toContain(route);
    expect(app).toContain("app.get(path, asSystem(reason), handler)"); // Vercel Cron calls with GET
  });

  it("keeps a file below the host's 4.5 MB request ceiling once it is base64 (3,000,000 bytes -> about 4.0 MB)", () => {
    const limit = Number(/VITE_MAX_UPLOAD_BYTES \?\? "(\d+)"/.exec(build)?.[1]);
    expect(limit).toBeGreaterThan(0);
    expect(Math.ceil(limit / 3) * 4 + 4096).toBeLessThan(4.5 * 1024 * 1024);
  });
});

describe("the go-live guide", () => {
  it("names the two separate projects and keeps other platforms' keys out", () => {
    for (const needed of ["Supabase", "Vercel", "`dashio`", "Transaction pooler", "provision:app-role", "verify:db-security", "/healthz", "Email OTP", "Private", "service_role"]) expect(guide, needed).toContain(needed);
    for (const gone of ["TiDB", "Resend", "Cloudflare", "R2", "Render", "render.yaml"]) expect(guide, gone).not.toContain(gone);
  });

  it("lists every environment variable the server reads (tests, tooling and the platform's own are excluded)", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(path.join(root, dir))) {
        const relative = `${dir}/${name}`;
        if (statSync(path.join(root, relative)).isDirectory()) { if (name !== "testing") walk(relative); continue; }
        if (/\.(ts|mjs)$/.test(name) && !/\.test\./.test(name)) files.push(relative);
      }
    };
    walk("server");
    const used = new Set<string>();
    for (const file of files) for (const m of text(file).matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) used.add(m[1]);
    // Set by the platform, by a test, or only by a local rehearsal — never needed in the production project.
    const notForProduction = new Set(["VITEST", "TEST_DATABASE_URL", "PORT", "APP_ID", "NODE_ENV", "TEST_DB_NO_FALLBACK", "PROJECT_OS_USE_ADMIN_DATABASE_URL", "SUPABASE_AUTH_URL", "DATABASE_SSL", "DATABASE_SSL_VERIFY", "STORAGE_TEST_BUCKET"]);
    const missing = [...used].filter(name => !notForProduction.has(name) && !guide.includes(name));
    expect(missing).toEqual([]);
  });

  it("forbids the local-only and unsafe variables rather than recommending them", () => {
    for (const forbidden of ["TEST_DATABASE_URL", "PROJECT_OS_USE_ADMIN_DATABASE_URL", "SUPABASE_AUTH_URL", "DATABASE_SSL=off", "DATABASE_SSL_VERIFY=off"]) {
      for (const line of guide.split("\n").filter(entry => entry.includes(forbidden))) expect(line, forbidden).toMatch(/لا تضع أبدًا/);
    }
  });
});
