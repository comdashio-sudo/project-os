#!/usr/bin/env node
// Quiet gate runner (CLAUDE.md §7, §9). Runs the pre-push gates, writes each full log to
// node_modules/.cache/gates/<gate>.log, and prints only one line per gate plus the vitest summary,
// and the log tail when a gate fails. That keeps thousands of build/test lines out of an agent's context.
//
// A gate that already PASSED on the exact same tree (`git write-tree` hash of tracked, staged and
// untracked-not-ignored files, plus whether DATABASE_URL is set) is not re-run: its earlier result is reported with "cached".
// Any change to the tree invalidates the cache. --no-cache forces every gate to run.
//
//   node scripts/gates.mjs                       check build test
//   node scripts/gates.mjs check test test:db    any of: check build test test:db coverage:trpc
//   node scripts/gates.mjs --no-cache test
import { spawnSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const KNOWN = ["check", "build", "test", "test:db", "coverage:trpc"];
const args = process.argv.slice(2);
const noCache = args.includes("--no-cache");
const gates = args.filter((a) => !a.startsWith("--"));
const run = gates.length ? gates : ["check", "build", "test"];
for (const g of run) if (!KNOWN.includes(g)) { console.error(`unknown gate: ${g} (known: ${KNOWN.join(", ")})`); process.exit(2); }

const dir = "node_modules/.cache/gates";
mkdirSync(dir, { recursive: true });
const cacheFile = `${dir}/results.json`;
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};

// Tree identity: index-after-add of tracked changes, without touching the real index.
const tmpIndex = `${dir}/index.tmp`;
const gitEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex };
// `git add -A` (respecting .gitignore) puts untracked files' CONTENT in the tree too, so editing one invalidates the cache.
execSync(`cp "$(git rev-parse --git-dir)/index" ${tmpIndex} && git add -A`, { env: gitEnv, shell: "/bin/bash" });
const tree = execSync("git write-tree", { env: gitEnv }).toString().trim();
const key = createHash("sha256").update(tree).update(process.env.DATABASE_URL ? "db" : "nodb").digest("hex").slice(0, 16);

// Lines worth keeping from a passing run (vitest totals, tsc/build errors count).
const SUMMARY = /^\s*(Test Files|Tests|Duration)\s|✓ built in|error TS|passed|failed/;
let failed = false;
for (const g of run) {
  const prior = cache[g];
  if (!noCache && prior?.key === key && prior.ok) {
    console.log(`PASS ${g} (cached: same tree ${key}, ran ${prior.at}) ${prior.summary ?? ""}`);
    continue;
  }
  const t0 = Date.now();
  const r = spawnSync("pnpm", [g], { encoding: "utf8", maxBuffer: 1 << 30, env: { ...process.env, FORCE_COLOR: "0", CI: "1" } });
  // vitest colours its output even with FORCE_COLOR=0; strip ANSI so the summary regex matches.
  const out = ((r.stdout ?? "") + (r.stderr ?? "")).replace(/\x1b\[[0-9;]*m/g, "");
  writeFileSync(`${dir}/${g.replace(":", "-")}.log`, out);
  const ok = r.status === 0;
  const keep = out.split("\n").filter((l) => /^\s*(Test Files|Tests)\s/.test(l)).map((l) => l.trim()).join(" | ");
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`${ok ? "PASS" : "FAIL"} ${g} (${secs}s, ${out.length} bytes of log in ${dir}/${g.replace(":", "-")}.log) ${keep}`);
  if (!ok) {
    failed = true;
    const tail = out.split("\n").filter((l) => l.trim()).slice(-40);
    const hits = out.split("\n").filter((l) => SUMMARY.test(l) && /FAIL|error|✗|×/.test(l)).slice(0, 40);
    console.log([...new Set([...hits, "--- tail ---", ...tail])].join("\n"));
  }
  cache[g] = { key, ok, at: new Date().toISOString(), summary: keep };
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
}
process.exit(failed ? 1 : 0);
