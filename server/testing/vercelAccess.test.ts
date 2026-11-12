import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// D-85 / D-85b: scripts/ci/vercel-access.sh decides whether step 4b deploys production with the CLI, from the HTTP STATUS of GET /v9/projects/{id} (not the CLI's text).
// It runs here against a fake `curl` and a fake `vercel` on PATH: no token, 401 or 403 is a warning and cli=false; any other status stops the run.
// scripts/ci/wait-for-commit.sh (step 6b) is run against the same fake curl answering /api/readyz.
const root = path.resolve(import.meta.dirname, "../..");
const script = path.join(root, "scripts/ci/vercel-access.sh");
const waitScript = path.join(root, "scripts/ci/wait-for-commit.sh");
const work = mkdtempSync(path.join(tmpdir(), "vercel-access-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));
// fake curl: records its argv and the config file it was handed; for the projects API it prints FAKE_STATUS (as -w '%{http_code}' would, the body going to -o) and
// FAKE_ERROR on stderr; FAKE_EXIT (28 = timeout) makes it fail. For /api/readyz it prints the next line of FAKE_READYZ_FILE (the last line repeats).
writeFileSync(path.join(work, "curl"), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
prev=""; for arg in "$@"; do [ "$prev" = "-K" ] && cat "$arg" >> "$FAKE_LOG.cfg"; prev="$arg"; done
case "$*" in
  */api/readyz*) n=$(cat "$FAKE_READYZ_FILE.n" 2>/dev/null || echo 1); line="$(sed -n "\${n}p" "$FAKE_READYZ_FILE")"; [ -z "$line" ] && line="$(tail -n 1 "$FAKE_READYZ_FILE")"; echo $((n + 1)) > "$FAKE_READYZ_FILE.n"
    [ "$line" = "DOWN" ] && { echo "curl: (7) Failed to connect" >&2; exit 7; }; printf '%s' "$line"; exit 0 ;;
esac
[ -n "\${FAKE_ERROR:-}" ] && echo "$FAKE_ERROR" >&2
printf '%s' "\${FAKE_STATUS:-000}"
exit "\${FAKE_EXIT:-0}"
`);
writeFileSync(path.join(work, "vercel"), `#!/usr/bin/env bash
printf 'vercel %s\\n' "$*" >> "$FAKE_LOG"
case "$1" in
  pull) [ -d "\${@: -1}" ] && touch "\${@: -1}/pulled"; [ "$FAKE_PULL" = ok ] && exit 0; echo "$FAKE_PULL" >&2; exit 1 ;;
esac
exit 2
`);
chmodSync(path.join(work, "curl"), 0o755); chmodSync(path.join(work, "vercel"), 0o755);
const TOKEN = "fake-token-value-never-printed";
const id = () => Math.random().toString(36).slice(2);

function run(env: { token?: string; status?: string; exit?: number; error?: string; pull?: string }) {
  const out = path.join(work, `out-${id()}`), log = path.join(work, `log-${id()}`);
  writeFileSync(out, ""); writeFileSync(log, "");
  let status = 0; let stdout = "";
  try {
    stdout = execFileSync("bash", [script, out], { encoding: "utf8", env: { PATH: `${work}:${process.env.PATH}`, RUNNER_TEMP: work, FAKE_LOG: log, VERCEL_ORG_ID: "team_example", VERCEL_PROJECT_ID: "prj_example", ...(env.token === undefined ? {} : { VERCEL_TOKEN: env.token }), FAKE_STATUS: env.status ?? "200", FAKE_EXIT: String(env.exit ?? 0), FAKE_ERROR: env.error ?? "", FAKE_PULL: env.pull ?? "ok" } });
  } catch (error) { status = (error as { status: number }).status; stdout = String((error as { stdout?: string }).stdout ?? ""); }
  return { status, stdout, output: readFileSync(out, "utf8").trim(), argv: readFileSync(log, "utf8"), config: existsSync(`${log}.cfg`) ? readFileSync(`${log}.cfg`, "utf8") : "" };
}

describe("vercel-access.sh (D-85, D-85b)", () => {
  it("HTTP 200 for the project and a working pull: cli=true; the token reached curl only through its config file, and the probe folder is gone", () => {
    const result = run({ token: TOKEN });
    expect(result).toMatchObject({ status: 0, output: "cli=true" });
    expect(result.argv).toMatch(/-w %\{http_code\}/);
    expect(result.argv).toMatch(/\/v9\/projects\/prj_example\?teamId=team_example/);
    expect(result.argv).not.toContain(TOKEN);
    expect(result.config).toContain(`Authorization: Bearer ${TOKEN}`);
    const configs = [...result.argv.matchAll(/-K (\S+)/g)].map(match => match[1]);
    expect(configs.length).toBe(1); expect(configs.filter(file => existsSync(file))).toEqual([]); // curl's config file did not outlive the call
    expect(existsSync(path.join(work, "vercel-project-probe"))).toBe(false);
  });

  it("run 42738392972: HTTP 403 (or 401) for the project is a WARNING and cli=false — the release goes on — and vercel pull is not even tried", () => {
    for (const status of ["403", "401"]) {
      const result = run({ token: TOKEN, status });
      expect(result.status, status).toBe(0); expect(result.output).toBe("cli=false");
      expect(result.stdout).toMatch(/^::warning title=Production deployed by Vercel from the production branch::/m);
      expect(result.stdout).not.toMatch(/::error/);
      expect(result.argv).not.toMatch(/^vercel pull/m);
    }
  });

  it("no token at all (unset or empty) is the same warning and cli=false, without calling Vercel", () => {
    for (const env of [{}, { token: "" }]) {
      const result = run(env);
      expect(result.status, JSON.stringify(env)).toBe(0); expect(result.output).toBe("cli=false"); expect(result.stdout).toMatch(/::warning/); expect(result.argv).toBe("");
    }
  });

  // D-85b (review of #249): each of these was read as "no access" by the text pattern of D-85. The status decides now: each one stops the run and writes no decision.
  it.each([
    ["a 503 whose body says 403", { status: "503", error: "" }, /HTTP 503/],
    ["a 500 whose body says 401", { status: "500", error: "Error 401 in upstream" }, /HTTP 500/],
    ["a timeout whose message holds .403", { status: "000", exit: 28, error: "curl: (28) Connection timed out after 20001 ms to 76.76.21.403" }, /did not answer/],
    ["a 429 saying You do not have access", { status: "429", error: "You do not have access (rate limited)" }, /HTTP 429/],
    ["a 404 for a wrong project or team", { status: "404" }, /HTTP 404/],
  ])("NEGATIVE (D-85b): %s stops the run before anything is migrated", (_label, env, message) => {
    const result = run({ token: TOKEN, ...env });
    expect(result.status).toBe(1); expect(result.output).toBe("");
    expect(result.stdout).toMatch(/::error title=Vercel unavailable::/); expect(result.stdout).toMatch(message);
    expect(result.stdout).not.toMatch(/::warning/);
  });

  it("NEGATIVE: HTTP 200 but vercel pull fails (run 42606597331) stops the run; the folder is gone and the token is scrubbed from the printed error", () => {
    const result = run({ token: TOKEN, pull: `Error: something failed for token ${TOKEN} (403)` });
    expect(result.status).toBe(1); expect(result.output).toBe(""); expect(result.stdout).toMatch(/::error title=Vercel unavailable::vercel pull/);
    expect(result.stdout).toContain("token *** (403)");
    expect(existsSync(path.join(work, "vercel-project-probe"))).toBe(false);
  });

  it("never prints the token, on any path", () => {
    for (const env of [{ token: TOKEN }, { token: TOKEN, status: "403" }, { token: TOKEN, status: "503", error: TOKEN }, { token: TOKEN, pull: TOKEN }]) expect(run(env).stdout).not.toContain(TOKEN);
  });
});

function wait(answers: string[], limit = 2) {
  const file = path.join(work, `readyz-${id()}`), log = path.join(work, `log-${id()}`);
  writeFileSync(file, `${answers.join("\n")}\n`); writeFileSync(log, "");
  let status = 0; let stdout = "";
  try {
    stdout = execFileSync("bash", [waitScript, "https://prod.example.test", "0123456789abcdef0123", String(limit), "0"], { encoding: "utf8", env: { PATH: `${work}:${process.env.PATH}`, FAKE_LOG: log, FAKE_READYZ_FILE: file } });
  } catch (error) { status = (error as { status: number }).status; stdout = String((error as { stdout?: string }).stdout ?? ""); }
  return { status, stdout };
}

describe("wait-for-commit.sh (D-85b, step 6b)", () => {
  it("waits through the old build and a moment of downtime, and succeeds when /api/readyz names the pushed commit and is ready", () => {
    const result = wait(['{"ready":true,"commit":"aaaaaaaaaaaa"}', "DOWN", '{"ready":true,"commit":"0123456789ab"}']);
    expect(result.status).toBe(0); expect(result.stdout).toMatch(/serves 0123456789ab and is ready/);
    expect(result.stdout).toMatch(/waiting: serves aaaaaaaaaaaa, not 0123456789ab/);
  });

  it("NEGATIVE: production still on the old commit after the limit fails the run and says rollback is manual", () => {
    const result = wait(['{"ready":true,"commit":"aaaaaaaaaaaa"}'], 1);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/::error title=Production does not serve the release::https:\/\/prod\.example\.test serves aaaaaaaaaaaa, not 0123456789ab/);
    expect(result.stdout).toMatch(/nothing was rolled back[\s\S]*Instant Rollback/);
  });

  it("NEGATIVE: no commit in readyz (VERCEL_GIT_COMMIT_SHA not exposed), the right commit but not ready, or no answer at all: each fails after the limit", () => {
    expect(wait(['{"ready":true,"commit":null}'], 1)).toMatchObject({ status: 1, stdout: expect.stringMatching(/serves an unknown commit/) });
    expect(wait(['{"ready":false,"commit":"0123456789ab","pendingMigrations":["0026_x"]}'], 1)).toMatchObject({ status: 1, stdout: expect.stringMatching(/not ready/) });
    expect(wait(["DOWN"], 1)).toMatchObject({ status: 1, stdout: expect.stringMatching(/no answer from/) });
  });
});
