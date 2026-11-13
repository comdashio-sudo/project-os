// D-24: what a migration says it builds, read from its own SQL, so a database can be checked against it. Migrations 0002, 0003, 0004 and 0007 were written
// re-runnable (CREATE ... IF NOT EXISTS, «EXCEPTION WHEN duplicate_object», «IF NOT EXISTS (SELECT 1 FROM pg_constraint ...)»): on a database where an object
// already existed in another shape, they pass and leave it as it was. This reads every table, column (with its type and nullability), enum (with its values),
// index, named constraint, function and trigger they declare; scripts/verify-migration-results.mjs then asks the database for each.
import { readFileSync } from "node:fs";

const unquote = name => name.replace(/^"|"$/g, "");

/** A column's SQL type as information_schema reports it. */
export function expectedType(sqlType) {
  const type = sqlType.trim();
  let match;
  if ((match = type.match(/^varchar\((\d+)\)$/i))) return { dataType: "character varying", length: Number(match[1]) };
  if ((match = type.match(/^numeric\((\d+),\s*(\d+)\)$/i))) return { dataType: "numeric", precision: Number(match[1]), scale: Number(match[2]) };
  if (/^timestamp with time zone$/i.test(type)) return { dataType: "timestamp with time zone" };
  if (/^(integer|text|boolean|jsonb|date|bigint|double precision)$/i.test(type)) return { dataType: type.toLowerCase() };
  if ((match = type.match(/^"(?:public"\.")?([a-z_0-9]+)"$/))) return { dataType: "USER-DEFINED", udt: match[1] };
  return { dataType: `unparsed: ${type}` };
}

/** One column definition line of a CREATE TABLE, or the tail of an ADD COLUMN. */
function column(table, text) {
  const match = text.trim().replace(/,$/, "").match(/^"([a-z_0-9]+)"\s+((?:"[^"]+"(?:\."[^"]+")?)|(?:[a-z ]+(?:\(\d+(?:,\s*\d+)?\))?))(.*)$/i);
  if (!match) return null;
  const [, name, type, rest] = match;
  return { table, column: name, ...expectedType(type.replace(/\s+(DEFAULT|NOT|PRIMARY).*$/i, "")), notNull: /NOT NULL|PRIMARY KEY/i.test(rest) || /NOT NULL|PRIMARY KEY/i.test(type) };
}

export function expectationsOf(sql) {
  const out = { tables: [], columns: [], enums: [], indexes: [], constraints: [], functions: [], triggers: [] };
  const body = sql.replace(/--[^\n]*/g, "");
  for (const match of body.matchAll(/CREATE TABLE IF NOT EXISTS "([a-z_0-9]+)" \(([\s\S]*?)\n\);/g)) {
    out.tables.push(match[1]);
    for (const line of match[2].split("\n")) { const found = column(match[1], line); if (found && !/^\s*(CONSTRAINT|PRIMARY KEY|UNIQUE|FOREIGN)/i.test(line)) out.columns.push(found); }
  }
  for (const match of body.matchAll(/ALTER TABLE "([a-z_0-9]+)" ADD COLUMN IF NOT EXISTS ([^;]+);/g)) { const found = column(match[1], match[2]); if (found) out.columns.push(found); }
  for (const match of body.matchAll(/CREATE TYPE "(?:public)"\."([a-z_0-9]+)" AS ENUM\(([^)]*)\)/g)) out.enums.push({ name: match[1], values: [...match[2].matchAll(/'([^']*)'/g)].map(value => value[1]) });
  for (const match of body.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "([a-z_0-9]+)"/g)) out.indexes.push(match[1]);
  for (const match of body.matchAll(/conname = '([a-z_0-9]+)'/g)) out.constraints.push(match[1]);
  for (const match of body.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (?:public\.)?([a-z_0-9]+)\(/gi)) out.functions.push(match[1]);
  for (const match of body.matchAll(/CREATE TRIGGER ([a-z_0-9]+)/gi)) out.triggers.push(unquote(match[1]));
  return out;
}

export const CHECKED_MIGRATIONS = ["0002_warehouse_operations.sql", "0003_field_links.sql", "0004_integrations.sql", "0007_wo16_g189_master_plan_drawing.sql"];
export function expectationsOfFiles(dir, names = CHECKED_MIGRATIONS) {
  return names.map(name => ({ migration: name, ...expectationsOf(readFileSync(`${dir}/${name}`, "utf8")) }));
}

/** Reads the database and lists every expectation it does not meet. `query(sql, params)` returns rows. */
export async function verifyExpectations(query, expectations) {
  const problems = [];
  const columns = await query("SELECT table_name, column_name, data_type, udt_name, character_maximum_length, numeric_precision, numeric_scale, is_nullable FROM information_schema.columns WHERE table_schema = 'public'");
  const byColumn = new Map(columns.map(row => [`${row.table_name}.${row.column_name}`, row]));
  const tables = new Set(columns.map(row => row.table_name));
  const enums = await query("SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' GROUP BY t.typname");
  const enumValues = new Map(enums.map(row => [row.name, Array.isArray(row.labels) ? row.labels : String(row.labels).replace(/^\{|\}$/g, "").split(",")]));
  const indexes = new Set((await query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")).map(row => row.indexname));
  const constraints = new Set((await query("SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'")).map(row => row.conname));
  const functions = new Set((await query("SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'")).map(row => row.proname));
  const triggers = new Set((await query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal")).map(row => row.tgname));
  for (const expected of expectations) {
    const at = what => problems.push({ migration: expected.migration, problem: what });
    for (const table of expected.tables) if (!tables.has(table)) at(`table ${table} is missing`);
    for (const want of expected.columns) {
      const row = byColumn.get(`${want.table}.${want.column}`);
      if (!row) { at(`column ${want.table}.${want.column} is missing`); continue; }
      if (row.data_type !== want.dataType) at(`column ${want.table}.${want.column} is ${row.data_type}, the migration says ${want.dataType}`);
      else if (want.length !== undefined && Number(row.character_maximum_length) !== want.length) at(`column ${want.table}.${want.column} is varchar(${row.character_maximum_length}), the migration says varchar(${want.length})`);
      else if (want.precision !== undefined && (Number(row.numeric_precision) !== want.precision || Number(row.numeric_scale) !== want.scale)) at(`column ${want.table}.${want.column} is numeric(${row.numeric_precision}, ${row.numeric_scale}), the migration says numeric(${want.precision}, ${want.scale})`);
      else if (want.udt && row.udt_name !== want.udt) at(`column ${want.table}.${want.column} is of type ${row.udt_name}, the migration says ${want.udt}`);
      if (want.notNull && row.is_nullable !== "NO") at(`column ${want.table}.${want.column} accepts NULL, the migration says NOT NULL`);
    }
    for (const want of expected.enums) {
      const have = enumValues.get(want.name);
      if (!have) at(`enum ${want.name} is missing`);
      else for (const value of want.values) if (!have.includes(value)) at(`enum ${want.name} has no value «${value}»`);
    }
    for (const name of expected.indexes) if (!indexes.has(name)) at(`index ${name} is missing`);
    for (const name of expected.constraints) if (!constraints.has(name)) at(`constraint ${name} is missing`);
    for (const name of expected.functions) if (!functions.has(name)) at(`function ${name} is missing`);
    for (const name of expected.triggers) if (!triggers.has(name)) at(`trigger ${name} is missing`);
  }
  return problems;
}
