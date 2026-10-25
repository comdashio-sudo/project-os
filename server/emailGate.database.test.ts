import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Mailer, OutgoingMail } from "./_core/auth/emailCode";
import { getDb } from "./db";
import { flushEmailOutbox } from "./emailNotifications";
import { mailGateConfigFromEnv } from "./emailGate";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Work order 20, items 1 and 9 (owner's decisions 2026-10-25) on a real database: the outbox is flushed through the gate. Synthetic fixtures and a fake sender.
const T = "7b000000-0000-4000-8000-0000000000a1";
let connection: fixtureDb.Connection;
const userIds: number[] = [];
const sent: OutgoingMail[] = [];
const mailer: Mailer = { async send(mail) { sent.push(mail); } };
const config = (extra: Partial<ReturnType<typeof mailGateConfigFromEnv>> = {}) => ({ ...mailGateConfigFromEnv({} as NodeJS.ProcessEnv), dailyLimit: 10, loginReserve: 4, ...extra }); // notifications may send 6 a day

async function clear() {
  await connection.query("DELETE FROM email_outbox WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM memberships WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId LIKE 'gate-%'");
}
async function queue(index: number, kind: "support_escalation" | "approvals_waiting" | "daily_digest", minutesAgo = 0) {
  await connection.query("INSERT INTO email_outbox (id, tenantId, recipientUserId, kind, dedupeKey, subject, bodyText, bodyHtml, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, 't', '<p>t</p>', 'pending', ?)", [`gate-o-${index}-${kind}`, T, userIds[index % userIds.length], kind, `k-${index}-${kind}`, `${kind} ${index}`, new Date(Date.now() - minutesAgo * 60_000)]);
}
const statuses = async () => Object.fromEntries((await connection.query<{ subject: string; status: string }[]>("SELECT subject, status FROM email_outbox WHERE tenantId = ? ORDER BY subject", [T]))[0].map(row => [row.subject, row.status]));

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("the mail gate in front of the outbox", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Gate Co', 'gate-co')", [T]);
    for (const [index, domain] of ["mail.gate.test", "mail.gate.test", "dashio.tasleemsa.com"].entries()) {
      await connection.query("INSERT INTO users (openId, name, email, role) VALUES (?, ?, ?, 'user')", [`gate-${index}`, `gate ${index}`, `gate${index}@${domain}`]);
    }
    const [rows] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId LIKE 'gate-%' ORDER BY openId");
    for (const row of rows) { userIds.push(row.id); await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES (?, ?, ?, 'active')", [`gate-m-${row.id}`, T, row.id]); }
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); });
  beforeEach(async () => { await connection.query("DELETE FROM email_outbox WHERE tenantId = ?", [T]); sent.length = 0; });

  it("sends within the day's notification budget, and what is over WAITS (pending, no attempt spent) instead of being dropped", async () => {
    for (let i = 0; i < 9; i += 1) await queue(i, "daily_digest", 9 - i);
    const db = (await getDb())!;
    const first = await flushEmailOutbox(db, mailer, { gate: config() });
    expect(first).toMatchObject({ sent: 6, deferred: 3, failed: 0 });
    const waiting = (await connection.query<{ attempts: number; status: string }[]>("SELECT attempts, status FROM email_outbox WHERE tenantId = ? AND status = 'pending'", [T]))[0];
    expect(waiting).toHaveLength(3); expect(waiting.every(row => row.attempts === 0)).toBe(true);
    // the same day again: the budget is spent, nothing more goes
    expect(await flushEmailOutbox(db, mailer, { gate: config() })).toMatchObject({ sent: 0, deferred: 3 });
    // tomorrow (a clock a day later): the waiting ones go
    const tomorrow = new Date(Date.now() + 24 * 3_600_000 + 60_000);
    expect(await flushEmailOutbox(db, mailer, { gate: config(), now: tomorrow })).toMatchObject({ sent: 3, deferred: 0 });
    expect(sent).toHaveLength(9);
  });

  it("urgent kinds go first when the budget is short: a support escalation before an approvals reminder before a digest, whatever their age", async () => {
    await queue(0, "daily_digest", 50); await queue(1, "approvals_waiting", 30); await queue(2, "support_escalation", 1);
    for (let i = 3; i < 9; i += 1) await queue(i, "daily_digest", 40 - i);
    await flushEmailOutbox((await getDb())!, mailer, { gate: config() });
    const done = await statuses();
    expect(done["support_escalation 2"]).toBe("sent"); expect(done["approvals_waiting 1"]).toBe("sent");
    expect(Object.values(done).filter(status => status === "sent")).toHaveLength(6);
    expect(Object.values(done).filter(status => status === "pending")).toHaveLength(3);
  });

  it("a larger plan raises the budget: the owner's EMAIL_DAILY_LIMIT and EMAIL_LOGIN_RESERVE decide", async () => {
    for (let i = 0; i < 9; i += 1) await queue(i, "approvals_waiting", 9 - i);
    expect(await flushEmailOutbox((await getDb())!, mailer, { gate: config({ dailyLimit: 3000, loginReserve: 500 }) })).toMatchObject({ sent: 9, deferred: 0 });
  });

  it("NEGATIVE: in production a mail to a reserved domain is never sent (skipped, with the reason); outside production the same address is mailed", async () => {
    await connection.query("UPDATE users SET email = 'someone@corp.invalid' WHERE id = ?", [userIds[0]]);
    await queue(0, "support_escalation");
    const db = (await getDb())!;
    expect(await flushEmailOutbox(db, mailer, { gate: config({ blockReservedDomains: true }) })).toMatchObject({ sent: 0, skipped: 1 });
    expect((await connection.query<{ lastError: string }[]>("SELECT lastError FROM email_outbox WHERE tenantId = ?", [T]))[0][0].lastError).toMatch(/reserved domain/);
    await connection.query("DELETE FROM email_outbox WHERE tenantId = ?", [T]); await queue(0, "support_escalation");
    expect(await flushEmailOutbox(db, mailer, { gate: config({ blockReservedDomains: false }) })).toMatchObject({ sent: 1, skipped: 0 });
    await connection.query("UPDATE users SET email = 'gate0@mail.gate.test' WHERE id = ?", [userIds[0]]);
  });

  it("a runaway minute (20 sent within 60 s) pauses the sending for fifteen minutes, and the waiting mails go afterwards", async () => {
    const stamp = new Date(Date.now() - 5 * 60_000);
    for (let i = 0; i < 20; i += 1) await connection.query("INSERT INTO email_outbox (id, tenantId, recipientUserId, kind, dedupeKey, subject, bodyText, bodyHtml, status, sentAt) VALUES (?, ?, ?, 'daily_digest', ?, 'earlier', 't', 't', 'sent', ?)", [`gate-b-${i}`, T, userIds[0], `b-${i}`, new Date(stamp.getTime() + i * 1000)]);
    await queue(30, "support_escalation");
    const db = (await getDb())!;
    const paused = await flushEmailOutbox(db, mailer, { gate: config({ dailyLimit: 1000, loginReserve: 10 }) });
    expect(paused).toMatchObject({ sent: 0, deferred: 1 }); expect(paused.pausedUntil).toBeInstanceOf(Date);
    expect(sent).toHaveLength(0);
    const later = new Date(Date.now() + 11 * 60_000); // 16 minutes after the burst
    expect(await flushEmailOutbox(db, mailer, { gate: config({ dailyLimit: 1000, loginReserve: 10 }), now: later })).toMatchObject({ sent: 1, pausedUntil: null });
  });
});
