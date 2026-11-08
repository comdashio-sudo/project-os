import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// D-35: the release workflow reads the Supabase URL and the PUBLIC publishable key from config/supabase.public.json, never from a GitHub variable,
// and that file never holds a secret key. D-57: the "What would ship" decision is scripts/ci/release-scope.sh, run on full history.
const root = path.resolve(import.meta.dirname, "../..");
const configPath = path.join(root, "config/supabase.public.json");
const workflowsDir = path.join(root, ".github/workflows");
const releaseWorkflow = readFileSync(path.join(workflowsDir, "migrate-production.yml"), "utf8");
const scopeScript = path.join(root, "scripts/ci/release-scope.sh");

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

  it("the release workflow reads the URL and key from the file, and refuses a non-publishable key", () => {
    expect(releaseWorkflow).toMatch(/jq -r '\.publishableKey[^']*' "?\$?\{?cfg\}?"?|jq -r '\.publishableKey' config\/supabase\.public\.json/);
    expect(releaseWorkflow).toContain(`SUPABASE_URL="$(jq -r '.url' config/supabase.public.json)"`);
    expect(releaseWorkflow).toContain(`SUPABASE_ANON_KEY="$(jq -r '.publishableKey' config/supabase.public.json)"`);
    expect(releaseWorkflow).toMatch(/sb_publishable_\?\*\) ;;/);
    expect(releaseWorkflow).not.toMatch(/export SUPABASE_URL="https:/);
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

  it("the workflow uses the script on a full-history checkout, with no pipeline into grep -q", () => {
    const scopeStep = releaseWorkflow.slice(releaseWorkflow.indexOf("id: scope"), releaseWorkflow.indexOf("pnpm/action-setup"));
    const checkout = releaseWorkflow.slice(releaseWorkflow.indexOf("actions/checkout"), releaseWorkflow.indexOf("id: scope"));
    expect(checkout).toMatch(/fetch-depth: 0\b/);
    expect(scopeStep).toContain("bash scripts/ci/release-scope.sh");
    expect(scopeStep).not.toMatch(/\|\s*grep -q/);
  });
});
