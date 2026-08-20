import mysql from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { getScopedAuditAppUsername } from "./domain/auditAccountIdentity";

const rootUrl = process.env.DATABASE_URL;
const appPassword = process.env.PROJECT_OS_APP_DB_PASSWORD;

describe("restricted audit application account", () => {
  it.skipIf(!rootUrl || !appPassword)("connects with the supplied secret and executes a read-only health query", async () => {
    const url = new URL(rootUrl!);
    url.username = getScopedAuditAppUsername(rootUrl!);
    url.password = appPassword!;
    const connection = await mysql.createConnection(url.toString());
    try {
      const [rows] = await connection.query("SELECT 1 AS connected LIMIT 1");
      expect(rows).toEqual([{ connected: 1 }]);
    } finally {
      await connection.end();
    }
  }, 15_000);
});
