import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-28 (P-117): the safety register — incidents (recorded, investigated, closed with the corrective action), permits to work (issued for a window, expired
// when still active past it, closed or cancelled with a note), and LTIFR / TRIR over the man-hours of the APPROVED daily reports, counted per report.
// Writers hold project.hse.manage, readers project.read; another company sees and changes nothing; every refusal writes nothing. Real database, real router,
// restricted application role. Synthetic data only.
const SLUG = "q28-safety";
const SLUG_B = "q28-safety-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const P = "28a00000-0000-4000-8000-000000000001";
const PB = "28b00000-0000-4000-8000-000000000001";
const COMPANY = "28a00000-0000-4000-8000-0000000000c1";
const ROLE = "28a00000-0000-4000-8000-0000000000d1";
const KEYS = ["owner", "hse", "viewer", "keeper", "ownerB"] as const; type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q28-${key}`, name: `Q28 ${key}`, email: `q28-${key}@q28.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = "";
const scope = () => ({ tenantId, projectId: P });

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["safety_incidents", "work_permits", "site_daily_report_labour", "site_daily_reports", "project_labour_roles", "project_companies", "audit_logs"]) await connection.query(`DELETE FROM ${table} WHERE tenant_id = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
      await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q28-%'");
}
const roleId = async (tenant: string, roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenant, roleCode]))[0][0]!.id;
const writes = async () => (await connection.query<{ n: number }[]>("SELECT (SELECT count(*) FROM safety_incidents WHERE tenant_id = ?) + (SELECT count(*) FROM work_permits WHERE tenant_id = ?) + (SELECT count(*) FROM audit_logs WHERE tenant_id = ? AND action LIKE 'hse.%') AS n", [tenantId, tenantId, tenantId]))[0][0].n;
const incident = (number: string, kind: string, extra: Record<string, unknown> = {}) => callerFor("hse").safety.recordIncident({ ...scope(), incidentNumber: number, occurredOn: "2026-11-03", kind: kind as "near_miss", title: `Incident ${number} (synthetic)`, description: "Synthetic description", ...extra });
const hour = (iso: string) => new Date(iso);

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-28 (P-117): the safety register — incidents, permits to work, LTIFR and TRIR", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q28-${key}`, `Q28 ${key}`, `q28-${key}@q28.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q28-%'");
    for (const key of KEYS) ids[key] = rows.find(item => item.openId === `q28-${key}`)!.id;
    const owner = callerFor("owner");
    ({ tenantId } = await owner.tenant.create({ legalName: "Q28 Safety Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q28 Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q28-1', 'One', 'villas', 'SAR', 'active'), (?, ?, 'Q28-B', 'Other', 'villas', 'SAR', 'active')", [P, tenantId, PB, tenantB]);
    await owner.tenant.administration({ tenantId });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.hse, roleId: await roleId(tenantId, "HSE_MANAGER"), scopeType: "project", scopeId: P });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.viewer, roleId: await roleId(tenantId, "MANAGEMENT_VIEWER"), scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.keeper, roleId: await roleId(tenantId, "WAREHOUSE_CUSTODIAN"), scopeType: "project", scopeId: P });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    // man-hours: two APPROVED reports on the same day (50 people × 10 h, and 20 people with no hours anywhere) and a DRAFT one (not counted)
    await connection.query("INSERT INTO project_companies (id, tenant_id, project_id, name, role) VALUES (?, ?, ?, 'Example Main Contractor', 'main')", [COMPANY, tenantId, P]);
    await connection.query("INSERT INTO project_labour_roles (id, tenant_id, project_id, name, category) VALUES (?, ?, ?, 'Mason', 'direct')", [ROLE, tenantId, P]);
    const reports: Array<[string, Key, string, number | null, number]> = [["28a00000-0000-4000-8000-0000000000e1", "owner", "approved", 10, 50], ["28a00000-0000-4000-8000-0000000000e2", "hse", "approved", null, 20], ["28a00000-0000-4000-8000-0000000000e3", "viewer", "draft", 10, 100]];
    for (const [id, by, status, hours, headcount] of reports) {
      await connection.query("INSERT INTO site_daily_reports (id, tenant_id, project_id, report_date, prepared_by_user_id, status, work_hours) VALUES (?, ?, ?, '2026-11-02', ?, ?, ?)", [id, tenantId, P, ids[by], status, hours]);
      await connection.query("INSERT INTO site_daily_report_labour (id, tenant_id, project_id, report_id, company_id, labour_role_id, shift, headcount) VALUES (?, ?, ?, ?, ?, ?, 'day', ?)", [crypto.randomUUID(), tenantId, P, id, COMPANY, ROLE, headcount]);
    }
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: LTIFR and TRIR from the approved reports, counted per report — 500 man-hours, 1 lost-time and 2 recordable → LTIFR 2000, TRIR 800", async () => {
    await incident("I-01", "lost_time", { lostDays: 3, peopleInvolved: 1 });
    await incident("I-02", "medical_treatment");
    await incident("I-03", "near_miss");
    const { rates, incidents } = await callerFor("viewer").safety.register(scope());
    expect(rates).toMatchObject({ manHours: 500, daysWithoutHours: 1, reports: 2, lostTime: 1, recordable: 2, ltifr: 2000, trir: 800 });
    expect(incidents.map(item => item.incidentNumber).sort()).toEqual(["I-01", "I-02", "I-03"]);
    // a period that holds none of them: no incidents, the same man-hours stay out too
    expect((await callerFor("viewer").safety.register({ ...scope(), from: "2026-11-05", to: "2026-11-06" })).rates).toMatchObject({ manHours: 0, ltifr: null, trir: null, lostTime: 0 });
  });

  it("POSITIVE: an incident is investigated, then closed only with its corrective action; each step writes an audit row", async () => {
    const { id } = await incident("I-10", "first_aid");
    expect(await code(callerFor("hse").safety.updateIncident({ ...scope(), incidentId: id, status: "investigating", rootCause: "Missing guard (synthetic)" }))).toBe("no error");
    const before = await writes();
    expect(await code(callerFor("hse").safety.updateIncident({ ...scope(), incidentId: id, status: "closed" }))).toBe("PROJECT_OS_SAFETY_CORRECTIVE_ACTION_REQUIRED");
    expect(await writes()).toBe(before);
    expect(await code(callerFor("hse").safety.updateIncident({ ...scope(), incidentId: id, status: "closed", correctiveAction: "Guard fitted (synthetic)" }))).toBe("no error");
    expect(await code(callerFor("hse").safety.updateIncident({ ...scope(), incidentId: id, correctiveAction: "Changed later" }))).toBe("PROJECT_OS_SAFETY_INCIDENT_CLOSED");
    const [audit] = await connection.query<{ action: string }[]>("SELECT action FROM audit_logs WHERE tenant_id = ? AND entity_id = ? ORDER BY created_at", [tenantId, id]);
    expect(audit.map(row => row.action)).toEqual(["hse.incident_recorded", "hse.incident_updated", "hse.incident_closed"]);
  });

  it("NEGATIVE: a future date, lost days on a near miss, a repeated number — all refused with nothing written", async () => {
    const before = await writes();
    expect(await code(incident("I-20", "near_miss", { occurredOn: "2099-01-01" }))).toBe("PROJECT_OS_SAFETY_DATE_IN_FUTURE");
    expect(await code(incident("I-21", "near_miss", { lostDays: 2 }))).toBe("PROJECT_OS_SAFETY_LOST_DAYS_INVALID");
    expect(await code(incident("I-01", "near_miss"))).toBe("PROJECT_OS_SAFETY_NUMBER_EXISTS");
    expect(await writes()).toBe(before);
  });

  it("PERMITS: issued for a window; active past its end reads «expired»; closed with a note, and a closed one is not closed again; a backwards window is refused", async () => {
    const past = await callerFor("hse").safety.issuePermit({ ...scope(), permitNumber: "PTW-1", permitType: "hot_work", description: "Welding at block A (synthetic)", validFrom: hour("2026-11-01T06:00:00Z"), validTo: hour("2026-11-01T14:00:00Z") });
    const future = await callerFor("hse").safety.issuePermit({ ...scope(), permitNumber: "PTW-2", permitType: "work_at_height", description: "Scaffold at block B (synthetic)", validFrom: hour("2099-01-01T06:00:00Z"), validTo: hour("2099-01-01T14:00:00Z") });
    const states = Object.fromEntries((await callerFor("viewer").safety.register(scope())).permits.map(permit => [permit.permitNumber, permit.state]));
    expect(states).toEqual({ "PTW-1": "expired", "PTW-2": "not_started" });
    const before = await writes();
    expect(await code(callerFor("hse").safety.issuePermit({ ...scope(), permitNumber: "PTW-3", permitType: "excavation", description: "Trench (synthetic)", validFrom: hour("2026-11-02T14:00:00Z"), validTo: hour("2026-11-02T06:00:00Z") }))).toBe("PROJECT_OS_SAFETY_PERMIT_WINDOW_INVALID");
    expect(await code(callerFor("hse").safety.issuePermit({ ...scope(), permitNumber: "PTW-1", permitType: "excavation", description: "Trench (synthetic)", validFrom: hour("2026-11-02T06:00:00Z"), validTo: hour("2026-11-02T14:00:00Z") }))).toBe("PROJECT_OS_SAFETY_NUMBER_EXISTS");
    expect(await writes()).toBe(before);
    expect(await code(callerFor("hse").safety.closePermit({ ...scope(), permitId: past.id, outcome: "closed", note: "Work finished, area clear" }))).toBe("no error");
    expect(await code(callerFor("hse").safety.closePermit({ ...scope(), permitId: past.id, outcome: "cancelled", note: "Again" }))).toBe("PROJECT_OS_SAFETY_PERMIT_CLOSED");
    expect(await code(callerFor("hse").safety.closePermit({ ...scope(), permitId: future.id, outcome: "cancelled", note: "Plan changed" }))).toBe("no error");
    const after = Object.fromEntries((await callerFor("viewer").safety.register(scope())).permits.map(permit => [permit.permitNumber, permit.state]));
    expect(after).toEqual({ "PTW-1": "closed", "PTW-2": "cancelled" });
  });

  it("PERMISSIONS: the reader reads and does not write; a role with neither reads nothing; nothing is written", async () => {
    const before = await writes();
    expect((await callerFor("viewer").safety.register(scope())).incidents.length).toBeGreaterThan(0);
    expect(await code(callerFor("viewer").safety.recordIncident({ ...scope(), incidentNumber: "I-30", occurredOn: "2026-11-03", kind: "near_miss", title: "Viewer tries", description: "No" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("keeper").safety.register(scope()))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("keeper").safety.issuePermit({ ...scope(), permitNumber: "PTW-9", permitType: "other", description: "No", validFrom: hour("2026-11-03T06:00:00Z"), validTo: hour("2026-11-03T07:00:00Z") }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await writes()).toBe(before);
  });

  it("ISOLATION: another company reads nothing and changes nothing of this project; its own register is empty", async () => {
    const [[row]] = await connection.query<{ id: string }[]>("SELECT id FROM safety_incidents WHERE tenant_id = ? AND incident_number = 'I-02'", [tenantId]);
    const before = await writes();
    expect(await code(callerFor("ownerB").safety.register(scope()))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callerFor("ownerB").safety.updateIncident({ ...scope(), incidentId: row!.id, status: "investigating" }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callerFor("ownerB").safety.updateIncident({ tenantId: tenantB, projectId: PB, incidentId: row!.id, status: "investigating" }))).toBe("PROJECT_OS_SAFETY_INCIDENT_NOT_FOUND");
    expect(await code(callerFor("ownerB").safety.register({ tenantId: tenantB, projectId: P }))).toBe("PROJECT_OS_PROJECT_NOT_FOUND");
    const own = await callerFor("ownerB").safety.register({ tenantId: tenantB, projectId: PB });
    expect([own.incidents.length, own.permits.length, own.rates.manHours]).toEqual([0, 0, 0]);
    expect(await writes()).toBe(before);
  });
});
