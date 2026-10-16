// One table for both sides: the server checks it before any import (server/db.ts), and the import screen reads it to show
// the upload controls only to someone who may import the chosen module. Kept in shared/ so the two can never drift apart.

/** The data importer writes into these governed domains, so each module needs that domain's permission. */
export const importModulePermissions = {
  wbs: ["project.wbs.manage"],
  budget: ["project.budget.manage"],
  contracts: ["project.commitment.manage"],
  materials: ["project.procurement.manage", "project.inventory.manage"],
  openingBalances: ["project.inventory.manage"],
  schedule: ["project.schedule.manage", "project.wbs.manage"],
} as const satisfies Record<string, readonly string[]>;
