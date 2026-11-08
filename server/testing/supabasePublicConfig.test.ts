import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// D-35: the release workflow reads the Supabase URL and the PUBLIC publishable key from config/supabase.public.json, never from a GitHub variable,
// and that file never holds a secret key. D-57: the "What would ship" decision is scripts/ci/release-scope.sh, run on full history.
const root = path.resolve(import.meta.dirname, "../..");
const configPath = path.join(root, "config/supabase.public.json");
const workflowsDir = path.join(root, ".github/workflows");
const releaseWorkflow = readFileSync(path.join(workflowsDir, "migrate-production.yml"), "utf8");
const scopeScript = path.join(root, "scripts/ci/release-scope.sh");
const configCheckScript = path.join(root, "scripts/ci/public-config-check.sh");

type PublicConfig = { url?: unknown; publishableKey?: unknown };

function base64UrlJson(segment: string): Record<string, unknown> | null {
  try { return JSON.parse(Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, unknown>; } catch { return null; }
}

/** Every reason a config may NOT be committed. Empty = acceptable. An empty key is acceptable here (the workflow then refuses to release, loudly). */
function publicConfigProblems(config: PublicConfig): string[] {
  const problems: string[] = [];
  if (typeof config.url !== "string" || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url)) problems.push("url");
  const key = config.publishableKey;
  if (typeof key !== "string") return [...problems, "publishableKey type"];
  // every value except the human note (which names what is forbidden)
  const text = JSON.stringify({ ...config, _note: undefined });
  if (/sb_secret_/.test(text)) problems.push("sb_secret_ key");
  if (/service_role/.test(text)) problems.push("service_role");
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    const payload = base64UrlJson(match[1]);
    problems.push(payload?.role === "anon" ? "JWT (use the sb_publishable_ key: scan-secrets refuses every JWT)" : "JWT with a non-anon role");
  }
  if (key !== "" && !/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key)) problems.push("publishableKey is not sb_publishable_");
  return problems;
}

describe("config/supabase.public.json (D-35)", () => {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as PublicConfig;

  it("is valid JSON with the project URL and only a public key (or none yet)", () => {
    expect(publicConfigProblems(config)).toEqual([]);
    expect(config.url).toBe("https://dzfxgxccnlyhcjgqstgn.supabase.co");
  });

  it("refuses secret keys and JWTs (fabricated samples)", () => {
    const fakeJwt = (role: string) => ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify({ role, iss: "supabase" })).toString("base64url"), "c2lnbmF0dXJlLW5vdC1yZWFs"].join(".");
    const url = "https://abcdefghij.supabase.co";
    expect(publicConfigProblems({ url, publishableKey: "sb_secret_" + "x".repeat(30) })).toContain("sb_secret_ key"); // secret-scan:allow
    expect(publicConfigProblems({ url, publishableKey: fakeJwt("service_role") })).toContain("JWT with a non-anon role");
    expect(publicConfigProblems({ url, publishableKey: fakeJwt("anon") }).join()).toMatch(/JWT/);
    expect(publicConfigProblems({ url, publishableKey: "not-a-key-at-all-1234567890" })).toContain("publishableKey is not sb_publishable_");
    expect(publicConfigProblems({ url: "http://example.test", publishableKey: "" })).toContain("url");
    expect(publicConfigProblems({ url, publishableKey: "sb_publishable_" + "A".repeat(24) })).toEqual([]);
  });

  it("no workflow reads SUPABASE_ANON_KEY from a GitHub variable", () => {
    for (const file of readdirSync(workflowsDir).filter(name => /\.ya?ml$/.test(name))) {
      expect(readFileSync(path.join(workflowsDir, file), "utf8"), file).not.toMatch(/vars\.SUPABASE_ANON_KEY/);
    }
  });

  it("the release workflow reads the URL and key from the file, checks it with the script, and runs without sign-in only when there is no key (D-69)", () => {
    expect(releaseWorkflow).toContain("bash scripts/ci/public-config-check.sh config/supabase.public.json >> \"$GITHUB_OUTPUT\"");
    expect(releaseWorkflow).toContain(`SUPABASE_URL="$(jq -r '.url' config/supabase.public.json)"`);
    expect(releaseWorkflow).toContain(`SUPABASE_ANON_KEY="$(jq -r '.publishableKey' config/supabase.public.json)"`);
    expect(releaseWorkflow).not.toMatch(/export SUPABASE_URL="https:/);
    const step3 = releaseWorkflow.slice(releaseWorkflow.indexOf("- name: 3."), releaseWorkflow.indexOf("- name: 4."));
    // the key is exported only inside the has_key=true branch; the empty case passes --without-sign-in and never exports an empty key
    expect(step3).toMatch(/if \[ "\$\{\{ steps\.config\.outputs\.has_key \}\}" = "true" \]; then\s+SUPABASE_ANON_KEY=[^\n]+\n\s+export SUPABASE_ANON_KEY\n\s+else\s+gate_args=\(--without-sign-in\)/);
    expect(step3).toContain(`post-deploy-check.mjs "http://127.0.0.1:3920" "\${gate_args[@]}"`);
    expect(releaseWorkflow).toContain("SUPABASE_DB_PASSWORD is not set");
  });
});

describe("scripts/ci/public-config-check.sh (D-69)", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "public-config-"));
  const check = (config: unknown) => {
    const file = path.join(dir, `c${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(file, typeof config === "string" ? config : JSON.stringify(config));
    const result = spawnSync("bash", [configCheckScript, file], { encoding: "utf8" });
    return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr };
  };
  const url = "https://abcdefghij.supabase.co";

  it("accepts an empty key (has_key=false) and an sb_publishable_ key (has_key=true)", () => {
    expect(check({ url, publishableKey: "" })).toMatchObject({ status: 0, stdout: "has_key=false" });
    expect(check({ url })).toMatchObject({ status: 0, stdout: "has_key=false" });
    expect(check({ url, publishableKey: "sb_publishable_" + "A".repeat(24) })).toMatchObject({ status: 0, stdout: "has_key=true" });
  });

  it("the committed config passes", () => {
    expect(spawnSync("bash", [configCheckScript, configPath], { encoding: "utf8" }).status).toBe(0);
  });

  it("refuses a secret key, a JWT, any other key and a URL that is not supabase.co, without printing the key", () => {
    const secret = "sb_secret_" + "z".repeat(30); // secret-scan:allow (fabricated)
    const refused = check({ url, publishableKey: secret });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/SECRET/);
    expect(refused.stdout + refused.stderr).not.toContain("z".repeat(30));
    expect(check({ url, publishableKey: "eyJhbGciOiJIUzI1NiJ9.e30.c2ln" }).status).toBe(1); // secret-scan:allow (fabricated)
    expect(check({ url, publishableKey: "not-a-key-at-all-1234567890" }).status).toBe(1);
    expect(check({ url, publishableKey: "sb_publishable_short" }).status).toBe(1);
    expect(check({ url: "http://example.test", publishableKey: "" }).status).toBe(1);
    expect(check({ url: "https://abc.supabase.co.example.test", publishableKey: "" }).status).toBe(1);
    expect(check({ publishableKey: "" }).status).toBe(1);
    expect(check("{not json").status).toBe(1);
  });
});

describe("release scope (D-57)", () => {
  const scope = (paths: string[], ignorePipe = false) => {
    const command = ignorePipe ? `trap '' PIPE; bash ${JSON.stringify(scopeScript)}` : `bash ${JSON.stringify(scopeScript)}`;
    const result = spawnSync("bash", ["-c", command], { input: paths.join("\n"), encoding: "utf8" });
    expect(result.status).toBe(0);
    return result.stdout.trim();
  };

  it("a large code diff ships, even when SIGPIPE is ignored as on the Actions runner (the failure of run 42491210830)", () => {
    const many = Array.from({ length: 30_000 }, (_, i) => `client/src/file${i}.ts`);
    expect(scope(many)).toBe("deploy=true");
    expect(scope(many, true)).toBe("deploy=true");
    expect(scope(["docs/a.md", ...many.slice(0, 5000), "drizzle/0016_x.sql"], true)).toBe("deploy=true");
  });

  it("only documentation and workflows ship nothing; one code file ships", () => {
    expect(scope(["docs/GO_LIVE.md", ".github/workflows/ci.yml", "qa/x.txt", "README.md"])).toBe("deploy=false");
    expect(scope(["docs/GO_LIVE.md", "server/app.ts"])).toBe("deploy=true");
    expect(scope(["(no production branch yet)"])).toBe("deploy=true");
  });

  it("a grep failure (exit 2) fails closed instead of reading as deploy=false (D-69)", () => {
    const fakeBin = mkdtempSync(path.join(os.tmpdir(), "fake-grep-"));
    const fakeGrep = path.join(fakeBin, "grep");
    writeFileSync(fakeGrep, "#!/usr/bin/env bash\necho 'grep: simulated failure' >&2\nexit 2\n");
    chmodSync(fakeGrep, 0o755);
    for (const paths of [["docs/GO_LIVE.md"], ["server/app.ts"]]) {
      const result = spawnSync("bash", [scopeScript], { input: paths.join("\n"), encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` } });
      expect(result.status).toBe(1);
      expect(result.stdout).not.toMatch(/deploy=/);
      expect(result.stderr).toMatch(/grep failed \(exit 2\)/);
    }
    // and the workflow step runs it under `set -euo pipefail` inside $(…), so that exit stops the run
    const scopeStep = releaseWorkflow.slice(releaseWorkflow.indexOf("id: scope"), releaseWorkflow.indexOf("pnpm/action-setup"));
    expect(scopeStep).toMatch(/set -euo pipefail/);
    expect(readFileSync(scopeScript, "utf8")).not.toMatch(/\|\| true/);
  });

  it("the workflow uses the script on a full-history checkout, with no pipeline into grep -q", () => {
    const scopeStep = releaseWorkflow.slice(releaseWorkflow.indexOf("id: scope"), releaseWorkflow.indexOf("pnpm/action-setup"));
    const checkout = releaseWorkflow.slice(releaseWorkflow.indexOf("actions/checkout"), releaseWorkflow.indexOf("id: scope"));
    expect(checkout).toMatch(/fetch-depth: 0\b/);
    expect(scopeStep).toContain("bash scripts/ci/release-scope.sh");
    expect(scopeStep).not.toMatch(/\|\s*grep -q/);
  });
});
