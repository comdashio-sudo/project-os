import { createHash } from "node:crypto";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import * as storage from "./storage";

// Work order 16, item 5 (G-189) on a real database and through the real router: the saved drawing layout (polygons, confirmed links), the
// drawing file and its versions, and the audit rows. Synthetic data only: plan, units and drawing files are made here.
vi.mock("./storage", async importOriginal => (await import("./testing/memoryStorage")).memoryStorageModule(await importOriginal<typeof import("./storage")>()));

const SLUG = "mp-drawing";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@mpd.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const DENIED = "PROJECT_OS_PERMISSION_DENIED.";
const NIL = "00000000-0000-4000-8000-000000000000";

/** A PDF with `pages` empty pages, written by hand (correct cross-reference table, so any reader counts the pages it says). */
function pdf(pages: number): Buffer {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_unused, i) => `${i + 3} 0 R`).join(" ")}] /Count ${pages} >>`];
  for (let i = 0; i < pages; i += 1) objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>");
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => { const at = Buffer.byteLength(body, "latin1"); body += `${index + 1} 0 obj\n${object}\nendobj\n`; return at; });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(at => `${String(at).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a0a6a1a20000000049454e44ae426082", "hex");
const DXF = Buffer.from("0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n", "latin1");
const square = (x: number, y: number, size = 10) => [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }];

let connection: fixtureDb.Connection;
let tenantId = ""; let otherTenantId = ""; let projectId = ""; let otherProjectId = "";
const ids: Record<string, number> = {};
const KEYS = ["owner", "reader", "stranger", "otherOwner"] as const;
type Key = (typeof KEYS)[number];
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
let versionId = ""; let otherVersionId = ""; let drawingVersionId = "";
const unit: Record<string, string> = {};
const polygon: Record<string, string> = {};
const scope = () => ({ tenantId, projectId });
const plan = () => ({ tenantId, projectId, masterPlanVersionId: versionId });
let linked = 0; let unlinked = 0;

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    for (const table of ["master_plan_drawing_links", "master_plan_drawing_polygons", "master_plan_drawing_versions", "master_plan_drawings", "master_plan_snapshots", "master_plan_visualization_rules", "master_plan_spatial_entities", "master_plan_versions", "master_plans"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
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
  await connection.query("DELETE FROM users WHERE openId LIKE 'mpd-%'");
}

/** The browser's half: ask for the URL, PUT the bytes (the memory storage keeps them under the key), then call the procedure with the key. */
async function uploadDrawing(who: Key, versionForUpload: string, bytes: Buffer, fileName: string, project = projectId, tenant = tenantId) {
  const target = await callers[who].directUploads.create({ tenantId: tenant, projectId: project, purpose: "masterPlanDrawing", fileName, contentType: "application/octet-stream" });
  storage.simulateBrowserUpload(target.uploadKey, bytes, "application/octet-stream");
  return { target, result: () => callers[who].masterPlans.uploadDrawingVersion({ tenantId: tenant, projectId: project, masterPlanVersionId: versionForUpload, uploadKey: target.uploadKey, fileName }) };
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Master Plan drawing layout on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`mpd-${key}`, `MPD ${key}`, `mpd-${key}@mpd.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'mpd-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `mpd-${key}`)!.id; callers[key] = callerFor(ids[key], `mpd-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Drawing Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.otherOwner.tenant.create({ legalName: "Other Drawing Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    projectId = "ac000000-0000-4000-8000-000000000001"; otherProjectId = "ac000000-0000-4000-8000-000000000002";
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'MPD-1', 'Drawing villas', 'villas', 'SAR', 'active'), (?, ?, 'MPD-2', 'Second', 'villas', 'SAR', 'active')", [projectId, tenantId, otherProjectId, tenantId]);
    const reader = await callers.owner.tenant.createRole({ tenantId, code: "MPD_READER", name: "Drawing reader", productCode: "PROJECT", permissionCodes: ["project.read"] });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.reader, roleId: reader.id, scopeType: "company" });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    const first = await callers.owner.masterPlans.create({ tenantId, projectId, code: "MPD-PLAN", title: "Drawing plan" });
    versionId = first.versionId;
    const second = await callers.owner.masterPlans.create({ tenantId, projectId: otherProjectId, code: "MPD-PLAN-2", title: "Second plan" });
    otherVersionId = second.versionId;
    for (const [key, code, entityType] of [["u1", "B1-U-0001", "unit"], ["u2", "B1-U-0002", "unit"], ["zone", "Z1", "zone"]] as const) {
      unit[key] = (await callers.owner.masterPlans.createSpatialEntity({ ...plan(), code, name: `Entity ${code}`, entityType, geometry: { x: 5, y: 5, width: 20, height: 20 }, status: "not_started", progressPercent: 0 })).id;
    }
  }, 120_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("the drawing file is stored as a version under this tenant and project, the checksum and the page count are kept, and an earlier version stays", async () => {
    const pdfBytes = pdf(2);
    const first = await (await uploadDrawing("owner", versionId, pdfBytes, "plan.pdf")).result();
    expect(first).toMatchObject({ versionNumber: 1, mimeType: "application/pdf", pageCount: 2, checksumSha256: createHash("sha256").update(pdfBytes).digest("hex") });
    drawingVersionId = first.drawingId;
    const [row] = await connection.query<{ storage_key: string; page_count: number }[]>("SELECT storage_key, page_count FROM master_plan_drawing_versions WHERE id = ?", [first.id]);
    expect(row[0].storage_key.startsWith(`tenants/${tenantId}/projects/${projectId}/master-plan-drawings/${first.drawingId}/v1/`)).toBe(true);
    expect(Number(row[0].page_count)).toBe(2);
    expect(storage.simulateBrowserUpload).toBeDefined();
    const stored = await (storage as unknown as { storageRead: (key: string) => Promise<Buffer> }).storageRead(row[0].storage_key);
    expect(stored.equals(pdfBytes)).toBe(true);

    const second = await (await uploadDrawing("owner", versionId, PNG, "scan.png")).result();
    expect(second).toMatchObject({ drawingId: first.drawingId, versionNumber: 2, mimeType: "image/png", pageCount: 1 });
    const third = await (await uploadDrawing("owner", versionId, DXF, "plan.dxf")).result();
    expect(third).toMatchObject({ versionNumber: 3, mimeType: "application/dxf", pageCount: 1 });

    const listed = await callers.reader.masterPlans.drawingVersions(plan());
    expect(listed.versions.map(item => item.versionNumber)).toEqual([3, 2, 1]); // newest first, and nothing removed
    expect(listed.versions[2]).toMatchObject({ id: first.id, pageCount: 2, checksumSha256: first.checksumSha256 });
    expect(listed.versions[0]).not.toHaveProperty("storageKey");
    const layout = await callers.reader.masterPlans.drawingLayout(plan());
    expect(layout.latestVersion?.versionNumber).toBe(3);
    const [count] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM master_plan_drawing_versions WHERE drawingId = ?", [first.drawingId]);
    expect(Number(count[0].n)).toBe(3);
  });

  it("a file that is not a drawing, a broken PDF, or a binary DXF is refused and nothing is stored", async () => {
    await expect((await uploadDrawing("owner", versionId, Buffer.from("just some text"), "notes.pdf")).result()).rejects.toThrow("PROJECT_OS_MASTER_PLAN_DRAWING_FILE_INVALID");
    await expect((await uploadDrawing("owner", versionId, Buffer.from("%PDF-1.4\ngarbage without any pages", "latin1"), "broken.pdf")).result()).rejects.toThrow("PROJECT_OS_MASTER_PLAN_DRAWING_FILE_INVALID");
    await expect((await uploadDrawing("owner", versionId, Buffer.concat([Buffer.from("AutoCAD Binary DXF\r\n\x1a\0", "latin1"), Buffer.alloc(40)]), "binary.dxf")).result()).rejects.toThrow("PROJECT_OS_MASTER_PLAN_DRAWING_FILE_INVALID");
    const [count] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM master_plan_drawing_versions WHERE drawingId = ?", [drawingVersionId]);
    expect(Number(count[0].n)).toBe(3);
  });

  it("a layout is saved, reloaded with the same polygons and confirmed links, and a later save changes only what it says", async () => {
    await expect(callers.owner.masterPlans.saveDrawingLayout({ ...plan(), polygons: [{ ref: "P1", label: "B1", points: square(0, 0) }] })).resolves.toMatchObject({ drawingId: drawingVersionId });
    const saved = await callers.owner.masterPlans.saveDrawingLayout({ ...plan(), polygons: [
      { ref: "P1", label: "B1-U-0001", points: square(0, 0) },
      { ref: "P2", label: "B1-U-0002", points: square(20, 0) },
      { ref: "P3", label: "", points: square(40, 0) },
    ] });
    expect(saved.polygons.map(item => item.ref)).toEqual(["P1", "P2", "P3"]);
    for (const item of saved.polygons) polygon[item.ref] = item.id;
    const first = await callers.owner.masterPlans.linkDrawingUnit({ ...plan(), polygonId: polygon.P1, entityId: unit.u1 }); linked += 1;
    await callers.owner.masterPlans.linkDrawingUnit({ ...plan(), polygonId: polygon.P2, entityId: unit.u2 }); linked += 1;
    expect(first).toMatchObject({ polygonId: polygon.P1, entityId: unit.u1 });

    const reloaded = await callers.reader.masterPlans.drawingLayout(plan());
    expect(reloaded.polygons.map(item => ({ id: item.id, ref: item.ref, label: item.label, points: item.points }))).toEqual(saved.polygons.map(item => ({ id: item.id, ref: item.ref, label: item.label, points: square(item.ref === "P1" ? 0 : item.ref === "P2" ? 20 : 40, 0) })));
    expect(reloaded.links.map(item => [item.polygonId, item.entityId]).sort()).toEqual([[polygon.P1, unit.u1], [polygon.P2, unit.u2]].sort());
    expect(reloaded.drawingId).toBe(drawingVersionId);

    // a later save: P1 moved, P2 kept, P3 left out (it has no link), P4 added
    const later = await callers.owner.masterPlans.saveDrawingLayout({ ...plan(), polygons: [
      { id: polygon.P1, ref: "P1", label: "B1-U-0001", points: square(5, 5) },
      { id: polygon.P2, ref: "P2", label: "B1-U-0002", points: square(20, 0) },
      { ref: "P4", label: "Extra", points: square(60, 0) },
    ] });
    expect(later.polygons.map(item => item.ref).sort()).toEqual(["P1", "P2", "P4"]);
    expect(later.polygons.find(item => item.ref === "P1")?.id).toBe(polygon.P1);
    const after = await callers.reader.masterPlans.drawingLayout(plan());
    expect(after.polygons.find(item => item.ref === "P1")?.points).toEqual(square(5, 5));
    expect(after.polygons.some(item => item.ref === "P3")).toBe(false);
    expect(after.links).toHaveLength(2);
    polygon.P4 = later.polygons.find(item => item.ref === "P4")!.id;
  });

  it("a polygon that still has a confirmed link cannot be left out of a save; unlinking it first makes that possible", async () => {
    await expect(callers.owner.masterPlans.saveDrawingLayout({ ...plan(), polygons: [{ id: polygon.P2, ref: "P2", label: "B1-U-0002", points: square(20, 0) }] })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_DRAWING_POLYGON_LINKED");
    expect((await callers.reader.masterPlans.drawingLayout(plan())).polygons.some(item => item.ref === "P1")).toBe(true);
    await callers.owner.masterPlans.unlinkDrawingUnit({ ...plan(), polygonId: polygon.P1 }); unlinked += 1;
    const dropped = await callers.owner.masterPlans.saveDrawingLayout({ ...plan(), polygons: [{ id: polygon.P2, ref: "P2", label: "B1-U-0002", points: square(20, 0) }, { id: polygon.P4, ref: "P4", label: "Extra", points: square(60, 0) }] });
    expect(dropped.polygons.map(item => item.ref).sort()).toEqual(["P2", "P4"]);
    // put P1 back for the link rules below
    polygon.P1 = (await callers.owner.masterPlans.saveDrawingLayout({ ...plan(), polygons: [
      { id: polygon.P2, ref: "P2", label: "B1-U-0002", points: square(20, 0) },
      { id: polygon.P4, ref: "P4", label: "Extra", points: square(60, 0) },
      { ref: "P1", label: "B1-U-0001", points: square(5, 5) },
    ] })).polygons.find(item => item.ref === "P1")!.id;
    await callers.owner.masterPlans.linkDrawingUnit({ ...plan(), polygonId: polygon.P1, entityId: unit.u1 }); linked += 1;
  });

  it("link rules: a unit only, one unit per shape, one shape per unit, a shape of this drawing, and an unlink only of a link that exists", async () => {
    await expect(callers.owner.masterPlans.linkDrawingUnit({ ...plan(), polygonId: polygon.P4, entityId: unit.zone })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_UNIT_NOT_FOUND");
    await expect(callers.owner.masterPlans.linkDrawingUnit({ ...plan(), polygonId: polygon.P1, entityId: unit.u2 })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_LINK_EXISTS");
    await expect(callers.owner.masterPlans.linkDrawingUnit({ ...plan(), polygonId: polygon.P4, entityId: unit.u1 })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_UNIT_ALREADY_LINKED");
    await expect(callers.owner.masterPlans.linkDrawingUnit({ ...plan(), polygonId: NIL, entityId: unit.u2 })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_DRAWING_POLYGON_NOT_FOUND");
    await expect(callers.owner.masterPlans.unlinkDrawingUnit({ ...plan(), polygonId: polygon.P4 })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_LINK_NOT_FOUND");
    await expect(callers.owner.masterPlans.saveDrawingLayout({ ...plan(), polygons: [{ ref: "X", label: "", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] })).rejects.toThrow();
    await expect(callers.owner.masterPlans.saveDrawingLayout({ ...plan(), polygons: [{ ref: "D", label: "", points: square(0, 0) }, { ref: "D", label: "", points: square(9, 9) }] })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_DRAWING_LAYOUT_INVALID");
    await expect(callers.owner.masterPlans.saveDrawingLayout({ ...plan(), polygons: [{ id: NIL, ref: "Q", label: "", points: square(0, 0) }] })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_DRAWING_POLYGON_NOT_FOUND");
  });

  it("every link and every unlink left exactly one audit row, and a refused one left none", async () => {
    const [rows] = await connection.query<{ action: string; n: number }[]>("SELECT action, COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action IN (?, ?) GROUP BY action", [tenantId, "master_plans.drawing_unit_linked", "master_plans.drawing_unit_unlinked"]);
    const seen = new Map(rows.map(row => [row.action, Number(row.n)]));
    expect(seen.get("master_plans.drawing_unit_linked")).toBe(linked);
    expect(seen.get("master_plans.drawing_unit_unlinked")).toBe(unlinked);
    const [detail] = await connection.query<{ entityId: string; metadata: string }[]>("SELECT entityId, metadata FROM audit_logs WHERE tenantId = ? AND action = ?", [tenantId, "master_plans.drawing_unit_linked"]);
    expect(detail.length).toBe(linked);
    for (const row of detail) expect(JSON.parse(row.metadata)).toMatchObject({ projectId, masterPlanVersionId: versionId });
  });

  it("another tenant gets nothing: its owner cannot read, save, link or upload anything of this project", async () => {
    await expect(callers.otherOwner.masterPlans.drawingLayout({ tenantId, projectId, masterPlanVersionId: versionId })).rejects.toThrow();
    await expect(callers.otherOwner.masterPlans.drawingLayout({ tenantId: otherTenantId, projectId, masterPlanVersionId: versionId })).rejects.toThrow();
    await expect(callers.otherOwner.masterPlans.drawingVersions({ tenantId, projectId, masterPlanVersionId: versionId })).rejects.toThrow();
    await expect(callers.otherOwner.masterPlans.saveDrawingLayout({ tenantId, projectId, masterPlanVersionId: versionId, polygons: [] })).rejects.toThrow();
    await expect(callers.otherOwner.masterPlans.linkDrawingUnit({ tenantId, projectId, masterPlanVersionId: versionId, polygonId: polygon.P1, entityId: unit.u2 })).rejects.toThrow();
    await expect(callers.otherOwner.masterPlans.unlinkDrawingUnit({ tenantId, projectId, masterPlanVersionId: versionId, polygonId: polygon.P1 })).rejects.toThrow();
    await expect(callers.stranger.masterPlans.drawingLayout(plan())).rejects.toThrow();
    await expect(callers.otherOwner.masterPlans.uploadDrawingVersion({ tenantId, projectId, masterPlanVersionId: versionId, uploadKey: `uploads/${tenantId}/${projectId}/masterPlanDrawing/pending/x/a.pdf`, fileName: "a.pdf" })).rejects.toThrow();
    // this tenant's owner asks for the other tenant's project under its own company: the project is not within that company, so nothing is returned
    await expect(callers.otherOwner.masterPlans.drawingLayout({ tenantId: otherTenantId, projectId: otherProjectId, masterPlanVersionId: otherVersionId })).rejects.toThrow();
  });

  it("another project of the same tenant gets nothing of this project's drawing", async () => {
    await expect(callers.owner.masterPlans.drawingLayout({ tenantId, projectId: otherProjectId, masterPlanVersionId: versionId })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND");
    await expect(callers.owner.masterPlans.drawingVersions({ tenantId, projectId: otherProjectId, masterPlanVersionId: versionId })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND");
    const other = await callers.owner.masterPlans.drawingLayout({ tenantId, projectId: otherProjectId, masterPlanVersionId: otherVersionId });
    expect(other).toMatchObject({ drawingId: null, polygons: [], links: [] });
    await expect(callers.owner.masterPlans.saveDrawingLayout({ tenantId, projectId: otherProjectId, masterPlanVersionId: versionId, polygons: [] })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND");
    await expect(callers.owner.masterPlans.linkDrawingUnit({ tenantId, projectId: otherProjectId, masterPlanVersionId: versionId, polygonId: polygon.P1, entityId: unit.u2 })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND");
    await expect(callers.owner.masterPlans.unlinkDrawingUnit({ tenantId, projectId: otherProjectId, masterPlanVersionId: versionId, polygonId: polygon.P1 })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND");
    await expect(callers.owner.masterPlans.saveDrawingLayout({ ...plan(), projectId: otherProjectId, polygons: [] })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND");
    // a file uploaded for this project cannot be stored under the other project's version
    const { target } = await uploadDrawing("owner", otherVersionId, DXF, "other.dxf", otherProjectId);
    await expect(callers.owner.masterPlans.uploadDrawingVersion({ tenantId, projectId, masterPlanVersionId: versionId, uploadKey: target.uploadKey, fileName: "other.dxf" })).rejects.toThrow("PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID");
    // the other project's version has its own (empty) drawing: this project's shape cannot be linked there, the refusal comes first
    await expect(callers.owner.masterPlans.linkDrawingUnit({ tenantId, projectId: otherProjectId, masterPlanVersionId: otherVersionId, polygonId: polygon.P1, entityId: unit.u2 })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_DRAWING_NOT_FOUND");
  });

  it("a plan version with no drawing yet has nothing to save into", async () => {
    await expect(callers.owner.masterPlans.saveDrawingLayout({ tenantId, projectId: otherProjectId, masterPlanVersionId: otherVersionId, polygons: [] })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_DRAWING_NOT_FOUND");
  });

  it("a role with only the read permission reads the layout but cannot save, link, unlink or upload", async () => {
    const before = await callers.reader.masterPlans.drawingLayout(plan());
    await expect(callers.reader.masterPlans.saveDrawingLayout({ ...plan(), polygons: [] })).rejects.toThrow(DENIED);
    await expect(callers.reader.masterPlans.linkDrawingUnit({ ...plan(), polygonId: polygon.P4, entityId: unit.u2 })).rejects.toThrow(DENIED);
    await expect(callers.reader.masterPlans.unlinkDrawingUnit({ ...plan(), polygonId: polygon.P1 })).rejects.toThrow(DENIED);
    await expect(callers.reader.directUploads.create({ tenantId, projectId, purpose: "masterPlanDrawing", fileName: "x.dxf", contentType: "application/octet-stream" })).rejects.toThrow(DENIED);
    await expect(callers.reader.masterPlans.uploadDrawingVersion({ tenantId, projectId, masterPlanVersionId: versionId, uploadKey: `uploads/${tenantId}/${projectId}/masterPlanDrawing/pending/x/x.dxf`, fileName: "x.dxf" })).rejects.toThrow(DENIED);
    expect(await callers.reader.masterPlans.drawingLayout(plan())).toEqual(before);
    await expect(callers.stranger.masterPlans.saveDrawingLayout({ ...plan(), polygons: [] })).rejects.toThrow();
  });
});
