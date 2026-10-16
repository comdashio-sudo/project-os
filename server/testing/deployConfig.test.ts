import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const text = (file: string) => readFileSync(path.join(root, file), "utf8");

// A deliberately small reader for render.yaml: services, their env var blocks.
type EnvVar = { key: string; value?: string; sync?: boolean; generateValue?: boolean; fromService?: boolean };
function parseBlueprint(source: string) {
  const services: Array<{ name: string; type: string; fields: Record<string, string>; env: EnvVar[] }> = [];
  let service: (typeof services)[number] | null = null;
  let current: EnvVar | null = null;
  for (const raw of source.split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trimEnd();
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const typeMatch = /^ {2}- type: (\w+)/.exec(line);
    if (typeMatch) { service = { name: "", type: typeMatch[1], fields: {}, env: [] }; services.push(service); current = null; continue; }
    if (!service) continue;
    const keyMatch = /^ {6}- key: (\S+)/.exec(line);
    if (keyMatch) { current = { key: keyMatch[1] }; service.env.push(current); continue; }
    const envField = /^ {8}(\w+): (.*)$/.exec(line);
    if (envField && current) {
      const [, field, value] = envField;
      if (field === "value") current.value = value.replace(/^"|"$/g, "");
      if (field === "sync") current.sync = value === "true";
      if (field === "generateValue") current.generateValue = value === "true";
      if (field === "fromService") current.fromService = true;
      continue;
    }
    if (/^ {8,}\w+:/.test(line) && current) { if (/fromService/.test(line)) current.fromService = true; continue; }
    const field = /^ {4}(\w+): ?(.*)$/.exec(line);
    if (field) { service.fields[field[1]] = field[2]; if (field[1] === "name") service.name = field[2]; current = null; }
  }
  return services;
}

const services = parseBlueprint(text("render.yaml"));
const web = services.find(s => s.type === "web")!;
const crons = services.filter(s => s.type === "cron");
const cron = crons.find(s => s.name === "project-os-license-expiry")!;
const emailCron = crons.find(s => s.name === "project-os-email-notifications")!;
const backupCron = crons.find(s => s.name === "project-os-backup")!;

describe("render.yaml", () => {
  it("describes one web service and three cron jobs (daily licence and snapshots, hourly e-mail, daily backup)", () => {
    expect(services.map(s => s.type).sort()).toEqual(["cron", "cron", "cron", "web"]);
  });

  it("never deploys by itself and checks health on /healthz", () => {
    expect(web.fields.autoDeploy).toBe("false");
    expect(web.fields.healthCheckPath).toBe("/healthz");
    expect(web.fields.preDeployCommand).toBe("node scripts/migrate.mjs");
    expect(web.fields.startCommand).toBe("pnpm start");
    expect(web.fields.buildCommand).toContain("--frozen-lockfile");
    expect(web.fields.buildCommand).toContain("--prod=false");
    expect(web.env.find(e => e.key === "NODE_VERSION")?.value).toBe("22");
  });

  it("holds no secret value: every sensitive variable is asked for or generated", () => {
    const sensitive = /SECRET|PASSWORD|TOKEN|KEY|DATABASE_URL|EMAIL/;
    for (const variable of [...web.env, ...cron.env, ...emailCron.env, ...backupCron.env]) {
      if (variable.key === "EMAIL_NOTIFICATIONS_ENABLED") continue; // an on/off switch, not a secret: its value is checked below
      if (!sensitive.test(variable.key)) continue;
      expect(variable.value, variable.key).toBeUndefined();
      expect(variable.sync === false || variable.generateValue === true || variable.fromService === true, variable.key).toBe(true);
    }
  });

  it("keeps e-mail notifications off in the blueprint until the owner switches them on", () => {
    expect(web.env.find(e => e.key === "EMAIL_NOTIFICATIONS_ENABLED")?.value).toBe("false");
  });

  it("runs the e-mail cycle hourly through the same secret, with nothing else", () => {
    expect(emailCron.fields.schedule).toBe('"0 * * * *"');
    expect(emailCron.fields.startCommand).toContain("/api/scheduled/emailNotifications");
    expect(emailCron.fields.startCommand).toContain("Authorization: Bearer $CRON_SECRET");
    expect(emailCron.env.map(e => e.key).sort()).toEqual(["APP_BASE_URL", "CRON_SECRET"]);
  });

  it("backs the database up daily, encrypted, to R2, taking its connection from the web service and its key from the owner", () => {
    expect(backupCron.fields.schedule).toBe('"30 1 * * *"');
    expect(backupCron.fields.startCommand).toBe("node --import tsx scripts/export-database.mjs --to-r2");
    expect(backupCron.fields.buildCommand).toContain("--frozen-lockfile");
    expect(backupCron.fields.buildCommand).toContain("--prod=false"); // tsx is a development dependency
    expect(backupCron.env.map(e => e.key).sort()).toEqual(["BACKUP_DATABASE_URL", "BACKUP_ENCRYPTION_KEY", "BACKUP_R2_BUCKET", "DATABASE_URL", "NODE_VERSION", "R2_ACCESS_KEY_ID", "R2_ACCOUNT_ID", "R2_SECRET_ACCESS_KEY"]);
    // the key is never generated for the owner by the platform: if only Render held it, losing Render would make every backup unreadable
    expect(backupCron.env.find(e => e.key === "BACKUP_ENCRYPTION_KEY")?.generateValue).toBeUndefined();
    expect(backupCron.env.find(e => e.key === "BACKUP_ENCRYPTION_KEY")?.sync).toBe(false);
    for (const key of ["DATABASE_URL", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) expect(backupCron.env.find(e => e.key === key)?.fromService, key).toBe(true);
  });

  it("keeps the language model off in the blueprint", () => {
    expect(web.env.find(e => e.key === "LLM_ENABLED")?.value).toBe("false");
  });

  it("calls the scheduled endpoint with the shared secret", () => {
    expect(cron.fields.startCommand).toContain("/api/scheduled/licenseExpiry");
    expect(cron.fields.startCommand).toContain("/api/scheduled/profitabilitySnapshots");
    expect(cron.fields.startCommand).toContain("Authorization: Bearer $CRON_SECRET");
    expect(cron.env.map(e => e.key).sort()).toEqual(["APP_BASE_URL", "CRON_SECRET"]);
    expect(web.env.find(e => e.key === "CRON_SECRET")?.generateValue).toBe(true);
  });

  it("declares every variable the server reads", () => {
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
    // Read only by tooling, tests or the platform itself, never needed in the web service.
    const notForRender = new Set(["VITEST", "PROJECT_OS_USE_ADMIN_DATABASE_URL", "PROJECT_OS_AUDIT_ADMIN_PASSWORD", "AUDIT_APP_DATABASE_URL", "TEST_DATABASE_URL", "PORT", "APP_ID", "RESEND_API_URL"]); // RESEND_API_URL: points the sender at a fake provider on 127.0.0.1 for local rehearsals; it must NOT exist in production
    const declared = new Set(web.env.map(e => e.key));
    const missing = [...used].filter(name => !notForRender.has(name) && !declared.has(name));
    expect(missing).toEqual([]);
  });

  it("documents every variable the blueprint asks for", () => {
    const guide = text("docs/OWNER_ACTIONS.md");
    for (const variable of [...web.env, ...backupCron.env].filter(e => e.sync === false)) expect(guide, variable.key).toContain(variable.key);
  });
});
