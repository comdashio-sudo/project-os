// Builds, reports on, or erases the demonstration company "شركة العرض" (work order 15, item 1). Run from the Actions workflow `demo-company`, or locally against a
// throw-away database:
//
//   DEMO_CONFIRM=yes DATABASE_URL=postgres://... [DEMO_OWNER_EMAIL=you@example.com] node --import tsx scripts/demo/seed-demo-company.mjs seed|status|delete
//
// seed    creates it unless it already exists (then it says so and changes nothing); a failure part-way erases what this run made
// status  says whether it exists, and counts what it holds
// delete  the platform's audited erasure of this one company, then a recount: it prints PASS only when nothing of it is left
// Prints names, counts and ids; never a secret or a connection string.
import { seedDemoCompany, deleteDemoCompany, findDemoCompany } from "./demoCompany.ts";
import { DEMO } from "./demoData.ts";
import { getDb } from "../../server/db.ts";

const mode = process.argv[2] ?? "status";
if (!["seed", "status", "delete"].includes(mode)) { console.error("usage: seed-demo-company.mjs seed|status|delete"); process.exit(2); }
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exit(2); }
const ownerEmail = (process.env.DEMO_OWNER_EMAIL?.trim() || DEMO.defaultOwnerEmail).toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) { console.error("DEMO_OWNER_EMAIL is not a valid address."); process.exit(2); }
if (mode !== "status" && process.env.DEMO_CONFIRM !== "yes") { console.error("Set DEMO_CONFIRM=yes to seed or erase the demonstration company."); process.exit(2); }
const log = message => console.log(`[demo] ${message}`);

try {
  if (mode === "status") {
    const found = await findDemoCompany();
    if (!found) console.log(JSON.stringify({ exists: false }));
    else {
      const db = await getDb(); const client = await db.$client.connect();
      try {
        const count = async sql => Number((await client.query(sql, [found.id])).rows[0].n);
        console.log(JSON.stringify({ exists: true, status: found.status, tenantId: found.id, units: await count("SELECT count(*) n FROM pmc_units WHERE tenant_id = $1"), reports: await count("SELECT count(*) n FROM site_daily_reports WHERE tenant_id = $1"), submittals: await count("SELECT count(*) n FROM consultant_submittals WHERE tenant_id = $1"), ncrs: await count("SELECT count(*) n FROM ncrs WHERE tenant_id = $1") }));
      } finally { client.release(); }
    }
  } else if (mode === "seed") {
    const result = await seedDemoCompany({ ownerEmail, log });
    console.log(JSON.stringify({ seeded: result.created, tenantId: result.tenantId, projectId: result.projectId, ...(result.created ? { evm: result.evm, people: result.people } : { note: "already exists; nothing changed" }) }));
  } else {
    const result = await deleteDemoCompany({ ownerEmail, log });
    console.log(JSON.stringify(result));
    if (result.deleted && result.verification !== "PASS") process.exit(1);
  }
  process.exit(0);
} catch (error) {
  console.error(`[demo] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
