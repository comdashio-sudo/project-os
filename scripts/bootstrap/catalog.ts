// The launch button's catalogue phase: plant the plan catalogue in production and read back the two facts the first sign-in needs.
//   1. the plans: the seven default plans, their features and the plan-feature links (catalogue data only -- no company, user, project, price or payment).
//      Re-running changes nothing: every row is inserted only when absent, so a plan the platform administrator switched off later stays off.
//   2. the platform owner: the account whose address is OWNER_EMAIL must hold the platform-administrator role (users.role = 'admin'). The application assigns it at every sign-in
//      from the OWNER_EMAIL variable; this reads the row to PROVE it, and corrects a row that disagrees (it only ever touches that one account).
import { randomUUID } from "node:crypto";
import { defaultCommercialFeatures, defaultCommercialPlans, defaultPlanFeaturePairs } from "../../server/domain/commercialCatalog.ts";
import { openIdForEmail } from "../../server/_core/auth/emailCode.ts";

export type SqlClient = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };

export type CatalogReport = {
  plansPlanted: number; featuresPlanted: number; linksPlanted: number;
  activePlans: number; features: number; links: number;
};
export type OwnerReport = { state: "admin" | "corrected" | "not_signed_in_yet" | "wrong_role"; roleBefore: string | null };

/** Insert what is missing, in one transaction. Returns what was added now and what the tables hold after. */
export async function plantCatalog(client: SqlClient): Promise<CatalogReport> {
  await client.query("BEGIN");
  try {
    let plansPlanted = 0, featuresPlanted = 0, linksPlanted = 0;
    for (const plan of defaultCommercialPlans) plansPlanted += (await client.query("INSERT INTO commercial_plans (id, code, name, package_code, active) VALUES ($1, $2, $3, $4, true) ON CONFLICT (code) DO NOTHING", [randomUUID(), plan.code, plan.name, plan.packageCode])).rowCount ?? 0;
    for (const feature of defaultCommercialFeatures) featuresPlanted += (await client.query("INSERT INTO commercial_features (id, code, name, product_code, active) VALUES ($1, $2, $3, $4, true) ON CONFLICT (code) DO NOTHING", [randomUUID(), feature.code, feature.name, feature.productCode])).rowCount ?? 0;
    for (const pair of defaultPlanFeaturePairs()) linksPlanted += (await client.query(
      "INSERT INTO plan_feature_entitlements (id, plan_id, feature_id, active) SELECT $1, p.id, f.id, true FROM commercial_plans p, commercial_features f WHERE p.code = $2 AND f.code = $3 ON CONFLICT (plan_id, feature_id) DO NOTHING",
      [randomUUID(), pair.planCode, pair.featureCode])).rowCount ?? 0;
    await client.query("COMMIT");
    const count = async (sql: string) => Number((await client.query(sql)).rows[0].n);
    return { plansPlanted, featuresPlanted, linksPlanted,
      activePlans: await count("SELECT count(*) AS n FROM commercial_plans WHERE active"), features: await count("SELECT count(*) AS n FROM commercial_features WHERE active"), links: await count("SELECT count(*) AS n FROM plan_feature_entitlements WHERE active") };
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
}

/** Read the owner's account role; set it to 'admin' only when the account exists and says otherwise. */
export async function checkPlatformOwner(client: SqlClient, ownerEmail: string): Promise<OwnerReport> {
  const openId = openIdForEmail(ownerEmail.trim().toLowerCase());
  const row = (await client.query("SELECT role FROM users WHERE open_id = $1", [openId])).rows[0] as { role: string } | undefined;
  if (!row) return { state: "not_signed_in_yet", roleBefore: null };
  if (row.role === "admin") return { state: "admin", roleBefore: "admin" };
  await client.query("UPDATE users SET role = 'admin' WHERE open_id = $1", [openId]);
  const after = (await client.query("SELECT role FROM users WHERE open_id = $1", [openId])).rows[0] as { role: string } | undefined;
  return { state: after?.role === "admin" ? "corrected" : "wrong_role", roleBefore: row.role };
}

export const EXPECTED_PLANS = defaultCommercialPlans.length;
