import { createGzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Request, Response } from "express";
import { z } from "zod";
import { runWithDbContext } from "./_core/database";
import { dbContextForUser } from "./_core/requestContext";
import { sdk } from "./_core/sdk";
import { logError } from "./_core/logger";
import { mfaGateRefusal } from "./mfa";
import { getDb } from "./db";
import { storageGetSignedUrl } from "./storage";
import { assertTenantOwner, exportTenantLines, recordAudit, type ExportLine } from "./tenantData";

/**
 * GET /api/tenant-export/:tenantId — the whole company's data as newline-delimited JSON, gzipped, streamed (a big company never sits in memory).
 * Only the company's TENANT_OWNER, signed in. The audit trail gets a row ONLY when the stream finished, so "exported" means a complete file,
 * and the deletion flow's "export first" rule cannot be satisfied by an interrupted download.
 */
export async function tenantExportHandler(req: Request, res: Response) {
  const parsed = z.string().uuid().safeParse(req.params.tenantId);
  if (!parsed.success) return res.status(400).json({ code: "PROJECT_OS_TENANT_NOT_FOUND" });
  const tenantId = parsed.data;
  let user: Awaited<ReturnType<typeof sdk.authenticateSession>>["user"]; let mfaVerified: boolean;
  try { ({ user, mfaVerified } = await sdk.authenticateSession(req)); } catch { return res.status(401).json({ code: "PROJECT_OS_AUTH_REQUIRED" }); }
  // the second-step gate applies to this plain HTTP route exactly as it does to the tRPC procedures
  if (await mfaGateRefusal(user, mfaVerified)) return res.status(403).json({ code: "PROJECT_OS_MFA_REQUIRED" });
  // Everything below runs with the caller's companies installed for the database (second layer of isolation, server/_core/database.ts).
  return runWithDbContext(await dbContextForUser(user), () => streamExport(res, tenantId, user.id));
}

async function streamExport(res: Response, tenantId: string, userId: number) {
  const db = await getDb();
  if (!db) return res.status(503).json({ code: "PROJECT_OS_SERVICE_UNAVAILABLE" });
  try { await assertTenantOwner(db, userId, tenantId); } catch { return res.status(403).json({ code: "PROJECT_OS_TENANT_OWNER_REQUIRED" }); }

  let totalRows = 0; let tables = 0;
  async function* lines() {
    for await (const line of exportTenantLines(db!, tenantId, { signedUrl: async key => { try { return await storageGetSignedUrl(key); } catch { return null; } } }) as AsyncGenerator<ExportLine>) {
      if (line.kind === "table-end") tables++;
      if (line.kind === "row") totalRows++;
      yield `${JSON.stringify(line)}\n`;
    }
  }
  res.status(200);
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Disposition", `attachment; filename="project-os-export-${tenantId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.ndjson.gz"`);
  res.setHeader("Cache-Control", "no-store");
  try {
    await pipeline(Readable.from(lines()), createGzip(), res);
    await recordAudit(db, { tenantId, actorUserId: userId, action: "tenant.data_exported", metadata: { totalRows, tables } });
  } catch (error) {
    logError("tenant_export.failed", error); // no audit row: an interrupted file does not count as an export
    if (!res.headersSent) res.status(500).end(); else res.destroy();
  }
}
