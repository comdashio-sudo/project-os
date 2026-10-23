// The synthetic people of the all-roles visit: one per operating role, plus the demo administrator (TENANT_OWNER).
//
// The list is read from server/domain/operationalRoles.ts, so a template added there is visited without editing this file. Every person is
// invented (*.example.test) and gets the same account the e-mail sign-in would create (openId = email:<40 hex of SHA-256(address)>).
//
// How each role is attached (the same rules scripts/lib/roleFixture.mjs uses, so both rehearsals build the same shape):
//   - a company-wide template (procurement, finance, accountant, HR, cost control, executive, PMO) is granted at company scope;
//     every other template is granted at the scope of the demo project;
//   - a PROJECT template that does not carry "project.read" also gets the viewer role PROJECT_VIEWER, because a person cannot open a project
//     without it (the templates say what the holder DOES; the viewer role says the holder may open the project at all).
import { createHash } from "node:crypto";
import { operationalRoleDefinitions } from "../../server/domain/operationalRoles.ts";

export const DEMO_EMAIL = "demo.admin@example.test";
export const TEST_DATABASE = "project_os_integration_test";
export const VIEWER_ROLE = { code: "PROJECT_VIEWER", name: "مطّلع على المشروع", productCode: "PROJECT", permissionCodes: ["project.read"] };

const COMPANY_SCOPE = new Set(["PROCUREMENT_OFFICER", "FINANCE_MANAGER", "ACCOUNTANT", "HR_MANAGER", "COST_CONTROLLER", "EXECUTIVE", "PMO_LEAD"]);

export const emailOpenId = email => `email:${createHash("sha256").update(email).digest("hex").slice(0, 40)}`;

/** A synthetic address for a role, e.g. ui.project-manager@example.test. Stable across runs, so a re-run finds the same people. */
export const roleEmail = code => `ui.${code.toLowerCase().replaceAll("_", "-")}@example.test`;

/** Every person of the visit: the demo administrator first, then the operating templates in the order of the file. */
export function visitPeople() {
  return [
    { code: "TENANT_OWNER", name: "Demo administrator", email: DEMO_EMAIL, demo: true, scope: "company", viewer: false },
    ...operationalRoleDefinitions.map(role => ({
      code: role.code,
      name: role.name,
      email: roleEmail(role.code),
      demo: false,
      scope: COMPANY_SCOPE.has(role.code) ? "company" : "project",
      viewer: role.productCode === undefined && !role.permissions.includes("project.read"),
    })),
  ];
}
