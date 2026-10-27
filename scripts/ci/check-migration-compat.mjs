// Every migration must be BACKWARD COMPATIBLE (expand, then contract): the schema changes first, on its own, while the PREVIOUS release is still serving traffic, and only a LATER
// release may remove what the code no longer reads. This reads the migrations newer than the cutoff and refuses the statements that break code that does not know about them:
//   DROP TABLE / COLUMN / TYPE / VIEW / FUNCTION, RENAME (table, column, value), ALTER COLUMN ... TYPE, ALTER COLUMN ... SET NOT NULL,
//   ADD COLUMN ... NOT NULL without a DEFAULT (the old code's INSERT would fail), DROP CONSTRAINT / DROP NOT NULL are allowed (they only loosen).
// A contract step is allowed when the file says why it is safe:  `-- contract-ok: <reason>` (name the release in which the code stopped reading it).
//   node scripts/ci/check-migration-compat.mjs [--cutoff 16]      Exit 1 on a finding. Prints file names and the offending line, never data.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const cutoffArg = process.argv.indexOf("--cutoff");
export const CUTOFF = cutoffArg > 0 ? Number(process.argv[cutoffArg + 1]) : 16;
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "drizzle");

/** Statement text with comments and string literals removed, so a word in a comment or in a value never counts (DO-block bodies stay: a DROP inside one is still a DROP). */
export function stripped(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").replace(/'(?:[^']|'')*'/g, "''");
}

export const RULES = [
  { name: "DROP TABLE / COLUMN / TYPE / VIEW / FUNCTION / SCHEMA", test: text => /\bDROP\s+(TABLE|COLUMN|TYPE|MATERIALIZED\s+VIEW|VIEW|FUNCTION|SCHEMA)\b/i.test(text) },
  { name: "RENAME", test: text => /\bRENAME\s+(TO|COLUMN|VALUE|CONSTRAINT)\b/i.test(text) },
  { name: "ALTER COLUMN ... TYPE", test: text => /\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i.test(text) },
  { name: "ALTER COLUMN ... SET NOT NULL", test: text => /\bSET\s+NOT\s+NULL\b/i.test(text) },
];

/** An ADD COLUMN ... NOT NULL that carries no DEFAULT (and is not a generated or identity column): the previous release's INSERT omits it and fails. */
export function addColumnNotNullWithoutDefault(text) {
  const found = [];
  for (const statement of text.split(";")) {
    if (!/\bADD\s+COLUMN\b/i.test(statement)) continue;
    for (const part of statement.split(/\bADD\s+COLUMN\b/i).slice(1)) {
      const column = part.split(/,\s*(?=ADD\s+COLUMN|ADD\s+CONSTRAINT|DROP|ALTER)/i)[0];
      if (/\bNOT\s+NULL\b/i.test(column) && !/\b(DEFAULT|GENERATED|SERIAL|BIGSERIAL)\b/i.test(column)) found.push(column.trim().split(/\s+/).slice(0, 3).join(" "));
    }
  }
  return found;
}

export function checkFile(name, sql) {
  const text = stripped(sql);
  const allowed = /--\s*contract-ok:\s*\S+/i.test(sql);
  const findings = [];
  for (const statement of text.split(";")) {
    for (const rule of RULES) if (rule.test(statement)) findings.push(`${rule.name}: ${statement.trim().replace(/\s+/g, " ").slice(0, 110)}`);
  }
  for (const column of addColumnNotNullWithoutDefault(text)) findings.push(`ADD COLUMN ... NOT NULL without DEFAULT: ${column}`);
  return { name, allowed, findings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = readdirSync(dir).filter(file => /^\d{4}_.*\.sql$/.test(file) && Number(file.slice(0, 4)) >= CUTOFF).sort();
  const bad = [];
  for (const file of files) {
    const result = checkFile(file, readFileSync(path.join(dir, file), "utf8"));
    if (result.findings.length && !result.allowed) bad.push(result);
  }
  console.log(`migration compatibility: ${files.length} migration(s) from ${String(CUTOFF).padStart(4, "0")} on checked`);
  if (bad.length) {
    for (const item of bad) { console.log(`::error file=drizzle/${item.name}::not backward compatible`); for (const finding of item.findings) console.log(`  ${item.name}: ${finding}`); }
    console.log("Split it: ship the EXPAND now (add, never remove or tighten); remove or tighten in a LATER release once no running code reads it, with a line `-- contract-ok: <release that stopped using it>`.");
    process.exit(1);
  }
  console.log("migration compatibility: ok");
}
