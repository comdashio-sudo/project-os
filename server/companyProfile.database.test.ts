import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { ENV } from "./_core/env";

// Q-12 part 1 on a real database, through the real router, as the restricted application role: the owner of a company reads and edits its details
// (tenant.profile / tenant.updateProfile) and the change is audited; the owner of ANOTHER company, and a member of the same company without tenant.manage,
// are refused and change nothing. A person with two companies sees both in tenant.mine (the switcher's source). Synthetic data only.
const SLUG = "q12-profile";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@q12.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const KEYS = ["owner", "member", "outsider"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection;
let tenantId = ""; let secondTenantId = ""; let otherTenantId = "";
const nameOf = async (id: string) => ((await connection.query<{ legalName: string }[]>("SELECT legalName FROM companies WHERE id = ?", [id]))[0] as Array<{ legalName: string }>)[0].legalName;

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug LIKE ?", [`${SLUG}%`]);
  for (const { id } of companies) {
    for (const table of ["audit_logs", "membership_invitations", "stored_files"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q12-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("a company's own details: edited by its managers only (Q-12 part 1)", () => {
  beforeAll(async () => {
    if (ENV.cookieSecret.length < 16) (ENV as { cookieSecret: string }).cookieSecret = "company-logo-test-secret-0123456789"; // signed links need it
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q12-${key}`, `Q12 ${key}`, `q12-${key}@q12.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q12-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `q12-${key}`)!.id; callers[key] = callerFor(ids[key], `q12-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Q12 First Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: secondTenantId } = await callers.owner.tenant.create({ legalName: "Q12 Second Co.", slug: `${SLUG}-second`, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.outsider.tenant.create({ legalName: "Q12 Other Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    // a member of the first company who holds no role at all (so no tenant.manage)
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES (?, ?, ?, 'active')", [crypto.randomUUID(), tenantId, ids.member]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("one person, two companies: both are listed for the switcher, the other person's company is not", async () => {
    const mine = (await callers.owner.tenant.mine()).map(item => item.tenantId).sort();
    expect(mine).toEqual([tenantId, secondTenantId].sort());
    expect((await callers.outsider.tenant.mine()).map(item => item.tenantId)).toEqual([otherTenantId]);
  });

  it("the owner reads and edits the details; the change is written and audited", async () => {
    expect(await callers.owner.tenant.profile({ tenantId })).toMatchObject({ legalName: "Q12 First Co.", slug: SLUG, defaultLocale: "ar" });
    expect(await callers.owner.tenant.updateProfile({ tenantId, legalName: "Q12 Renamed Co.", defaultLocale: "en" })).toMatchObject({ legalName: "Q12 Renamed Co.", defaultLocale: "en" });
    expect(await nameOf(tenantId)).toBe("Q12 Renamed Co.");
    const [audit] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'tenant.profile_updated'", [tenantId]);
    expect(Number((audit as Array<{ n: number }>)[0].n)).toBe(1);
    expect(await nameOf(secondTenantId)).toBe("Q12 Second Co."); // the owner's other company is untouched
  });

  it("the owner of another company is refused on read and write, and nothing changes", async () => {
    expect(await code(callers.outsider.tenant.profile({ tenantId }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.outsider.tenant.updateProfile({ tenantId, legalName: "Taken Over", defaultLocale: "ar" }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.owner.tenant.updateProfile({ tenantId: otherTenantId, legalName: "Taken Over", defaultLocale: "ar" }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await nameOf(tenantId)).toBe("Q12 Renamed Co.");
    expect(await nameOf(otherTenantId)).toBe("Q12 Other Co.");
  });

  it("a member without tenant.manage is refused, and nothing changes", async () => {
    expect(await code(callers.member.tenant.profile({ tenantId }))).not.toBe("no error");
    expect(await code(callers.member.tenant.updateProfile({ tenantId, legalName: "Member Rename", defaultLocale: "ar" }))).not.toBe("no error");
    expect(await nameOf(tenantId)).toBe("Q12 Renamed Co.");
  });

  // Q-12 part 1 (b): the company logo. The browser's PUT is stood in for by writing the bytes at exactly the key the server issued, as the upload route does
  // (the route itself is proven in dbStorage.database.test.ts).
  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a0a6a1a20000000049454e44ae426082", "hex");
    const logoKey = async (id: string) => ((await connection.query<{ logoKey: string | null }[]>("SELECT logo_key AS \"logoKey\" FROM companies WHERE id = ?", [id]))[0] as Array<{ logoKey: string | null }>)[0].logoKey;
  const issue = async (caller: (typeof callers)[Key], id: string, bytes: Buffer, type: string) => { const upload = await caller.tenant.createLogoUpload({ tenantId: id, fileName: "logo", contentType: type }); await connection.query("INSERT INTO stored_files (id, tenant_id, key, content_type, size, data) VALUES (?, ?, ?, ?, ?, ?)", [crypto.randomUUID(), id, upload.uploadKey, type, bytes.length, bytes]); return upload.uploadKey; };

  it("the owner uploads a logo: stored under the company, shown through a signed link, then removed", async () => {
    const uploadKey = await issue(callers.owner, tenantId, PNG, "image/png");
    expect(uploadKey.startsWith(`uploads/${tenantId}/company/logo/pending/`)).toBe(true);
    const saved = await callers.owner.tenant.updateProfile({ tenantId, legalName: "Q12 Renamed Co.", defaultLocale: "en", logo: { uploadKey } });
    expect(saved.logo?.url).toBeTruthy();
    const stored = await logoKey(tenantId);
    expect(stored?.startsWith(`uploads/${tenantId}/company/logo/`) && !stored.includes("/pending/")).toBe(true);
    expect((await callers.owner.tenant.profile({ tenantId })).logo?.url).toBeTruthy();
    // a save that leaves the logo out keeps it
    await callers.owner.tenant.updateProfile({ tenantId, legalName: "Q12 Renamed Co.", defaultLocale: "en" });
    expect(await logoKey(tenantId)).not.toBeNull();
    await callers.owner.tenant.updateProfile({ tenantId, legalName: "Q12 Renamed Co.", defaultLocale: "en", logo: null });
    expect(await logoKey(tenantId)).toBeNull();
  });

  it("NEGATIVE: a logo upload is refused to another company's owner and to a member; one company's upload cannot become another's logo; a scripted SVG is refused", async () => {
    expect(await code(callers.outsider.tenant.createLogoUpload({ tenantId, fileName: "x.png", contentType: "image/png" }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.member.tenant.createLogoUpload({ tenantId, fileName: "x.png", contentType: "image/png" }))).not.toBe("no error");
    expect(await code(callers.owner.tenant.createLogoUpload({ tenantId, fileName: "x.pdf", contentType: "application/pdf" }))).toBe("PROJECT_OS_UPLOAD_TYPE_INVALID");
    // the outsider takes an upload issued for ITS company and offers it as the first company's logo: the outsider is refused before the key is read
    const foreign = await issue(callers.outsider, otherTenantId, PNG, "image/png");
    expect(await code(callers.outsider.tenant.updateProfile({ tenantId, legalName: "Taken Over", defaultLocale: "ar", logo: { uploadKey: foreign } }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    // and the first company's owner cannot adopt the other company's pending upload either
    expect(await code(callers.owner.tenant.updateProfile({ tenantId, legalName: "Q12 Renamed Co.", defaultLocale: "en", logo: { uploadKey: foreign } }))).toBe("PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID");
    const scripted = await issue(callers.owner, tenantId, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "image/svg+xml");
    expect(await code(callers.owner.tenant.updateProfile({ tenantId, legalName: "Q12 Renamed Co.", defaultLocale: "en", logo: { uploadKey: scripted } }))).toBe("PROJECT_OS_PROJECT_LOGO_UNSAFE");
    expect(await logoKey(tenantId)).toBeNull();
    expect(await nameOf(tenantId)).toBe("Q12 Renamed Co.");
  });
});
