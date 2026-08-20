import mysql from "mysql2/promise";
import { evaluateAuditGrantVerification } from "../server/domain/auditGrantVerification.ts";

const databaseUrl = process.env.AUDIT_APP_DATABASE_URL;
if (!databaseUrl) {
  console.error("AUDIT_APP_DATABASE_URL is required and must contain the restricted project_os_app account.");
  process.exit(2);
}

const connection = await mysql.createConnection(databaseUrl);
try {
  const [grantRows] = await connection.query("SHOW GRANTS");
  const grants = grantRows.flatMap(row => Object.values(row).filter(value => typeof value === "string"));
  const probe = async (operation, sql) => {
    try { await connection.query(sql); return { operation, denied: false }; }
    catch (error) { return { operation, denied: true, errorCode: error?.code ?? "UNKNOWN" }; }
  };
  // Both predicates are false; a successful statement has no business effect, but MySQL/TiDB still checks the requested privilege.
  const probes = await Promise.all([
    probe("update", "UPDATE audit_logs SET action = action WHERE 1 = 0"),
    probe("delete", "DELETE FROM audit_logs WHERE 1 = 0"),
  ]);
  const result = evaluateAuditGrantVerification({ grants, probes });
  console.log(JSON.stringify({ approved: result.approved, checks: result.checks, probeCodes: probes.map(({ operation, errorCode }) => ({ operation, errorCode })) }, null, 2));
  if (!result.approved) process.exitCode = 1;
} finally {
  await connection.end();
}
