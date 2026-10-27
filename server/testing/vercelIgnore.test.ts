import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Work order 18, section 0 item 7. vercel.json's ignoreCommand must skip a deployment ONLY when every changed file is documentation (docs/, qa/, .github/, any .md), and must
// build at any doubt. Each case below is a real git repository with real commits, and the real script is run in it. Exit 0 = skip, exit 1 = build (Vercel's documented meaning).
const root = path.resolve(import.meta.dirname, "../..");
const script = path.join(root, "scripts/ci/vercel-ignore.sh");
const repos: string[] = [];
afterAll(() => { for (const repo of repos) rmSync(repo, { recursive: true, force: true }); });

const git = (cwd: string, ...args: string[]) => { const result = spawnSync("git", ["-c", "user.email=t@example.test", "-c", "user.name=t", ...args], { cwd, encoding: "utf8" }); if (result.status !== 0) throw new Error(result.stderr); return result.stdout.trim(); };
function repo(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "vercel-ignore-"));
  repos.push(dir);
  git(dir, "init", "-q");
  const write = (all: Record<string, string>) => { for (const [file, content] of Object.entries(all)) { mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); writeFileSync(path.join(dir, file), content); } };
  write({ "src/app.ts": "1", "README.md": "a", ...files });
  git(dir, "add", "-A"); git(dir, "commit", "-qm", "base");
  const base = git(dir, "rev-parse", "HEAD");
  return { dir, base, change(all: Record<string, string>) { write(all); git(dir, "add", "-A"); git(dir, "commit", "-qm", "change"); return git(dir, "rev-parse", "HEAD"); } };
}
const run = (cwd: string, env: Record<string, string>) => { const result = spawnSync("bash", [script], { cwd, encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env } }); return { code: result.status, out: result.stdout }; };

describe("vercel-ignore: production is never built from main", () => {
  it("SKIPS a production build of main even when code changed (the migrations run first, then the production branch moves)", () => {
    const r = repo({}); const head = r.change({ "src/app.ts": "2" });
    expect(run(r.dir, { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_PREVIOUS_SHA: r.base, VERCEL_GIT_COMMIT_SHA: head })).toMatchObject({ code: 0 });
  });
  it("still BUILDS a production build of the production branch, and a Preview of main", () => {
    const r = repo({}); const head = r.change({ "src/app.ts": "2" });
    expect(run(r.dir, { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "production", VERCEL_GIT_PREVIOUS_SHA: r.base, VERCEL_GIT_COMMIT_SHA: head })).toMatchObject({ code: 1 });
    expect(run(r.dir, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_PREVIOUS_SHA: r.base, VERCEL_GIT_COMMIT_SHA: head })).toMatchObject({ code: 1 });
  });
});

describe("vercel-ignore: skip only documentation, build at any doubt", () => {
  it("is wired in vercel.json", () => {
    expect(JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")).ignoreCommand).toBe("bash scripts/ci/vercel-ignore.sh");
  });
  it.each([
    ["a file under docs/", { "docs/STATE.md": "x", "docs/new/guide.txt": "x" }],
    ["a workflow", { ".github/workflows/ci.yml": "x" }],
    ["qa/", { "qa/notes.txt": "x" }],
    ["a Markdown file anywhere", { "README.md": "b", "server/NOTES.md": "x" }],
    ["all of those together", { "docs/a.md": "x", ".github/b.yml": "x", "qa/c": "x", "d.md": "x" }],
  ])("SKIPS (exit 0) when only %s changed", (_name, change) => {
    const r = repo({}); const head = r.change(change);
    expect(run(r.dir, { VERCEL_GIT_PREVIOUS_SHA: r.base, VERCEL_GIT_COMMIT_SHA: head })).toMatchObject({ code: 0 });
  });
  it.each([
    ["source code", { "src/app.ts": "2" }],
    ["a script", { "scripts/x.mjs": "x" }],
    ["a migration", { "drizzle/0010_x.sql": "x" }],
    ["vercel.json", { "vercel.json": "{}" }],
    ["the lockfile", { "pnpm-lock.yaml": "x" }],
    ["a documentation file AND code", { "docs/a.md": "x", "src/app.ts": "3" }],
    ["a file that only LOOKS like documentation (docs.ts, a .md-named folder file inside code is fine, but not a docs-named source)", { "src/docs.ts": "x" }],
  ])("BUILDS (exit 1) when %s changed", (_name, change) => {
    const r = repo({}); const head = r.change(change);
    expect(run(r.dir, { VERCEL_GIT_PREVIOUS_SHA: r.base, VERCEL_GIT_COMMIT_SHA: head })).toMatchObject({ code: 1 });
  });
  it("BUILDS when there is no previous deployment, when its commit is not in this clone, when the diff is empty, and when the current commit is unreadable", () => {
    const r = repo({}); const head = r.change({ "docs/a.md": "x" });
    expect(run(r.dir, { VERCEL_GIT_PREVIOUS_SHA: "", VERCEL_GIT_COMMIT_SHA: head }).code).toBe(1);
    expect(run(r.dir, { VERCEL_GIT_COMMIT_SHA: head }).code).toBe(1);
    expect(run(r.dir, { VERCEL_GIT_PREVIOUS_SHA: "0123456789abcdef0123456789abcdef01234567", VERCEL_GIT_COMMIT_SHA: head }).code).toBe(1);
    expect(run(r.dir, { VERCEL_GIT_PREVIOUS_SHA: head, VERCEL_GIT_COMMIT_SHA: head }).code).toBe(1);
    expect(run(r.dir, { VERCEL_GIT_PREVIOUS_SHA: r.base, VERCEL_GIT_COMMIT_SHA: "fedcba9876543210fedcba9876543210fedcba98" }).code).toBe(1);
  });
  it("outside a git repository it builds (the diff cannot be computed)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vercel-ignore-nogit-")); repos.push(dir);
    expect(run(dir, { VERCEL_GIT_PREVIOUS_SHA: "abc", VERCEL_GIT_COMMIT_SHA: "def" }).code).toBe(1);
  });
});
