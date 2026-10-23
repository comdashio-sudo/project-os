// Seeds ONE synthetic demo tenant into an empty database so a fresh install has
// something to sign in to. Everything here is invented (*.example.test).
//
//   SEED_CONFIRM=yes DATABASE_URL=postgres://... \
//     node --import tsx scripts/seed-demo-tenant.mjs
//
// Refuses to run when any company already exists, so it can never add to (or
// disturb) a database that holds real data. Prints names and ids, no secrets.
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { companies, users } from "../drizzle/schema.ts";
import { createProjectForTenant, createTenantForUser, createWbsItem, getDb, upsertUser } from "../server/db.ts";

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL?.trim().toLowerCase() || "demo.admin@example.test";
if (!/@([a-z0-9-]+\.)*example\.test$/.test(DEMO_EMAIL)) {
  console.error("SEED_DEMO_EMAIL must be an address under example.test (synthetic data only).");
  process.exit(2);
}
if (process.env.SEED_CONFIRM !== "yes") {
  console.error("Set SEED_CONFIRM=yes to seed the demo tenant.");
  process.exit(2);
}

const db = await getDb();
if (!db) {
  console.error("DATABASE_URL is required.");
  process.exit(2);
}
const existing = await db.select({ id: companies.id }).from(companies).limit(1);
if (existing.length > 0) {
  console.error("Refusing to seed: the database already has a company.");
  process.exit(3);
}

// Same identity rule as the e-mail sign-in: openId = email:<40 hex of SHA-256(email)>.
const openId = `email:${createHash("sha256").update(DEMO_EMAIL).digest("hex").slice(0, 40)}`;
// The names a screen shows are Arabic (or neutral codes with no English word in them), so the demo reads as Arabic. They stay obviously
// invented: the company and the project say "العرض التجريبي" (the demonstration). The e-mail address above is kept on purpose.
await upsertUser({ openId, name: "مدير العرض التجريبي", email: DEMO_EMAIL, loginMethod: "email" });
const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

const { tenantId } = await createTenantForUser({ userId: user.id, legalName: "شركة العرض التجريبي", slug: "co-1001", packageCode: "ALL-IN-ONE" });
const { id: projectId } = await createProjectForTenant({ userId: user.id, tenantId, code: "PRJ-1001", name: "مشروع العرض التجريبي", projectType: "سكني", currency: "SAR" });
const foundation = await createWbsItem({ userId: user.id, tenantId, projectId, code: "1", name: "الأساسات", plannedValue: 400000 });
await createWbsItem({ userId: user.id, tenantId, projectId, code: "2", name: "الهيكل الإنشائي", plannedValue: 900000 });
await createWbsItem({ userId: user.id, tenantId, projectId, code: "1.1", name: "أعمال الحفر", parentId: foundation.id, plannedValue: 150000 });

console.log(JSON.stringify({ seeded: true, demoEmail: DEMO_EMAIL, tenantId, projectId }));
process.exit(0);
