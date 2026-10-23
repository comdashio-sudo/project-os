// Mints a browser session for the synthetic demo administrator, for the UI audit only.
// It uses the app's own signing key and writes the token to a file the caller names (mode 600), never to stdout.
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET)
//   node --import tsx tests/ui/mintSession.mjs <outFile>
//
// The demo user is the synthetic one scripts/seed-demo-tenant.mjs creates. Nothing here prints a secret.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { users } from "../../drizzle/schema.ts";
import { sdk } from "../../server/_core/sdk.ts";
import { getDb } from "../../server/db.ts";

const outFile = process.argv[2];
if (!outFile) {
  console.error("usage: node --import tsx tests/ui/mintSession.mjs <outFile>");
  process.exit(2);
}
const email = "demo.admin@example.test";
const openId = `email:${createHash("sha256").update(email).digest("hex").slice(0, 40)}`;
const db = await getDb();
if (!db) throw new Error("database is not available");
const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
if (!user) throw new Error("the synthetic demo user is not seeded");
const token = await sdk.issueSession(openId, { name: user.name ?? "Demo Admin" });
writeFileSync(outFile, token, { mode: 0o600 });
console.log(JSON.stringify({ wrote: outFile, user: "demo admin" }));
process.exit(0);
