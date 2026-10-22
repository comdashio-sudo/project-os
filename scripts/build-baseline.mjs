// Builds drizzle/0000_baseline.sql: the DDL drizzle-kit generates from drizzle/schema.ts, then the hand-written security part
// (drizzle/baseline-security.sql). One file builds the whole database from nothing.
//
//   node scripts/build-baseline.mjs          regenerate (run after editing drizzle/schema.ts or the security part)
//   node scripts/build-baseline.mjs --check  fail if the committed file differs from what the sources produce
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const check = process.argv.includes("--check");
const work = mkdtempSync(join(tmpdir(), "project-os-baseline-"));
try {
  // drizzle-kit takes either --config or flags, so the output directory goes in a throwaway config next to the output.
  const config = join(work, "drizzle.build.config.mjs");
  writeFileSync(config, `export default { schema: ${JSON.stringify(join(root, "drizzle", "schema.ts"))}, out: ${JSON.stringify(join(work, "out"))}, dialect: "postgresql" };\n`);
  execFileSync("pnpm", ["exec", "drizzle-kit", "generate", "--name", "baseline", "--config", config], { cwd: root, stdio: "pipe" });
  const generatedName = readdirSync(join(work, "out")).find(name => /^0000_.*\.sql$/.test(name));
  if (!generatedName) throw new Error("drizzle-kit produced no SQL");
  const generated = readFileSync(join(work, "out", generatedName), "utf8").trimEnd();
  const security = readFileSync(join(root, "drizzle", "baseline-security.sql"), "utf8").trim();
  const built = `${generated}\n--> statement-breakpoint\n${security}\n`;
  const target = join(root, "drizzle", "0000_baseline.sql");
  if (check) {
    const committed = readFileSync(target, "utf8");
    if (committed !== built) { console.error("drizzle/0000_baseline.sql is out of date: run `node scripts/build-baseline.mjs`."); process.exit(1); }
    console.log("drizzle/0000_baseline.sql matches drizzle/schema.ts + drizzle/baseline-security.sql");
  } else {
    writeFileSync(target, built);
    rmSync(join(root, "drizzle", "meta"), { recursive: true, force: true });
    cpSync(join(work, "out", "meta"), join(root, "drizzle", "meta"), { recursive: true });
    console.log(`wrote drizzle/0000_baseline.sql (${built.split("\n").length} lines)`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
