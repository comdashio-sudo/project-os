import mysql from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { getScopedAuditAdminUsername } from "./domain/auditAccountIdentity";

const rootUrl = process.env.DATABASE_URL;
const adminPassword = process.env.PROJECT_OS_AUDIT_ADMIN_PASSWORD;

describe("audit administrator account", () => {
  it.skipIf(!rootUrl || !adminPassword)("connects with the supplied secret and executes a read-only health query", async () => {
    const url = new URL(rootUrl!);
    url.username = getScopedAuditAdminUsername(rootUrl!);
    url.password = adminPassword!;
    const connection = await mysql.createConnection(url.toString());
    try {
      const [rows] = await connection.query("SELECT 1 AS connected LIMIT 1");
      expect(rows).toEqual([{ connected: 1 }]);
    } finally {
      await connection.end();
    }
  }, 15_000);
});
