import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// G-130: every server function a router calls with a tenant must reach an entitlement check (membership active, the
// product licensed, the permission granted) before it touches data. A new function that forgets it fails here by name.
// The few functions that deliberately do not check the product licence are listed with the reason; the list is closed.
const serverDir = join(__dirname);
const sources = Object.fromEntries(readdirSync(serverDir).filter(name => /\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name)).map(name => [name, readFileSync(join(serverDir, name), "utf8")]));
const routers = sources["routers.ts"];

/** Helpers that end in `assertTenantAccess` (active membership + licensed product + permission + scope) or check the licence themselves. */
const GATES = ["assertTenderAccess", "assertDesignAccess", "assertTenantAccess", "assertTenantFeatureAccess", "authorizeNewImport", "assertImportAccess", "authorizeUpload", "importAccess", "authorizeExternalImport", "authorizeDirectUpload", "assertHrRecordAccess", "assertAttendanceAccess", "assertPerformanceManager", "assertPerformanceAccess", "assertPayrollAccess", "assertAnyPayrollAccess", "assertTenantManager", "assertRoleProductEntitled", "resolveScopedAccess"];

const WITHOUT_PRODUCT_LICENCE: Record<string, string> = {
  acknowledgeInternalNotification: "own notification rows only (recipient = caller); active membership required; no product licence needed to read what was sent to you",
  getInternalNotificationsForTenant: "own notification rows only (recipient = caller); active membership required",
  getPayrollCapabilitiesForTenant: "returns flags only; each flag already requires the PROJECT licence and the permission in the same expression",
  generateProjectAdvisoryForTenant: "first line calls getProjectControlsForTenant, which is gated; then consumes the tenant's advisor quota",
  claimSupportTicket: "delegates to transitionSupportTicket (support membership; support must stay reachable when a licence has lapsed)",
  transitionSupportTicket: "support membership: a tenant with a lapsed licence must still be able to ask for help",
  createSupportTicketForTenant: "support membership: same reason", getSupportTicketForTenant: "support membership: same reason", listSupportTicketsForTenant: "support membership: same reason", replyToSupportTicket: "support membership: same reason",
  createKnowledgeArticleForTenant: "support membership + tenant.manage", listKnowledgeArticlesForTenant: "support membership; non-managers see published articles only", listApprovedSupportSourceDocuments: "support membership",
  createTenantPayment: "billing manager (tenant.manage or platform admin): an expired licence must still be payable", getTenantBillingForManager: "billing manager: same reason", issueTenantInvoice: "billing manager: same reason",
  confirmManualTenantPayment: "platform administrator only", provisionTenantLicense: "platform administrator only", setTenantLicenseFeatureOverride: "platform administrator only", transitionTenantLicenseStatus: "platform administrator only",
  getTenantAccessSnapshot: "the primitive every gate is built on; returns null for a non-member",
  getEmailNotificationPreferences: "the caller's own e-mail choices only (user = caller); active membership required; no product licence needed to read or change how you are told",
  setEmailNotificationPreference: "the caller's own e-mail choices only (user = caller); active membership required",
  previewTenantData: "company owner only (TENANT_OWNER at company scope, active membership); the owner of a company whose licence has lapsed must still be able to see and take their data",
  requestTenantDeletion: "company owner only; same reason — and deletion switches the products off itself, so a licence check would lock the owner out of finishing it",
  confirmTenantDeletion: "company owner only; same reason",
};

type Found = { name: string; body: string };
function routerCalledTenantFunctions(): Found[] {
  const called = new Set(Array.from(routers.matchAll(/\b([a-zA-Z]+)\(\{/g)).map(match => match[1]));
  const found: Found[] = [];
  for (const source of Object.values(sources)) {
    for (const match of source.matchAll(/export (?:async )?function (\w+)\b/g)) {
      if (!called.has(match[1])) continue;
      const rest = source.slice(match.index! + match[0].length);
      const next = rest.search(/\nexport (?:async )?function /);
      const body = source.slice(match.index!, match.index! + match[0].length + (next === -1 ? rest.length : next));
      if (body.split("\n")[0].includes("tenantId")) found.push({ name: match[1], body });
    }
  }
  return found;
}
const gateRegex = new RegExp(`\\b(${GATES.join("|")})\\(`);

describe("entitlement gate on every tenant action (G-130)", () => {
  const functions = routerCalledTenantFunctions();

  it("finds the functions it is meant to guard (the scan is not vacuous)", () => {
    expect(functions.length).toBeGreaterThan(150);
    expect(functions.map(f => f.name)).toEqual(expect.arrayContaining(["createProgressEntry", "getPayrollRunsForTenant", "saveTenantLabourSettings"]));
  });

  it("reaches a gate in every function, or is on the closed list with its reason", () => {
    const ungated = functions.filter(f => !gateRegex.test(f.body)).map(f => f.name).filter(name => !(name in WITHOUT_PRODUCT_LICENCE));
    expect(ungated).toEqual([]);
  });

  it("keeps the exemption list honest: nothing on it is already gated, nothing on it is gone", () => {
    const byName = new Map(functions.map(f => [f.name, f]));
    const gatedButListed = Object.keys(WITHOUT_PRODUCT_LICENCE).filter(name => byName.get(name) && gateRegex.test(byName.get(name)!.body));
    expect(gatedButListed).toEqual([]);
    const missing = Object.keys(WITHOUT_PRODUCT_LICENCE).filter(name => !byName.has(name) && name !== "getTenantAccessSnapshot");
    expect(missing).toEqual([]);
  });

  it("checks that each gate helper itself ends in the licence check", () => {
    for (const gate of GATES.filter(name => name !== "assertTenantAccess" && name !== "assertTenantFeatureAccess")) {
      // a gate helper lives in db.ts, or in the service file of a module that has its own (designService.ts)
      const db = Object.values(sources).find(source => new RegExp(`(?:async )?function ${gate}\\b`).test(source))!;
      const start = db.search(new RegExp(`(?:async )?function ${gate}\\b`));
      expect(start, gate).toBeGreaterThan(-1);
      const body = db.slice(start, start + db.slice(start).search(/\n(?:export )?(?:async )?function |\nconst \w+ = /) + 1 || undefined);
      expect(/assertTenantAccess\(|entitledProducts\.includes|assertPayrollAccess\(|assertTenantFeatureAccess\(|authorizeNewImport\(|assertImportAccess\(|authorizeExternalImport\(|eq\(tenantEntitlements\.productCode, input\.product\)/.test(body), gate).toBe(true); // assertAnyPayrollAccess delegates to assertPayrollAccess; the import / upload helpers delegate to the gates listed above (each of which is checked by this same loop)
    }
  });

  it("makes the notification reads refuse a member who is not active", () => {
    const db = sources["db.ts"];
    for (const name of ["getInternalNotificationsForTenant", "acknowledgeInternalNotification"]) {
      const start = db.indexOf(`export async function ${name}`);
      expect(db.slice(start, start + 600)).toContain('membershipStatus !== "active"');
    }
  });
});
