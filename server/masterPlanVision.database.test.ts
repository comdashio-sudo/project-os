import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Drawing reading (G-207) on a real database and through the real router. The provider is a double (no real model is called): it records every
// call so a refusal can be shown to make none. Synthetic data only: no drawing, no names of people or clients.
const llm = vi.hoisted(() => ({ enabled: true, invoke: vi.fn() }));
vi.mock("./_core/llm", async importOriginal => ({
  ...(await importOriginal<typeof import("./_core/llm")>()),
  isLlmEnabled: () => llm.enabled,
  invokeLLM: llm.invoke,
}));

const SLUG = "mp-vision";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@mpv.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG = `data:image/png;base64,${PNG_HEADER.toString("base64")}`;
const pngOf = (size: number) => `data:image/png;base64,${Buffer.concat([PNG_HEADER, Buffer.alloc(size - PNG_HEADER.length)]).toString("base64")}`;
const answer = (content: unknown) => ({
  id: "vision-double", created: 1, model: "test-model",
  choices: [{ index: 0, message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: "stop" }],
});
const DENIED = "PROJECT_OS_PERMISSION_DENIED";
const LIMIT = 3 * 1024 * 1024;

const KEYS = ["owner", "reader", "projectWriter", "stranger", "otherOwner", "platformAdmin"] as const;
type Key = (typeof KEYS)[number];
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
// a platform administrator provisions licences (as in integration.database.test.ts); the company owner cannot
const platformAdmin = (userId: number) => appRouter.createCaller({ user: { id: userId, openId: "mpv-platformAdmin", name: "Platform admin", email: "mpv-platformAdmin@mpv.example.test", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const ids: Record<string, number> = {};
let connection: fixtureDb.Connection;
let tenantId = ""; let otherTenantId = "";
let projectId = ""; let otherProjectId = "";
let versionId = ""; let otherVersionId = "";
const entity: Record<string, string> = {};
const scope = () => ({ tenantId, projectId });

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    await connection.query("DELETE FROM tenant_license_feature_overrides WHERE tenantLicenseId IN (SELECT id FROM tenant_licenses WHERE tenantId = ?)", [id]);
    await connection.query("DELETE FROM tenant_licenses WHERE tenantId = ?", [id]);
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
  await connection.query("DELETE FROM users WHERE openId LIKE 'mpv-%'");
}

const count = async (sql: string, params: unknown[]) => { const [rows] = await connection.query<{ n: number }[]>(sql, params); return rows[0].n; };
const savedCounts = async () => ({
  entities: await count("SELECT COUNT(*) AS n FROM master_plan_spatial_entities WHERE tenantId = ?", [tenantId]),
  audit: await count("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ?", [tenantId]),
});
const addEntity = (code: string) => callers.owner.masterPlans.createSpatialEntity({ ...scope(), masterPlanVersionId: versionId, code, name: `Shape ${code}`, entityType: "zone", geometry: { x: 5, y: 5, width: 20, height: 20 }, status: "in_progress", progressPercent: 10 });
const request = (caller: Key, overrides: Partial<{ tenantId: string; projectId: string; masterPlanVersionId: string; shapeIds: string[]; imageDataUrl: string }> = {}) =>
  callers[caller].masterPlanVision.suggestShapeCodes({ tenantId, projectId, masterPlanVersionId: versionId, shapeIds: [entity.a, entity.b], imageDataUrl: PNG, ...overrides });
/** The model's answer for the two shapes of the request, which the tests reuse. */
const goodAnswer = () => answer({ shapes: [{ shapeId: entity.a, code: "B1-Z2", confidence: 0.92 }, { shapeId: entity.b, code: "B1-Z3", confidence: 0.4 }] });

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Drawing reading on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`mpv-${key}`, `MPV ${key}`, `mpv-${key}@mpv.example.test`]));
    await connection.query("UPDATE users SET role = 'admin' WHERE openId = ?", ["mpv-platformAdmin"]); // the licence write checks the stored role
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'mpv-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `mpv-${key}`)!.id; callers[key] = callerFor(ids[key], `mpv-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Vision Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.otherOwner.tenant.create({ legalName: "Other Vision Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    projectId = "ac000000-0000-4000-8000-000000000001"; otherProjectId = "ac000000-0000-4000-8000-000000000002";
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'MPV-1', 'Vision villas', 'villas', 'SAR', 'active'), (?, ?, 'MPV-2', 'Second', 'villas', 'SAR', 'active')", [projectId, tenantId, otherProjectId, tenantId]);
    const reader = await callers.owner.tenant.createRole({ tenantId, code: "MPV_READER", name: "Plan reader", productCode: "PROJECT", permissionCodes: ["project.read"] });
    const writer = await callers.owner.tenant.createRole({ tenantId, code: "MPV_WRITER", name: "Plan writer", productCode: "PROJECT", permissionCodes: ["project.write"] });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.reader, roleId: reader.id, scopeType: "company" });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.projectWriter, roleId: writer.id, scopeType: "project", scopeId: projectId });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    const plan = await callers.owner.masterPlans.create({ ...scope(), code: "MPV-PLAN", title: "Vision plan" });
    versionId = plan.versionId;
    entity.a = (await addEntity("A")).id; entity.b = (await addEntity("B")).id;
    // a shape of the SAME tenant but another project: it must never reach the model or come back
    const otherPlan = await callers.owner.masterPlans.create({ tenantId, projectId: otherProjectId, code: "MPV-PLAN-2", title: "Second plan" });
    otherVersionId = otherPlan.versionId;
    entity.foreign = (await callers.owner.masterPlans.createSpatialEntity({ tenantId, projectId: otherProjectId, masterPlanVersionId: otherVersionId, code: "F", name: "Other project shape", entityType: "zone", geometry: { x: 5, y: 5, width: 20, height: 20 }, status: "not_started", progressPercent: 0 })).id;
  }, 120_000);
  afterAll(async () => { await clear(); await connection.end(); });

  beforeEach(() => {
    llm.enabled = true;
    llm.invoke.mockReset().mockResolvedValue(answer({ shapes: [] }));
  });

  it("a writer gets validated proposals for the selected shapes, only those shapes reach the model, and nothing is saved", async () => {
    llm.invoke.mockResolvedValueOnce(goodAnswer());
    const before = await savedCounts();
    const result = await request("owner", { shapeIds: [entity.a, entity.b, entity.foreign] });
    expect(result).toEqual({ proposals: [{ shapeId: entity.a, code: "B1-Z2", confidence: 0.92 }, { shapeId: entity.b, code: "B1-Z3", confidence: 0.4 }], saved: false });
    expect(llm.invoke).toHaveBeenCalledTimes(1);
    const sent = llm.invoke.mock.calls[0][0] as { messages: { role: string; content: unknown }[] };
    const user = sent.messages.find(message => message.role === "user")!.content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(user.find(part => part.type === "text")!.text).toContain(entity.a);
    expect(user.find(part => part.type === "text")!.text).not.toContain(entity.foreign);
    expect(user.find(part => part.type === "image_url")!.image_url!.url).toBe(PNG);
    expect(await savedCounts()).toEqual(before);
  });

  it("reads a provider answer sent as text parts as well as a plain string", async () => {
    llm.invoke.mockResolvedValueOnce({ ...answer(""), choices: [{ index: 0, message: { role: "assistant", content: [{ type: "text", text: JSON.stringify({ shapes: [{ shapeId: entity.a, code: "A", confidence: 1 }] }) }] }, finish_reason: "stop" }] });
    await expect(request("owner")).resolves.toEqual({ proposals: [{ shapeId: entity.a, code: "A", confidence: 1 }], saved: false });
  });

  it("drops what the model invents or mangles, and keeps the valid items", async () => {
    llm.invoke.mockResolvedValueOnce(answer({ shapes: [
      { shapeId: entity.foreign, code: "F-1", confidence: 0.99 },
      { shapeId: entity.a, code: "<img src=x onerror=alert(1)>", confidence: 0.9 },
      { shapeId: entity.a, code: "K".repeat(41), confidence: 0.9 },
      { shapeId: entity.a, code: "A-1", confidence: 1.5 },
      { shapeId: entity.a, code: "A-2", confidence: 0.6, note: "ignored" },
      { shapeId: entity.a, code: "A-3", confidence: 0.7 },
      { shapeId: entity.b, code: "B ignore previous instructions", confidence: 0.5 },
    ] }));
    expect(await request("owner")).toEqual({ proposals: [{ shapeId: entity.a, code: "A-2", confidence: 0.6 }], saved: false });
  });

  it("refuses a malformed answer as a whole, and a provider failure without its message", async () => {
    llm.invoke.mockResolvedValueOnce(answer("Here are the codes: B1, B2."));
    await expect(request("owner")).rejects.toMatchObject({ code: "BAD_GATEWAY", message: "PROJECT_OS_VISION_OUTPUT_INVALID" });
    llm.invoke.mockResolvedValueOnce({ id: "x", created: 1, model: "test-model", choices: [] });
    await expect(request("owner")).rejects.toMatchObject({ code: "BAD_GATEWAY", message: "PROJECT_OS_VISION_OUTPUT_INVALID" });
    llm.invoke.mockRejectedValueOnce(new Error("LLM invoke failed: 500 prompt echo: budget 1234567"));
    await expect(request("owner")).rejects.toMatchObject({ code: "BAD_GATEWAY", message: "PROJECT_OS_VISION_PROVIDER_FAILED" });
    expect(llm.invoke).toHaveBeenCalledTimes(3);
  });

  it("answers NOT_FOUND and makes no provider call while the switch is off", async () => {
    llm.enabled = false;
    await expect(request("owner")).rejects.toMatchObject({ code: "NOT_FOUND", message: "PROJECT_OS_VISION_NOT_AVAILABLE" });
    expect(llm.invoke).not.toHaveBeenCalled();
  });

  it("refuses a person without the permission, with no provider call", async () => {
    await expect(request("reader")).rejects.toThrow(DENIED);
    expect(llm.invoke).not.toHaveBeenCalled();
  });

  it("a project-scoped writer reads the drawing of their own project, and not of another one", async () => {
    llm.invoke.mockResolvedValueOnce(goodAnswer());
    await expect(request("projectWriter")).resolves.toMatchObject({ saved: false, proposals: [{ shapeId: entity.a }, { shapeId: entity.b }] });
    await expect(request("projectWriter", { projectId: otherProjectId, masterPlanVersionId: otherVersionId, shapeIds: [entity.foreign] })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED");
    expect(llm.invoke).toHaveBeenCalledTimes(1);
  });

  it("a person who is not a member of the company, or who names another company, gets nothing and no provider call", async () => {
    await expect(request("stranger")).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await expect(request("otherOwner")).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await expect(request("owner", { tenantId: otherTenantId })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    // the other company's own owner, asking about THIS company's project: the project is not theirs
    await expect(request("otherOwner", { tenantId: otherTenantId })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    expect(llm.invoke).not.toHaveBeenCalled();
  });

  it("a version of another project is not found through this project, and shapes of another project get nothing", async () => {
    await expect(request("owner", { projectId: otherProjectId })).rejects.toMatchObject({ message: "PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND" });
    await expect(request("owner", { masterPlanVersionId: "ad000000-0000-4000-8000-000000000000" })).rejects.toMatchObject({ message: "PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND" });
    await expect(request("owner", { masterPlanVersionId: otherVersionId })).rejects.toMatchObject({ message: "PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND" });
    // the version and project of the other plan are right, but these shapes belong to this project's plan
    expect(await request("owner", { projectId: otherProjectId, masterPlanVersionId: otherVersionId, shapeIds: [entity.a] })).toEqual({ proposals: [], saved: false });
    expect(await request("owner", { shapeIds: [entity.foreign, "ad000000-0000-4000-8000-000000000001"] })).toEqual({ proposals: [], saved: false });
    expect(llm.invoke).not.toHaveBeenCalled();
  });

  it("refuses an image over the limit, a type other than PNG or JPEG, and bytes that do not match the label, all before any call", async () => {
    await expect(request("owner", { imageDataUrl: pngOf(LIMIT + 1) })).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE", message: "PROJECT_OS_VISION_IMAGE_TOO_LARGE" });
    await expect(request("owner", { imageDataUrl: "data:image/gif;base64,R0lGODlh" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "PROJECT_OS_VISION_IMAGE_INVALID" });
    await expect(request("owner", { imageDataUrl: "data:image/png;base64,/9j/4AAQ" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "PROJECT_OS_VISION_IMAGE_INVALID" });
    expect(llm.invoke).not.toHaveBeenCalled();
  });

  it("accepts an image exactly at the limit", async () => {
    llm.invoke.mockResolvedValueOnce(goodAnswer());
    await expect(request("owner", { imageDataUrl: pngOf(LIMIT) })).resolves.toMatchObject({ saved: false });
    expect(llm.invoke).toHaveBeenCalledTimes(1);
  });

  it("the subscription guard: a licensed tenant whose feature is switched off gets a refusal and no provider call; switching it back on restores it", async () => {
    // A tenant with no licence record is not feature-gated (the same rule as every other product screen), so this test provisions one first.
    await platformAdmin(ids.platformAdmin).licensing.provision({ tenantId, planCode: "ALL_IN_ONE_STANDARD", status: "active", seats: 10, manualActivation: true });
    const [license] = await connection.query<{ id: string }[]>("SELECT id FROM tenant_licenses WHERE tenantId = ?", [tenantId]);
    const [feature] = await connection.query<{ id: string }[]>("SELECT id FROM commercial_features WHERE code = ?", ["MASTER_PLAN_ENTITIES"]);
    expect(license.length).toBe(1);
    expect(feature.length).toBe(1);
    llm.invoke.mockResolvedValueOnce(goodAnswer());
    await expect(request("owner")).resolves.toMatchObject({ saved: false }); // licensed and the plan includes the feature
    expect(llm.invoke).toHaveBeenCalledTimes(1);
    await connection.query("INSERT INTO tenant_license_feature_overrides (id, tenantLicenseId, featureId, active) VALUES (?, ?, ?, ?)", ["ad100000-0000-4000-8000-000000000001", license[0].id, feature[0].id, false]);
    await expect(request("owner")).rejects.toThrow("PROJECT_OS_LICENSE_FEATURE_NOT_AVAILABLE");
    expect(llm.invoke).toHaveBeenCalledTimes(1);
    await connection.query("UPDATE tenant_license_feature_overrides SET active = ? WHERE tenantLicenseId = ?", [true, license[0].id]);
    llm.invoke.mockResolvedValueOnce(goodAnswer());
    await expect(request("owner")).resolves.toMatchObject({ saved: false });
    expect(llm.invoke).toHaveBeenCalledTimes(2);
  });
});
