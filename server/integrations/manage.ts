// The company manager's read side of the exchange log and the mappings (the same data the API's /sync and /mappings give a key).
import { assertTenantManager, getDb } from "../db";
import { listMappings, type MappingType } from "./mappings";
import { listSyncItems, listSyncRuns, type SyncOutcome } from "./sync";

const database = async () => { const db = await getDb(); if (!db) throw new Error("Database connection is not available"); return db; };

export async function listSyncRunsForManager(input: { userId: number; tenantId: string }) {
  await assertTenantManager(input.userId, input.tenantId);
  return listSyncRuns(await database(), input.tenantId, 100);
}
export async function listSyncItemsForManager(input: { userId: number; tenantId: string; runId: string; outcome?: SyncOutcome }) {
  await assertTenantManager(input.userId, input.tenantId);
  return listSyncItems(await database(), input.tenantId, input.runId, input.outcome);
}
export async function listMappingsForManager(input: { userId: number; tenantId: string; system?: string; type?: MappingType }) {
  await assertTenantManager(input.userId, input.tenantId);
  return listMappings(input);
}
