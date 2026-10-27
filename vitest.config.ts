import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

// Work order 17, item 3. The files that talk to the shared PostgreSQL test database (server/*.database.test.ts, *.integration.test.ts, *.live.test.ts) share ONE database: two of
// them running at once see each other's rows (a count of 31 instead of 30, seventeen failures when `pnpm test` ran with the database variables set). So when a database is named
// (TEST_DATABASE_URL or DATABASE_URL), files run one at a time -- what `node scripts/run-integration-database-test.mjs` has always done on CI. With no database named, nothing
// touches one and everything runs in parallel, as before. Each database file builds its own company (its own slug and people) and none relies on which file ran before it:
// the permission catalogue that integration.database.test.ts has to replace is restored when that file ends (restorePermissionCatalog), and a run in shuffled file order passes.
const databaseNamed = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["server/testing/databaseGuard.setup.ts", "client/src/test/listSelect.setup.ts"],
    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/**/*.test.tsx", "shared/**/*.test.ts"],
    fileParallelism: !databaseNamed,
  },
});
