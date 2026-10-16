// G-120: which operational permission each governed write (and the cash-flow read) needs.
// The key is the name of the function in db.ts that performs the action, so a test can
// read db.ts and prove the check is really there. A list means "any one of these".
//
// The generic `project.write` is deliberately NOT accepted for these actions: a role that
// carried it next to an operational role would otherwise bypass the operational limit,
// which is what made the separation of duties paper only.

export const governedActionPermissions = {
  // warehouse
  createProjectWarehouseForTenant: ["project.inventory.manage"],
  recordWarehouseInventoryTransactionForTenant: ["project.inventory.manage"],
  transferWarehouseInventoryForTenant: ["project.inventory.manage"],
  createMaterialIssueForTenant: ["project.inventory.manage"],
  createGoodsReceiptNoteForTenant: ["project.inventory.manage"],
  // the material catalogue is shared master data: buying and warehousing both maintain it
  createMaterialMasterForTenant: ["project.procurement.manage", "project.inventory.manage"],
  saveProjectMaterialOverrideForTenant: ["project.procurement.manage", "project.inventory.manage"],
  // procurement
  createSupplierForTenant: ["project.procurement.manage"],
  createProcurementRequisitionForTenant: ["project.material.request", "project.procurement.manage"],
  transitionProcurementRequisitionForTenant: ["project.procurement.manage"],
  linkProcurementRequisitionPurchaseOrderForTenant: ["project.procurement.manage"],
  createPurchaseOrderForTenant: ["project.procurement.manage"],
  transitionPurchaseOrderStatus: ["project.procurement.manage"],
  // finance
  createBudgetLine: ["project.budget.manage"],
  createCostEntry: ["project.cost.enter"],
  createContractForTenant: ["project.commitment.manage"],
  createCommitmentForTenant: ["project.commitment.manage"],
  createSubcontractContractForTenant: ["project.commitment.manage"],
  createSubcontractCertificateForTenant: ["project.commitment.manage"],
  createClaimForTenant: ["project.commitment.manage"],
  transitionClaimStatus: ["project.commitment.manage"],
  createProjectCommercialInvoiceForTenant: ["project.invoice.match"],
  transitionProjectCommercialInvoiceStatus: ["project.invoice.match"],
  createChangeRequestForTenant: ["project.manage", "project.commitment.manage"],
  transitionChangeRequestStatus: ["project.manage", "project.commitment.manage"],
  // planning and progress
  createWbsItem: ["project.wbs.manage"],
  createBoqItemForTenant: ["project.wbs.manage"],
  createActivity: ["project.schedule.manage"],
  createProjectResourceForTenant: ["project.schedule.manage", "project.manage"],
  updateProjectResourceAllocationForTenant: ["project.schedule.manage", "project.manage"],
  saveEvmSnapshot: ["project.evm.manage"],
  captureOperationalEvmSnapshot: ["project.evm.manage"],
  captureProjectHealthSnapshot: ["project.evm.manage", "project.manage"],
  createProgressEntry: ["project.progress.manage"],
  // site records
  createFieldReportForTenant: ["project.field.manage"],
  transitionFieldReportStatus: ["project.field.manage"],
  createQualityInspectionForTenant: ["project.quality.manage"],
  transitionQualityInspectionStatus: ["project.quality.manage"],
  createHseObservationForTenant: ["project.hse.manage"],
  transitionHseObservationStatus: ["project.hse.manage"],
  createRfiForTenant: ["project.rfi.manage"],
  transitionRfiStatus: ["project.rfi.manage"],
  createNcrForTenant: ["project.ncr.manage"],
  transitionNcrStatus: ["project.ncr.manage"],
  // tenant settings: how labour is loaded and which days are worked
  saveTenantLabourSettings: ["project.settings.labour"],
  getTenantLabourSettings: ["project.settings.labour", "project.cashflow.read"],
  // the team's hours for one day, from the phone
  getTeamHoursSheetForTenant: ["project.manage"],
  createTeamTimeEntriesForTenant: ["project.manage"],
  // cash-flow figures
  getProjectProfitabilityForTenant: ["project.cashflow.read"],
  getProjectLabourCostForTenant: ["project.cashflow.read"],
  getProjectCashFlowForTenant: ["project.cashflow.read"],
  getProfitabilityCostBreakdownForTenant: ["project.cashflow.read"],
  getProfitabilityHistoryForTenant: ["project.cashflow.read"],
} as const satisfies Record<string, readonly string[]>;

export type GovernedAction = keyof typeof governedActionPermissions;

export { importModulePermissions } from "@shared/importPermissions";

/**
 * Separation of duties at the level that actually matters: the powers. Nobody (but the tenant
 * owner, who holds everything by definition) may hold both sides of a pair, whether through
 * built-in roles, a custom role, or several roles added together. Naming roles is not enough:
 * a custom role could carry both powers without being called either.
 */
export const conflictingPermissionPairs = [
  { pair: ["project.procurement.manage", "project.inventory.manage"], reason: "the buyer must not also receive and issue the goods" },
  { pair: ["project.procurement.manage", "project.invoice.match"], reason: "the buyer must not also match the supplier's invoice" },
  { pair: ["project.inventory.manage", "project.invoice.match"], reason: "the one who receives the goods must not also match the invoice" },
  { pair: ["project.payroll.run", "project.payroll.approve"], reason: "the accountant who runs payroll must not be the finance manager who approves it" },
  { pair: ["project.payroll.run", "project.hr.manage"], reason: "payroll must not be run by whoever maintains the employee records" },
  { pair: ["project.payroll.run", "project.payroll.structure"], reason: "payroll must not be run by whoever sets the salary structures" },
  { pair: ["project.design.manage", "project.design.approve"], reason: "whoever issues a drawing must not also approve it for construction, nor record the consultant's reply to their own submittal" },
] as const;

export function findPermissionConflict(permissionCodes: Iterable<string>) {
  const held = new Set(permissionCodes);
  return conflictingPermissionPairs.find(({ pair }) => held.has(pair[0]) && held.has(pair[1])) ?? null;
}

export function assertNoPermissionConflict(permissionCodes: Iterable<string>) {
  if (findPermissionConflict(permissionCodes)) throw new Error("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
}
