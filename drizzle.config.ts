import { defineConfig } from "drizzle-kit";

// `generate` only reads the schema; DATABASE_URL is needed for `migrate`/`push`, which this project does not use (scripts/migrate.mjs applies the SQL).
export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://unused:unused@127.0.0.1:5432/unused" },
});
