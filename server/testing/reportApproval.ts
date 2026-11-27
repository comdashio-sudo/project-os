// Q-71 (2): a company's daily reports need no approval unless it turns the rule on. The tests of the approval chain (prepare → review → approve, separation of
// duties, the QC hold on approval) turn it on for their company first, as a manager would on the quality screen. Test database only (TEST_DATABASE_URL).
import { randomUUID } from "node:crypto";
import pg from "pg";

export async function requireReportApproval(tenantId: string, on = true) {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO tenant_policies (id, tenant_id, daily_report_approval) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id) DO UPDATE SET daily_report_approval = EXCLUDED.daily_report_approval, updated_at = now()`,
      [randomUUID(), tenantId, on],
    );
  } finally { await client.end(); }
}
