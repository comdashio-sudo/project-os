import { provisionAuditAppAccount } from "./lib/auditProtection.mjs";

const rootUrl = process.env.DATABASE_URL;
const appPassword = process.env.PROJECT_OS_APP_DB_PASSWORD;
if (!rootUrl || !appPassword) {
  console.error("DATABASE_URL and PROJECT_OS_APP_DB_PASSWORD are required.");
  process.exit(2);
}

try {
  const result = await provisionAuditAppAccount({ rootUrl, appPassword });
  console.log(JSON.stringify({ account: result.account, database: result.database, auditedTablePrivileges: ["SELECT", "INSERT"], tableCount: result.tableCount }, null, 2));
} catch (error) {
  console.error(error?.message ?? "Audit account provisioning failed.");
  process.exitCode = String(error?.message).includes("unsupported identifier") || String(error?.message).includes("TiDB Cloud user prefix") ? 2 : 1;
}
