// Synthetic demo data for one tenant/project (invented names, *.example.test, SAR): budgets, costs, progress, a change order,
// suppliers/contracts/commitments/purchase orders, materials and a warehouse with priced receipts and an issue, three employees
// with salary structures and approved hours, and one payroll run shared out by hours. Used by the screenshot gallery, the
// per-role browser tests and the performance seed, so all of them look at the same shape of data.
import { randomUUID } from "node:crypto";
import { transitionEmployeeTimeEntryForTenant } from "../../server/db.ts";

export async function seedDemoData({ caller, connection, tenantId, projectId, user }) {
  const input = { tenantId, projectId };
  const days = n => new Date(Date.now() - n * 86400000);
  const [[already]] = await connection.query("SELECT COUNT(*) AS n FROM cost_entries WHERE projectId = ?", [projectId]);
  if (Number(already.n) > 0) { console.log("seed: skipped (the demo project already has cost records)"); return false; }
  const [wbsRows] = await connection.query("SELECT id, code FROM wbs_items WHERE projectId = ? ORDER BY code", [projectId]);
  const w = Object.fromEntries(wbsRows.map(row => [row.code, row.id]));
  const [first, second] = [wbsRows[0].id, wbsRows[1]?.id ?? wbsRows[0].id];
  await connection.query("UPDATE projects SET contractValue = 1400000, currency = 'SAR', status = 'active' WHERE id = ?", [projectId]);
  for (const [id, amount, code] of [[first, 400000, "B1"], [second, 900000, "B2"]]) await caller.budgets.create({ ...input, wbsItemId: id, costCode: code, originalAmount: amount, currentAmount: amount });
  await caller.costs.createActual({ ...input, wbsItemId: first, amount: 260000, incurredAt: days(20), category: "materials" });
  await caller.costs.createActual({ ...input, wbsItemId: first, amount: 90000, incurredAt: days(10), category: "labour" });
  await caller.costs.createActual({ ...input, wbsItemId: second, amount: 300000, incurredAt: days(5), category: "subcontract" });
  await caller.progress.create({ ...input, wbsItemId: first, percentComplete: 80, reportedAt: days(18) });
  await caller.progress.create({ ...input, wbsItemId: second, percentComplete: 30, reportedAt: days(2) });
  const co = await caller.changes.create({ ...input, changeNumber: "CO-1", title: "Extra scope", description: "Extra scope instructed", impactScheduleDays: 0, impactCost: 0, contractValueImpact: 120000, currency: "SAR" });
  for (const nextStatus of ["submitted", "under_review", "approved"]) await caller.changes.transitionStatus({ ...input, changeRequestId: co.id, nextStatus });
  await caller.controls.captureOperationalEvmSnapshot({ ...input, periodAt: days(30), eacMethod: "ac_plus_remaining" });

  // Suppliers, a supplier contract linked to the register, a commitment and an issued purchase order.
  const steel = await caller.procurement.createSupplier({ tenantId, code: "SUP-1", legalName: "Gulf Steel Supply Co.", contactName: "Sales Desk", contactEmail: "sales@gulfsteel.example.test" });
  await caller.procurement.createSupplier({ tenantId, code: "SUP-2", legalName: "Al Noor Concrete Works", contactEmail: "orders@alnoor.example.test" });
  await caller.contracts.create({ ...input, code: "C-001", title: "Reinforcement steel supply", counterparty: "Gulf Steel Supply Co.", counterpartyKind: "supplier", supplierId: steel.id, contractValue: 250000, currency: "SAR", startAt: days(60), endAt: new Date(Date.now() + 200 * 86400000) });
  await caller.contracts.create({ ...input, code: "C-002", title: "Main contract with the client", counterparty: "Client Developer Co.", counterpartyKind: "client", contractValue: 1400000, currency: "SAR" });
  const commitment = await caller.contracts.createCommitment({ ...input, code: "CM-001", description: "Steel and cement commitment", amount: 120000, currency: "SAR", committedAt: days(30) });
  await connection.query("UPDATE commitments SET status = 'committed' WHERE id = ?", [commitment.id]); // no procedure moves a commitment on; the receipt checks it is committed
  const po = await caller.purchaseOrders.create({ ...input, commitmentId: commitment.id, wbsItemId: first, supplierId: steel.id, purchaseOrderNumber: "PO-001", orderDate: days(25), amount: 60000, currency: "SAR", summary: "Rebar and cement for the foundations" });
  for (const nextStatus of ["submitted", "approved", "issued"]) await caller.purchaseOrders.transitionStatus({ ...input, purchaseOrderId: po.id, nextStatus });
  const po2 = await caller.purchaseOrders.create({ ...input, commitmentId: commitment.id, wbsItemId: second, supplierId: steel.id, purchaseOrderNumber: "PO-002", orderDate: days(12), amount: 30000, currency: "SAR", summary: "Block work delivered straight to the plot" });
  for (const nextStatus of ["submitted", "approved", "issued"]) await caller.purchaseOrders.transitionStatus({ ...input, purchaseOrderId: po2.id, nextStatus });

  // Materials and a warehouse: an opening balance WITH a price, a priced receipt (weighted average), an issue to work, one receipt straight to site.
  const warehouse = await caller.warehouses.create({ ...input, code: "WH-MAIN", name: "Main site store" });
  await caller.warehouses.create({ ...input, code: "WH-2", name: "Block B store" });
  const cement = await caller.materials.createMaster({ tenantId, code: "CEM-42", description: "Cement 42.5 (50 kg bag)", unitOfMeasure: "bag", category: "concrete" });
  const rebar = await caller.materials.createMaster({ tenantId, code: "REB-16", description: "Rebar 16 mm", unitOfMeasure: "ton", category: "steel" });
  await caller.materials.saveProjectOverride({ ...input, materialId: cement.id, reorderLevel: 150, active: true });
  await caller.warehouses.recordInventory({ ...input, warehouseId: warehouse.id, materialId: cement.id, transactionType: "receipt", quantityDelta: 400, unitCost: 14, referenceNumber: "OPENING", note: "Opening balance", occurredAt: days(28) });
  await caller.goodsReceipts.create({ ...input, grnNumber: "GRN-001", purchaseOrderId: po.id, materialId: cement.id, receivedQuantity: 300, rejectedQuantity: 0, unitCost: 16, unitOfMeasure: "bag", receivedAt: days(20), receiptMode: "warehouse_stock", warehouseId: warehouse.id });
  await caller.warehouses.issueToWork({ ...input, warehouseId: warehouse.id, materialId: cement.id, wbsItemId: first, issuedQuantity: 120, referenceNumber: "ISS-001", issuedAt: days(15) });
  await caller.goodsReceipts.create({ ...input, grnNumber: "GRN-002", purchaseOrderId: po2.id, materialId: rebar.id, receivedQuantity: 8, rejectedQuantity: 0, unitCost: 2400, unitOfMeasure: "ton", receivedAt: days(9), receiptMode: "direct_to_site" });

  // People: three employees (two nationalities), a salary structure each, approved hours across two WBS items, one payroll run shared out by hours.
  const [[resource]] = await connection.query("SELECT id FROM project_resources WHERE projectId = ? AND resourceType = 'labor' LIMIT 1", [projectId]);
  const resourceId = resource?.id ?? (await caller.resources.create({ ...input, resourceCode: "LAB-1", name: "Site labour", resourceType: "labor", plannedUnits: 2000, allocatedUnits: 0, unitCost: 45, currency: "SAR" })).id;
  const staff = [["E-001", "Employee One", "Foreman", "2020-01-01", "Saudi", 9000, 2000, 1000], ["E-002", "Employee Two", "Mason", "2025-06-01", "Indian", 5000, 1000, 0], ["E-003", "Employee Three", "Carpenter", "2023-03-01", "Egyptian", 5500, 1000, 500]];
  const ids = [];
  for (const [number, name, title, hired, nationality, base, housing, transport] of staff) {
    const id = randomUUID(); ids.push(id);
    await connection.query("INSERT INTO employees (id, tenantId, employeeNumber, fullName, jobTitle, department, hireDate, employmentStatus, nationality, createdByUserId) VALUES (?, ?, ?, ?, ?, 'Site', ?, 'active', ?, ?)", [id, tenantId, number, name, title, hired, nationality, user.id]);
    await caller.employees.payroll.salaryStructure.save({ tenantId, employeeId: id, baseSalary: base, housingAllowance: housing, transportAllowance: transport, hardshipAllowance: 0, gosiRate: 0.09, otherDeductions: 0, eosAccrualMode: "computed", eosMonthlyAccrual: 0, currency: "SAR" });
  }
  const month = new Date(); const periodStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)); const periodEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
  const dayOf = n => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), n)).toISOString().slice(0, 10);
  for (const [index, employeeId] of ids.entries()) for (const [wbsItemId, workDays] of [[first, [1, 2, 3]], [second, [4, 5]]]) {
    const assignmentId = randomUUID();
    await connection.query("INSERT INTO employee_assignments (id, tenantId, projectId, employeeId, projectResourceId, wbsItemId, plannedStartAt, plannedFinishAt, plannedHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 120, 'active', ?)", [assignmentId, tenantId, projectId, employeeId, resourceId, wbsItemId, dayOf(1), dayOf(28), user.id]);
    for (const d of workDays) {
      const entryId = randomUUID();
      await connection.query("INSERT INTO employee_time_entries (id, tenantId, assignmentId, employeeId, projectId, workDate, actualHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?)", [entryId, tenantId, assignmentId, employeeId, projectId, dayOf(d), 8 - (index === 1 && wbsItemId === second ? 2 : 0), user.id]);
      await transitionEmployeeTimeEntryForTenant({ userId: user.id, tenantId, projectId, timeEntryId: entryId, status: "approved" });
    }
  }
  const run = await caller.employees.payroll.createRun({ tenantId, periodStart, periodEnd });
  const [entries] = await connection.query("SELECT id FROM payroll_entries WHERE payrollRunId = ?", [run.id]);
  for (const entry of entries) await caller.employees.payroll.allocateByHours({ tenantId, payrollEntryId: entry.id }).catch(error => console.log("allocateByHours:", String(error.message).slice(0, 80)));
  // a Master Plan with a few entities, so the plan screen (rotation, calibration, parent tree, alerts) has something to show
  const plan = await caller.masterPlans.create({ tenantId, projectId, code: "MP-DEMO", title: "Demo master plan" }).catch(error => { console.log("masterPlan:", String(error.message).slice(0, 80)); return null; });
  if (plan) {
    const zone = await caller.masterPlans.createSpatialEntity({ tenantId, projectId, masterPlanVersionId: plan.versionId, code: "ZONE-A", name: "Zone A", entityType: "zone", geometry: { x: 5, y: 5, width: 40, height: 30 }, status: "in_progress", progressPercent: 40, plannedValue: 1000, actualValue: 1300, forecastValue: 1400 });
    await caller.masterPlans.createSpatialEntity({ tenantId, projectId, masterPlanVersionId: plan.versionId, code: "BLOCK-1", name: "Block 1", entityType: "block", geometry: { x: 10, y: 10, width: 15, height: 10 }, status: "blocked", progressPercent: 10, parentEntityId: zone.id });
  }
  console.log("seed: done");
  return true;
}
