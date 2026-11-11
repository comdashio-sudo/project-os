import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// D-85 (run 42738392972): scripts/ci/vercel-access.sh decides whether step 4b deploys production with the CLI. It is run here against a fake `vercel` on PATH:
// no token, or a 401/403 for the team, is a warning and cli=false (the release goes on and Vercel deploys the production branch); any other failure stops the run.
const root = path.resolve(import.meta.dirname, "../..");
const script = path.join(root, "scripts/ci/vercel-access.sh");
const work = mkdtempSync(path.join(tmpdir(), "vercel-access-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));
writeFileSync(path.join(work, "vercel"), `#!/usr/bin/env bash
case "$1" in
  whoami) [ "$FAKE_WHOAMI" = ok ] && { echo "someone"; exit 0; }; echo "$FAKE_WHOAMI" >&2; exit 1 ;;
  pull) [ -d "\${@: -1}" ] && touch "\${@: -1}/pulled"; [ "$FAKE_PULL" = ok ] && exit 0; echo "$FAKE_PULL" >&2; exit 1 ;;
esac
exit 2
`);
chmodSync(path.join(work, "vercel"), 0o755);
const TOKEN = "fake-token-value-never-printed";

function run(env: { token?: string; whoami?: string; pull?: string }) {
  const out = path.join(work, `out-${Math.random().toString(36).slice(2)}`);
  writeFileSync(out, "");
  let status = 0; let stdout = "";
  try {
    stdout = execFileSync("bash", [script, out], { encoding: "utf8", env: { PATH: `${work}:${process.env.PATH}`, RUNNER_TEMP: work, VERCEL_ORG_ID: "team_example", VERCEL_PROJECT_ID: "prj_example", ...(env.token === undefined ? {} : { VERCEL_TOKEN: env.token }), FAKE_WHOAMI: env.whoami ?? "ok", FAKE_PULL: env.pull ?? "ok" } });
  } catch (error) { status = (error as { status: number }).status; stdout = String((error as { stdout?: string }).stdout ?? ""); }
  return { status, stdout, output: readFileSync(out, "utf8").trim() };
}

describe("vercel-access.sh (D-85)", () => {
  it("a token that may read the project: cli=true, and the probe folder is gone", () => {
    const result = run({ token: TOKEN });
    expect(result).toMatchObject({ status: 0, output: "cli=true" });
    expect(existsSync(path.join(work, "vercel-project-probe"))).toBe(false);
  });

  it("run 42738392972: a 403 for the team is a WARNING and cli=false — the release goes on (migrations, check, production branch), and the folder is gone", () => {
    const result = run({ token: TOKEN, pull: "Error: Could not retrieve Project Settings. To link your Project, remove the `.vercel` directory and deploy again. (403)" });
    expect(result.status).toBe(0); expect(result.output).toBe("cli=false");
    expect(result.stdout).toMatch(/^::warning title=Production deployed by Vercel from the production branch::/m);
    expect(result.stdout).not.toMatch(/::error/);
    expect(existsSync(path.join(work, "vercel-project-probe"))).toBe(false);
  });

  it("no token at all, or a token refused by whoami (401), is the same warning and cli=false", () => {
    for (const env of [{}, { token: "" }, { token: TOKEN, whoami: "Error: The specified token is not valid (401)" }]) {
      const result = run(env);
      expect(result.status, JSON.stringify(env)).toBe(0); expect(result.output).toBe("cli=false"); expect(result.stdout).toMatch(/::warning/);
    }
  });

  it("NEGATIVE: any OTHER failure (a network error, a Vercel outage) still stops the run before anything is migrated, and writes no decision", () => {
    for (const env of [{ token: TOKEN, pull: "Error: getaddrinfo ENOTFOUND api.vercel.com" }, { token: TOKEN, whoami: "Error: 500 Internal Server Error" }]) {
      const result = run(env);
      expect(result.status, JSON.stringify(env)).toBe(1); expect(result.output).toBe(""); expect(result.stdout).toMatch(/::error title=Vercel unavailable::/);
    }
  });

  it("never prints the token", () => {
    for (const env of [{ token: TOKEN }, { token: TOKEN, pull: "403 Forbidden" }, { token: TOKEN, pull: "ECONNRESET" }]) expect(run(env).stdout).not.toContain(TOKEN);
  });
});
