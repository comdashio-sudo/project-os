import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Work order 4, item 4: the server prints through server/_core/logger.ts, whose output is a closed set of fields. A direct console call anywhere
// else is a way back to printing an error object (a driver message carries the SQL with its values). This is the meeting point of every path:
// a new file that forgets fails here by name.
const root = join(__dirname, "..");
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) && name !== "logger.ts" ? [path] : [];
  });
}

describe("server logging goes through the safe logger", () => {
  it("scans the server (the scan is not vacuous)", () => {
    expect(sourceFiles(root).length).toBeGreaterThan(40);
  });
  it("has no direct console call outside logger.ts", () => {
    const offenders = sourceFiles(root).filter(file => /\bconsole\.(error|warn|log|info|debug)\b/.test(readFileSync(file, "utf8"))).map(file => relative(root, file));
    expect(offenders).toEqual([]);
  });
});
