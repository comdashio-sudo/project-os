import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A header comment in three operator scripts was once mangled by a search-and-replace ("node --import tsx" became a bare
// `import tsx scripts/...` line), so each of them failed to even parse while the build, the type check and every test stayed green.
// Parsing is the cheapest check that an operator script is still runnable.
const root = join(__dirname, "..", "scripts");
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? files(join(dir, entry.name)) : /\.mjs$/.test(entry.name) ? [join(dir, entry.name)] : []));

describe("operator scripts", () => {
  for (const file of files(root)) {
    it(`${file.slice(root.length + 1)} parses`, () => {
      const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    });
  }
});
