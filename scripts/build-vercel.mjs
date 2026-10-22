// Builds the Vercel deployment as a Build Output API v3 tree (.vercel/output): the client as static files on the CDN, the whole Express server as ONE
// self-contained function (every dependency bundled, so nothing depends on how the host resolves modules), the routing, and the cron schedule.
//
//   pnpm build:vercel      (runs under tsx: it reads the security headers from server/_core/securityHeaders.ts)
//
// The cron schedule lives here, in one place. Vercel Cron calls each path with GET and `Authorization: Bearer $CRON_SECRET`; the handlers refuse any
// other caller. The hourly e-mail job needs a Vercel plan that allows more than one cron run a day; on Hobby, change "0 * * * *" to a daily time.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { responseSecurityHeaders } from "../server/_core/securityHeaders.ts";

const root = new URL("..", import.meta.url).pathname;
const output = join(root, ".vercel", "output");
const MAX_DURATION_SECONDS = Number(process.env.VERCEL_FUNCTION_MAX_DURATION ?? 300);
// Vercel refuses a request body over 4.5 MB before it reaches the function. A file is sent as base64 inside the body (x4/3), so the largest file the
// screens accept is held below that: 3,000,000 bytes becomes about 4.0 MB on the wire.
const UPLOAD_LIMIT_BYTES = process.env.VITE_MAX_UPLOAD_BYTES ?? "3000000";

rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, "functions", "api.func"), { recursive: true });

const client = spawnSync("pnpm", ["exec", "vite", "build"], { cwd: root, stdio: "inherit", env: { ...process.env, VITE_MAX_UPLOAD_BYTES: UPLOAD_LIMIT_BYTES } });
if (client.status !== 0) process.exit(client.status ?? 1);
cpSync(join(root, "dist", "public"), join(output, "static"), { recursive: true });

await build({
  entryPoints: [join(root, "server", "vercel.ts")],
  outfile: join(output, "functions", "api.func", "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // pg's optional native binding is never used; everything else is bundled. `require` for the CommonJS packages inside the bundle:
  external: ["pg-native"],
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  legalComments: "none",
  logLevel: "warning",
});

writeFileSync(join(output, "functions", "api.func", ".vc-config.json"), JSON.stringify({
  runtime: "nodejs22.x",
  handler: "index.mjs",
  launcherType: "Nodejs",
  shouldAddHelpers: false,
  maxDuration: MAX_DURATION_SECONDS,
  supportsResponseStreaming: true,
}, null, 2));
writeFileSync(join(output, "functions", "api.func", "package.json"), JSON.stringify({ type: "module" }));

writeFileSync(join(output, "config.json"), JSON.stringify({
  version: 3,
  routes: [
    // The page and its files come from the CDN, not from Express, so the security headers (CSP, HSTS, ...) are attached here to every response.
    { src: "/(.*)", headers: responseSecurityHeaders(true), continue: true },
    { src: "/api/(.*)", dest: "/api" },
    { src: "/healthz", dest: "/api" },
    { handle: "filesystem" },
    { src: "/(.*)", dest: "/index.html" },
  ],
  crons: [
    { path: "/api/scheduled/licenseExpiry", schedule: "0 2 * * *" },
    { path: "/api/scheduled/profitabilitySnapshots", schedule: "10 2 * * *" },
    { path: "/api/scheduled/emailNotifications", schedule: "0 * * * *" },
  ],
}, null, 2));

console.log(JSON.stringify({ output: ".vercel/output", function: "api", maxDurationSeconds: MAX_DURATION_SECONDS, uploadLimitBytes: Number(UPLOAD_LIMIT_BYTES), crons: 3 }));
