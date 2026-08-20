import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tenantId = "e1000000-0000-4000-8000-000000000001";
const ownerOpenId = "pilot-backup-owner";
const roleId = "e1000000-0000-4000-8000-000000000002";
const membershipId = "e1000000-0000-4000-8000-000000000003";
const membershipRoleId = "e1000000-0000-4000-8000-000000000004";
const projectId = "e1000000-0000-4000-8000-000000000005";
const contractId = "e1000000-0000-4000-8000-000000000006";
const auditId = "e1000000-0000-4000-8000-000000000007";
const isIntegrationUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^mysql(?:2)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: Connection;
let ownerId = 0;
let backupDirectory = "";

type BackupSnapshot = {
  company: RowDataPacket[];
  users: RowDataPacket[];
  roles: RowDataPacket[];
  memberships: RowDataPacket[];
  membershipRoles: RowDataPacket[];
  projects: RowDataPacket[];
  contracts: RowDataPacket[];
  auditLogs: RowDataPacket[];
};

async function removePilotFixture() {
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [tenantId]);
  await connection.query("DELETE FROM contracts WHERE projectId = ?", [projectId]);
  await connection.query("DELETE FROM projects WHERE id = ?", [projectId]);
  await connection.query("DELETE FROM membership_roles WHERE membershipId = ?", [membershipId]);
  await connection.query("DELETE FROM memberships WHERE id = ?", [membershipId]);
  await connection.query("DELETE FROM roles WHERE id = ?", [roleId]);
  await connection.query("DELETE FROM companies WHERE id = ?", [tenantId]);
  await connection.query("DELETE FROM users WHERE openId = ?", [ownerOpenId]);
}

describe.skipIf(!isIntegrationUrl(process.env.TEST_DATABASE_URL))("Pilot logical backup and restore", () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for the isolated Pilot restore proof");
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL);
    await removePilotFixture();
    const [owner] = await connection.query<RowDataPacket[]>("INSERT INTO users (openId, name, email, role) VALUES (?, ?, ?, 'admin')", [ownerOpenId, "Pilot Data Owner", "pilot.owner@test.local"]);
    ownerId = owner.insertId;
    await connection.query("INSERT INTO companies (id, legalName, slug, status, defaultLocale) VALUES (?, ?, ?, 'active', 'ar')", [tenantId, "PROJECT OS Pilot Restore Tenant", "project-os-pilot-restore"]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode, description) VALUES (?, ?, 'PILOT_OWNER', 'Pilot Data Owner', 'EXECUTIVE', ?)", [roleId, tenantId, "Owner of the isolated Pilot data fixture"]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status, joinedAt) VALUES (?, ?, ?, 'active', NOW())", [membershipId, tenantId, ownerId]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES (?, ?, ?, 'company')", [membershipRoleId, membershipId, roleId]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, lifecycleStage, status, currency, contractValue, originalBudget, currentBudget) VALUES (?, ?, 'PILOT-RESTORE', 'Pilot restore project', 'infrastructure', 'planning', 'active', 'SAR', 5000000, 4500000, 4600000)", [projectId, tenantId]);
    await connection.query("INSERT INTO contracts (id, tenantId, projectId, code, title, counterparty, contractValue, currency, status) VALUES (?, ?, ?, 'PILOT-CON-001', 'Pilot restoration contract', 'Pilot Contractor', 5000000, 'SAR', 'active')", [contractId, tenantId, projectId]);
    await connection.query("INSERT INTO audit_logs (id, tenantId, actorUserId, action, entityType, entityId, metadata) VALUES (?, ?, ?, 'pilot.backup_fixture_created', 'pilot_fixture', ?, ?)", [auditId, tenantId, ownerId, projectId, JSON.stringify({ projectId, contractId })]);
    backupDirectory = await mkdtemp(join(tmpdir(), "project-os-pilot-backup-"));
  });

  it("writes a tenant-scoped backup artifact, restores it after simulated loss, and proves the owner, roles, records, and audit survive", async () => {
    const [company, users, roles, memberships, membershipRoles, projects, contracts, auditLogs] = await Promise.all([
      connection.query<RowDataPacket[]>("SELECT id, legalName, slug, status, defaultLocale FROM companies WHERE id = ?", [tenantId]).then(([rows]) => rows),
      connection.query<RowDataPacket[]>("SELECT id, openId, name, email, role FROM users WHERE id = ?", [ownerId]).then(([rows]) => rows),
      connection.query<RowDataPacket[]>("SELECT id, tenantId, code, name, productCode, description, systemManaged FROM roles WHERE tenantId = ?", [tenantId]).then(([rows]) => rows),
      connection.query<RowDataPacket[]>("SELECT id, tenantId, userId, status, joinedAt FROM memberships WHERE tenantId = ?", [tenantId]).then(([rows]) => rows),
      connection.query<RowDataPacket[]>("SELECT id, membershipId, roleId, scopeType, scopeId FROM membership_roles WHERE membershipId = ?", [membershipId]).then(([rows]) => rows),
      connection.query<RowDataPacket[]>("SELECT id, tenantId, code, name, projectType, lifecycleStage, status, currency, contractValue, originalBudget, currentBudget FROM projects WHERE tenantId = ?", [tenantId]).then(([rows]) => rows),
      connection.query<RowDataPacket[]>("SELECT id, tenantId, projectId, code, title, counterparty, contractValue, currency, status FROM contracts WHERE tenantId = ?", [tenantId]).then(([rows]) => rows),
      connection.query<RowDataPacket[]>("SELECT id, tenantId, actorUserId, action, entityType, entityId, metadata FROM audit_logs WHERE tenantId = ?", [tenantId]).then(([rows]) => rows),
    ]);
    const snapshot: BackupSnapshot = { company, users, roles, memberships, membershipRoles, projects, contracts, auditLogs };
    const artifactPath = join(backupDirectory, `${tenantId}.json`);
    await writeFile(artifactPath, JSON.stringify(snapshot, null, 2), "utf8");
    const restore = JSON.parse(await readFile(artifactPath, "utf8")) as BackupSnapshot;
    expect(restore).toMatchObject({ company: [{ id: tenantId }], users: [{ openId: ownerOpenId }], roles: [{ code: "PILOT_OWNER" }], projects: [{ code: "PILOT-RESTORE" }], contracts: [{ code: "PILOT-CON-001" }], auditLogs: [{ action: "pilot.backup_fixture_created" }] });

    await removePilotFixture();
    await connection.query("INSERT INTO users (id, openId, name, email, role) VALUES (?, ?, ?, ?, ?)", [restore.users[0].id, restore.users[0].openId, restore.users[0].name, restore.users[0].email, restore.users[0].role]);
    await connection.query("INSERT INTO companies (id, legalName, slug, status, defaultLocale) VALUES (?, ?, ?, ?, ?)", [restore.company[0].id, restore.company[0].legalName, restore.company[0].slug, restore.company[0].status, restore.company[0].defaultLocale]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode, description, systemManaged) VALUES (?, ?, ?, ?, ?, ?, ?)", [restore.roles[0].id, restore.roles[0].tenantId, restore.roles[0].code, restore.roles[0].name, restore.roles[0].productCode, restore.roles[0].description, restore.roles[0].systemManaged]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status, joinedAt) VALUES (?, ?, ?, ?, ?)", [restore.memberships[0].id, restore.memberships[0].tenantId, restore.memberships[0].userId, restore.memberships[0].status, restore.memberships[0].joinedAt]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType, scopeId) VALUES (?, ?, ?, ?, ?)", [restore.membershipRoles[0].id, restore.membershipRoles[0].membershipId, restore.membershipRoles[0].roleId, restore.membershipRoles[0].scopeType, restore.membershipRoles[0].scopeId]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, lifecycleStage, status, currency, contractValue, originalBudget, currentBudget) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [restore.projects[0].id, restore.projects[0].tenantId, restore.projects[0].code, restore.projects[0].name, restore.projects[0].projectType, restore.projects[0].lifecycleStage, restore.projects[0].status, restore.projects[0].currency, restore.projects[0].contractValue, restore.projects[0].originalBudget, restore.projects[0].currentBudget]);
    await connection.query("INSERT INTO contracts (id, tenantId, projectId, code, title, counterparty, contractValue, currency, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [restore.contracts[0].id, restore.contracts[0].tenantId, restore.contracts[0].projectId, restore.contracts[0].code, restore.contracts[0].title, restore.contracts[0].counterparty, restore.contracts[0].contractValue, restore.contracts[0].currency, restore.contracts[0].status]);
    await connection.query("INSERT INTO audit_logs (id, tenantId, actorUserId, action, entityType, entityId, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)", [restore.auditLogs[0].id, restore.auditLogs[0].tenantId, restore.auditLogs[0].actorUserId, restore.auditLogs[0].action, restore.auditLogs[0].entityType, restore.auditLogs[0].entityId, restore.auditLogs[0].metadata]);

    const [proof] = await connection.query<RowDataPacket[]>("SELECT (SELECT COUNT(*) FROM companies WHERE id = ?) AS tenantCount, (SELECT COUNT(*) FROM memberships WHERE tenantId = ? AND userId = ? AND status = 'active') AS ownerMembershipCount, (SELECT COUNT(*) FROM membership_roles WHERE id = ? AND roleId = ?) AS ownerRoleCount, (SELECT COUNT(*) FROM projects WHERE id = ? AND tenantId = ? AND currentBudget = 4600000) AS projectCount, (SELECT COUNT(*) FROM contracts WHERE id = ? AND projectId = ? AND currency = 'SAR') AS contractCount, (SELECT COUNT(*) FROM audit_logs WHERE id = ? AND action = 'pilot.backup_fixture_created') AS auditCount", [tenantId, tenantId, ownerId, membershipRoleId, roleId, projectId, tenantId, contractId, projectId, auditId]);
    expect(proof[0]).toMatchObject({ tenantCount: 1, ownerMembershipCount: 1, ownerRoleCount: 1, projectCount: 1, contractCount: 1, auditCount: 1 });
  }, 12_000);

  afterAll(async () => {
    await removePilotFixture();
    if (backupDirectory) await rm(backupDirectory, { recursive: true, force: true });
    await connection.end();
  });
});
