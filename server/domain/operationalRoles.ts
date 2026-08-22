export const operationalPermissionCatalog = [
  { code: "project.inventory.manage", name: "Manage warehouse inventory", productCode: "PROJECT" as const },
  { code: "project.procurement.manage", name: "Manage procurement", productCode: "PROJECT" as const },
  { code: "project.budget.manage", name: "Manage project budgets", productCode: "PROJECT" as const },
  { code: "project.cost.enter", name: "Enter actual costs", productCode: "PROJECT" as const },
  { code: "project.cashflow.read", name: "View project cash flow", productCode: "PROJECT" as const },
  { code: "project.commitment.manage", name: "Manage commitments", productCode: "PROJECT" as const },
  { code: "project.invoice.match", name: "Match supplier invoices", productCode: "PROJECT" as const },
  { code: "project.payroll.run", name: "Run payroll", productCode: "PROJECT" as const },
  { code: "project.payroll.approve", name: "Approve payroll", productCode: "PROJECT" as const },
  { code: "project.payroll.sensitive.read", name: "Read protected payroll details", productCode: "PROJECT" as const },
  { code: "project.hr.manage", name: "Manage employee records", productCode: "PROJECT" as const },
  { code: "project.hr.sensitive.read", name: "Read protected employee identity data", productCode: "PROJECT" as const },
  { code: "project.payroll.structure", name: "Manage payroll structures", productCode: "PROJECT" as const },
  { code: "project.attendance.manage", name: "Manage attendance", productCode: "PROJECT" as const },
  { code: "project.performance.manage", name: "Manage performance indicators", productCode: "PROJECT" as const },
  { code: "project.wbs.manage", name: "Manage WBS", productCode: "PROJECT" as const },
  { code: "project.schedule.manage", name: "Manage schedules", productCode: "PROJECT" as const },
  { code: "project.evm.manage", name: "Manage EVM snapshots", productCode: "PROJECT" as const },
  { code: "project.progress.manage", name: "Report project progress", productCode: "PROJECT" as const },
  { code: "project.field.manage", name: "Manage field reports", productCode: "PROJECT" as const },
  { code: "project.quality.manage", name: "Manage quality inspections", productCode: "PROJECT" as const },
  { code: "project.hse.manage", name: "Manage HSE observations", productCode: "PROJECT" as const },
  { code: "project.rfi.manage", name: "Manage RFIs", productCode: "PROJECT" as const },
  { code: "project.ncr.manage", name: "Manage NCRs", productCode: "PROJECT" as const },
  { code: "project.material.request", name: "Request project materials", productCode: "PROJECT" as const },
  { code: "project.manage", name: "Manage governed project operations", productCode: "PROJECT" as const },
] as const;

export const operationalRoleDefinitions = [
  { code: "WAREHOUSE_CUSTODIAN", name: "Warehouse Custodian", permissions: ["project.inventory.manage"] },
  { code: "PROCUREMENT_OFFICER", name: "Procurement Officer", permissions: ["project.procurement.manage"] },
  { code: "FINANCE_MANAGER", name: "Finance Manager", permissions: ["project.budget.manage", "project.cost.enter", "project.cashflow.read", "project.commitment.manage", "project.invoice.match", "project.payroll.approve", "project.payroll.sensitive.read"] },
  { code: "ACCOUNTANT", name: "Accountant", permissions: ["project.cost.enter", "project.invoice.match", "project.payroll.run"] },
  { code: "HR_MANAGER", name: "HR Manager", permissions: ["project.hr.manage", "project.hr.sensitive.read", "project.payroll.structure", "project.payroll.sensitive.read", "project.attendance.manage", "project.performance.manage"] },
  { code: "PLANNING_ENGINEER", name: "Planning Engineer", permissions: ["project.wbs.manage", "project.schedule.manage", "project.evm.manage"] },
  { code: "SITE_ENGINEER", name: "Site Engineer", permissions: ["project.progress.manage", "project.field.manage", "project.quality.manage", "project.hse.manage", "project.rfi.manage", "project.ncr.manage", "project.material.request"] },
  { code: "PROJECT_MANAGER", name: "Project Manager", permissions: ["project.manage", "project.attendance.manage"] },
] as const;

const conflictingOperationalRolePairs = [
  ["PROCUREMENT_OFFICER", "WAREHOUSE_CUSTODIAN"],
  ["ACCOUNTANT", "FINANCE_MANAGER"],
  ["HR_MANAGER", "ACCOUNTANT"],
] as const;

export function assertOperationalRoleSeparation(existingRoleCodes: string[], nextRoleCode: string) {
  const normalizedNext = nextRoleCode.trim().toUpperCase();
  const conflict = conflictingOperationalRolePairs.find(([left, right]) =>
    (normalizedNext === left && existingRoleCodes.includes(right)) ||
    (normalizedNext === right && existingRoleCodes.includes(left)),
  );
  if (conflict) throw new Error("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
}
