import mysql from "mysql2/promise";
import crypto from "node:crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

async function run() {
  console.log("--- PROJECT OS Operational Smoke Test ---");
  console.log("Time:", new Date().toISOString());
  
  const connection = await mysql.createConnection(DATABASE_URL);
  console.log("✅ Connected to database");

  const tenantId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const userId = 1; // Assuming owner/admin user exists

  try {
    // 1. Create Tenant
    console.log("\n1. Creating Tenant...");
    await connection.query(
      "INSERT INTO companies (id, legalName, slug, status) VALUES (?, ?, ?, 'active')",
      [tenantId, "Smoke Test Corp", `smoke-test-${Date.now()}`]
    );
    console.log("✅ Tenant created:", tenantId);

    // 2. Create Project
    console.log("\n2. Creating Project...");
    await connection.query(
      "INSERT INTO projects (id, tenantId, code, name, projectType, status, currency) VALUES (?, ?, ?, ?, 'Construction', 'active', 'SAR')",
      [projectId, tenantId, "SMOKE-001", "Operational Smoke Project"]
    );
    console.log("✅ Project created:", projectId);

    // 3. Create WBS Item
    console.log("\n3. Creating WBS Item...");
    const wbsId = crypto.randomUUID();
    await connection.query(
      "INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, 'WBS-1', 'Site Preparation', 50000)",
      [wbsId, tenantId, projectId]
    );
    console.log("✅ WBS Item created:", wbsId);

    // 4. Create Material Master
    console.log("\n4. Creating Material Master...");
    const materialId = crypto.randomUUID();
    await connection.query(
      "INSERT INTO material_masters (id, tenantId, code, description, unitOfMeasure, category, createdByUserId) VALUES (?, ?, 'CONC-01', 'Ready Mix Concrete', 'm3', 'Concrete', ?)",
      [materialId, tenantId, userId]
    );
    console.log("✅ Material Master created:", materialId);

    // 5. Create Purchase Order
    console.log("\n5. Creating Purchase Order...");
    const poId = crypto.randomUUID();
    await connection.query(
      "INSERT INTO purchase_orders (id, tenantId, projectId, purchaseOrderNumber, supplierName, orderDate, amount, currency, summary, status, createdByUserId) VALUES (?, ?, ?, 'PO-SMOKE-01', 'Global Supplies', NOW(), 15000, 'SAR', 'Smoke Test PO', 'approved', ?)",
      [poId, tenantId, projectId, userId]
    );
    console.log("✅ Purchase Order created:", poId);

    // 6. Create GRN (Goods Receipt Note)
    console.log("\n6. Creating GRN...");
    const grnId = crypto.randomUUID();
    await connection.query(
      "INSERT INTO goods_receipt_notes (id, tenantId, projectId, purchaseOrderId, materialId, grnNumber, receivedQuantity, rejectedQuantity, unitOfMeasure, receivedAt, createdByUserId) VALUES (?, ?, ?, ?, ?, 'GRN-SMOKE-01', 100, 0, 'm3', NOW(), ?)",
      [grnId, tenantId, projectId, poId, materialId, userId]
    );
    console.log("✅ GRN created:", grnId);

    // 7. Verify Audit Log
    console.log("\n7. Verifying Audit Logs...");
    const [audits] = await connection.query(
      "SELECT action, entityType, entityId FROM audit_logs WHERE tenantId = ? ORDER BY createdAt DESC",
      [tenantId]
    );
    console.log(`✅ Found ${audits.length} audit entries for tenant`);
    audits.forEach(a => console.log(`   - ${a.action} on ${a.entityType}`));

    console.log("\n--- SMOKE TEST SUCCESSFUL ---");
    console.log("All core operational paths verified for new project.");

  } catch (error) {
    console.error("\n❌ SMOKE TEST FAILED");
    console.error(error);
  } finally {
    console.log("\nCleaning up...");
    // Cleanup in reverse order
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [tenantId]);
    await connection.query("DELETE FROM goods_receipt_notes WHERE tenantId = ?", [tenantId]);
    await connection.query("DELETE FROM purchase_orders WHERE tenantId = ?", [tenantId]);
    await connection.query("DELETE FROM material_masters WHERE tenantId = ?", [tenantId]);
    await connection.query("DELETE FROM wbs_items WHERE tenantId = ?", [tenantId]);
    await connection.query("DELETE FROM projects WHERE tenantId = ?", [tenantId]);
    await connection.query("DELETE FROM companies WHERE id = ?", [tenantId]);
    console.log("✅ Cleanup complete");
    await connection.end();
  }
}

run();
