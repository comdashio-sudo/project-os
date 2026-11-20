import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Work order 20, item 13 (audit 4.12): `rows = 0` with no error is ambiguous — "row-level security refused it" and "nothing matched" are opposite conclusions. A bare UPDATE (its result is not
// kept, so a row count of 0 passes silently) is acceptable only when the same function READ the row first (a missing row fails there, loudly). This scan finds every bare UPDATE with no read
// before it in its function; a new one fails the test until it returns its row (.returning) or is listed below with the reason a zero count is harmless.
const root = __dirname;
const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return name === "node_modules" || name === "testing" ? [] : sources(path);
  return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
});

const READ_BEFORE = /\.select\(|\bload\w*\(|\bfind\w*\(|\bget\w*\(|\bassert\w*\(|\browOf\(|\.query\./;
const FUNCTION_START = /^(export\s+)?(async\s+)?function\s|^}\s*$|^const \w+ = async|^export const \w+ = async/;

function bareUpdatesWithoutRead(): string[] {
  const found: string[] = [];
  for (const path of sources(root)) {
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!/\b(db|tx|trx|database)\.update\(/.test(line)) return;
      let statement = line; let end = index;
      while (!lines[end].includes(";") && end < index + 6) { end++; statement += lines[end]; }
      if (statement.includes(".returning(") || /^\s*(const|let)\s/.test(line) || statement.includes("rowsAffected") || /=\s*await/.test(line.split(".update(")[0])) return;
      let read = false;
      for (let back = index - 1; back >= 0 && !FUNCTION_START.test(lines[back]); back--) if (READ_BEFORE.test(lines[back])) { read = true; break; }
      if (!read) found.push(`${relative(root, path)}: ${line.trim().slice(0, 90)}`);
    });
  }
  return found;
}

// file: start of the statement -> why a zero row count is harmless there
const HARMLESS: Record<string, string> = {
  "importJobs.ts: await db.update(dataImports).set({ heartbeatAt: sql`now()`, progressStage: stage, progr": "documented no-op: the heartbeat does nothing once the import has left the in-flight statuses, and zero rows is exactly that case",
  "mfa.ts: await db.update(userMfa).set(next >= MFA_MAX_FAILURES ? { failures: 0, lockedUntil: new Date(now.ge": "recordFailure is handed a row its caller has just read; the wrong-code refusal is thrown whether or not the counter moved",
};

describe("rows = 0 without an error is never taken for success", () => {
  it("scans the server (the scan is not vacuous): it sees the updates that ARE read first", () => {
    const text = sources(root).map(path => readFileSync(path, "utf8")).join("\n");
    expect((text.match(/\b(db|tx)\.update\(/g) ?? []).length).toBeGreaterThan(120);
  });

  it("every bare UPDATE has a read before it in its function, or is listed with the reason a zero count is harmless", () => {
    const unlisted = bareUpdatesWithoutRead().filter(entry => !Object.keys(HARMLESS).some(prefix => entry.startsWith(prefix.slice(0, 80))));
    expect(unlisted).toEqual([]);
  });

  it("every listed exception still exists (a stale entry would excuse a different statement)", () => {
    const found = bareUpdatesWithoutRead();
    for (const prefix of Object.keys(HARMLESS)) expect(found.some(entry => entry.startsWith(prefix.slice(0, 80))), prefix).toBe(true);
  });

  it("the sync run's closing write proves its row (negative control for the fix of this batch)", () => {
    const text = readFileSync(join(root, "integrations", "sync.ts"), "utf8");
    expect(text).toMatch(/\.returning\(\{ id: integrationSyncRuns\.id \}\)[\s\S]{0,120}PROJECT_OS_SYNC_RUN_NOT_FOUND/);
  });
});
