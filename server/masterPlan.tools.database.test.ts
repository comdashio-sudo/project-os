import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Work order 5, item 9 (G-135, G-136) on a real database and through the real router: the plan underlay's rotation and real size, moving an entity in
// the parent tree (never into a loop) and editing its geometry, and sharing a saved view with the project. Synthetic data only.
const SLUG = "mp-tools";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@mp.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const DENIED = "PROJECT_OS_PERMISSION_DENIED";

let connection: fixtureDb.Connection;
let tenantId = ""; let projectId = ""; let otherProjectId = "";
const ids: Record<string, number> = {};
const KEYS = ["owner", "reader", "stranger", "otherOwner"] as const;
type Key = (typeof KEYS)[number];
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
let versionId = ""; let planId = "";
const entity: Record<string, string> = {};
const scope = () => ({ tenantId, projectId });

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    for (const table of ["master_plan_snapshots", "master_plan_visualization_rules", "master_plan_spatial_entities", "master_plan_versions", "master_plans"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM membership_invitations WHERE tenantId = ?", [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    await connection.query("DELETE FROM roles WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM memberships WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM projects WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'mpt-%'");
}

const addEntity = (code: string, parent?: string, extra: Record<string, unknown> = {}) => callers.owner.masterPlans.createSpatialEntity({ ...scope(), masterPlanVersionId: versionId, code, name: `Entity ${code}`, entityType: "zone", geometry: { x: 5, y: 5, width: 20, height: 20 }, status: "in_progress", progressPercent: 10, ...(parent ? { parentEntityId: parent } : {}), ...extra });

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Master Plan tools on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`mpt-${key}`, `MP ${key}`, `mpt-${key}@mp.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'mpt-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `mpt-${key}`)!.id; callers[key] = callerFor(ids[key], `mpt-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "MP Tools Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await callers.otherOwner.tenant.create({ legalName: "Other MP Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" });
    projectId = "ab000000-0000-4000-8000-000000000001"; otherProjectId = "ab000000-0000-4000-8000-000000000002";
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'MPT-1', 'MP villas', 'villas', 'SAR', 'active'), (?, ?, 'MPT-2', 'Second', 'villas', 'SAR', 'active')", [projectId, tenantId, otherProjectId, tenantId]);
    const reader = await callers.owner.tenant.createRole({ tenantId, code: "MPT_READER", name: "MP reader", productCode: "PROJECT", permissionCodes: ["project.read"] });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.reader, roleId: reader.id, scopeType: "company" });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    const plan = await callers.owner.masterPlans.create({ ...scope(), code: "MP-1", title: "Tools plan" });
    planId = plan.id; versionId = plan.versionId;
    entity.root = (await addEntity("ROOT")).id; entity.child = (await addEntity("CHILD", entity.root)).id; entity.grand = (await addEntity("GRAND", entity.child)).id; entity.other = (await addEntity("OTHER")).id;
  }, 120_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("rotation and the real size of the plan: saved normalised, read back with the plan, both sizes or neither, writers only", async () => {
    const saved = await callers.owner.masterPlans.setVersionGeometry({ ...scope(), masterPlanVersionId: versionId, rotationDegrees: 270, mapWidthMeters: 400, mapHeightMeters: 250 });
    expect(saved).toEqual({ id: versionId, rotationDegrees: -90, mapWidthMeters: 400, mapHeightMeters: 250 });
    const read = await callers.reader.masterPlans.list(scope());
    expect(read.versions.find(item => item.id === versionId)).toMatchObject({ rotationDegrees: -90, mapWidthMeters: "400.00", mapHeightMeters: "250.00" });
    await expect(callers.owner.masterPlans.setVersionGeometry({ ...scope(), masterPlanVersionId: versionId, rotationDegrees: 0, mapWidthMeters: 400 })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_CALIBRATION_INVALID");
    await expect(callers.owner.masterPlans.setVersionGeometry({ ...scope(), masterPlanVersionId: versionId, rotationDegrees: 0, mapWidthMeters: -5, mapHeightMeters: 10 })).rejects.toThrow();
    await callers.owner.masterPlans.setVersionGeometry({ ...scope(), masterPlanVersionId: versionId, rotationDegrees: 15 }); // a turn without calibration clears the sizes
    expect((await callers.reader.masterPlans.list(scope())).versions.find(item => item.id === versionId)).toMatchObject({ rotationDegrees: 15, mapWidthMeters: null, mapHeightMeters: null });
    await expect(callers.reader.masterPlans.setVersionGeometry({ ...scope(), masterPlanVersionId: versionId, rotationDegrees: 1 })).rejects.toThrow(DENIED);
    await expect(callers.stranger.masterPlans.setVersionGeometry({ ...scope(), masterPlanVersionId: versionId, rotationDegrees: 1 })).rejects.toThrow();
    await expect(callers.owner.masterPlans.setVersionGeometry({ tenantId, projectId: otherProjectId, masterPlanVersionId: versionId, rotationDegrees: 1 })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND"); // a version of project 1 through project 2
  });

  it("moving an entity in the parent tree: allowed inside the version, never into a loop, a root with null, writers only", async () => {
    await expect(callers.owner.masterPlans.updateEntityLayout({ ...scope(), entityId: entity.root, parentEntityId: entity.grand })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_PARENT_CYCLE"); // under its own grandchild
    await expect(callers.owner.masterPlans.updateEntityLayout({ ...scope(), entityId: entity.child, parentEntityId: entity.child })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_PARENT_CYCLE");
    await expect(callers.owner.masterPlans.updateEntityLayout({ ...scope(), entityId: entity.child, parentEntityId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_PARENT_NOT_FOUND");
    await callers.owner.masterPlans.updateEntityLayout({ ...scope(), entityId: entity.grand, parentEntityId: entity.other }); // a subtree moves under another tree
    await callers.owner.masterPlans.updateEntityLayout({ ...scope(), entityId: entity.child, parentEntityId: null }); // and a branch becomes a root
    const parents = Object.fromEntries((await callers.reader.masterPlans.list(scope())).entities.map(item => [item.code, item.parentEntityId]));
    expect(parents).toMatchObject({ ROOT: null, CHILD: null, GRAND: entity.other, OTHER: null });
    await expect(callers.owner.masterPlans.updateEntityLayout({ ...scope(), entityId: entity.other, parentEntityId: entity.grand })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_PARENT_CYCLE"); // OTHER under its new child
    await expect(callers.reader.masterPlans.updateEntityLayout({ ...scope(), entityId: entity.child, parentEntityId: entity.root })).rejects.toThrow(DENIED);
    await expect(callers.owner.masterPlans.updateEntityLayout({ ...scope(), entityId: entity.child })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_NOTHING_TO_CHANGE");
    await expect(callers.owner.masterPlans.updateEntityLayout({ tenantId, projectId: otherProjectId, entityId: entity.child, parentEntityId: null })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_ENTITY_NOT_FOUND");
  });

  it("editing an entity's geometry: kept inside the plan, validated like a new entity", async () => {
    await callers.owner.masterPlans.updateEntityLayout({ ...scope(), entityId: entity.root, geometry: { x: 40, y: 30, width: 50, height: 60 } });
    expect((await callers.reader.masterPlans.list(scope())).entities.find(item => item.code === "ROOT")?.geometry).toBe(JSON.stringify({ x: 40, y: 30, width: 50, height: 60 }));
    for (const bad of [{ x: 60, y: 0, width: 50, height: 10 }, { x: -1, y: 0, width: 5, height: 5 }, { x: 0, y: 0, width: 0, height: 5 }]) await expect(callers.owner.masterPlans.updateEntityLayout({ ...scope(), entityId: entity.root, geometry: bad })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_GEOMETRY_INVALID");
    await expect(callers.reader.masterPlans.updateEntityLayout({ ...scope(), entityId: entity.root, geometry: { x: 1, y: 1, width: 2, height: 2 } })).rejects.toThrow(DENIED);
  });

  it("sharing a saved view: private by default, visible to the project once shared, only its author decides, and taking it back hides it again", async () => {
    const view = await callers.reader.masterPlans.createSnapshot({ ...scope(), masterPlanVersionId: versionId, label: "Reader view", metric: "progress", filters: {}, viewport: { x: 0, y: 0, zoom: 1 }, layers: ["entities"] });
    const labels = async (who: Key) => (await callers[who].masterPlans.listSnapshots({ ...scope(), masterPlanVersionId: versionId })).map(item => item.label);
    expect(await labels("owner")).toEqual([]); // the original rule: not shared, not visible
    await expect(callers.owner.masterPlans.setSnapshotSharing({ ...scope(), snapshotId: view.id, shared: true })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_SNAPSHOT_NOT_FOUND"); // not theirs and not shared with them: it does not exist for them
    expect(await callers.reader.masterPlans.setSnapshotSharing({ ...scope(), snapshotId: view.id, shared: true })).toEqual({ id: view.id, shared: true });
    expect(await labels("owner")).toEqual(["Reader view"]);
    const seen = (await callers.owner.masterPlans.listSnapshots({ ...scope(), masterPlanVersionId: versionId }))[0];
    expect(seen).toMatchObject({ sharedWithProject: true, createdByUserId: ids.reader });
    await expect(callers.owner.masterPlans.setSnapshotSharing({ ...scope(), snapshotId: view.id, shared: false })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_SNAPSHOT_NOT_OWNER"); // the owner of the company sees it but does not decide for its author
    await expect(callers.stranger.masterPlans.listSnapshots({ ...scope() })).rejects.toThrow();
    await callers.reader.masterPlans.setSnapshotSharing({ ...scope(), snapshotId: view.id, shared: false });
    expect(await labels("owner")).toEqual([]);
    expect(await labels("reader")).toEqual(["Reader view"]);
  });

  it("every write left an audit row", async () => {
    const [rows] = await connection.query<{ action: string; n: number }[]>("SELECT action, COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action LIKE 'master_plans.%' GROUP BY action", [tenantId]);
    const seen = new Map(rows.map(row => [row.action, Number(row.n)]));
    for (const action of ["master_plans.version_geometry_set", "master_plans.entity_layout_updated", "master_plans.snapshot_shared", "master_plans.snapshot_unshared"]) expect(seen.get(action), action).toBeGreaterThan(0);
  });
});
