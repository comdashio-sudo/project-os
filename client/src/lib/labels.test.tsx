/** @vitest-environment node */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { operationalPermissionCatalog, operationalRoleDefinitions } from "../../../server/domain/operationalRoles";
import { enumLabel, hasArabicLabel, hasArabicPermission, permissionLabel, permissionNote, productLabel } from "./labels";
import { getOperationalRoleName } from "./operationalRolePresentation";

const schema = readFileSync(join(__dirname, "..", "..", "..", "drizzle", "schema.ts"), "utf8");
const STATUS_LIKE = ["status", "lifecycleStage", "transactionType", "receiptMode", "severity", "priority", "outcome", "employmentStatus", "escalationStatus", "fromStatus", "toStatus", "attendanceStatus", "sourceType"];
// Each column's enum is declared once as pgEnum("<table>_<column>", [...]); the values of every enum whose name ends in the column's snake_case name.
const enumValues = (column: string) => {
  const snake = column.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  return Array.from(schema.matchAll(new RegExp(`pgEnum\\("(?:[a-z0-9_]*_)?${snake}",\\s*\\[([^\\]]*)\\]`, "g"))).flatMap(match => Array.from(match[1].matchAll(/"([^"]+)"/g), value => value[1]));
};

describe("enumLabel", () => {
  it("gives an Arabic reader the Arabic name, and an English reader the code's own words", () => {
    expect(enumLabel("posted", true)).toBe("مُرحَّل");
    expect(enumLabel("under_review", true)).toBe("قيد المراجعة");
    expect(enumLabel("under_review", false)).toBe("under review");
    expect(enumLabel("receipt", true)).toBe("استلام");
    expect(enumLabel("execution", true)).toBe("التنفيذ");
  });
  it("is not thrown by case, spaces or hyphens, and never returns a blank", () => {
    expect(enumLabel("ACTIVE", true)).toBe("نشط");
    expect(enumLabel("Not Assessed", true)).toBe("غير مقيَّم");
    expect(enumLabel("in-progress", true)).toBe("قيد التنفيذ");
    expect(enumLabel(null, true)).toBe("—");
    expect(enumLabel(undefined, false)).toBe("—");
    expect(enumLabel("", true)).toBe("—");
    expect(enumLabel("a_code_nobody_named", true)).toBe("a code nobody named");
  });
});

describe("every code the database can hold has an Arabic name", () => {
  it("covers every value of every status-like column in the schema (so a new value fails here, not on a screen)", () => {
    const missing = STATUS_LIKE.flatMap(column => { const values = enumValues(column); expect(values.length, column).toBeGreaterThan(0); return values.filter(value => !hasArabicLabel(value)).map(value => `${column}: ${value}`); });
    expect(missing).toEqual([]);
  });
  it("covers every permission of the operational catalogue and the base ones, with a name that is Arabic", () => {
    const codes = [...operationalPermissionCatalog.map(permission => permission.code), "project.read", "project.write", "pmo.read", "pmo.write", "executive.read", "tenant.manage"];
    expect(codes.filter(code => !hasArabicPermission(code))).toEqual([]);
    for (const code of codes) expect(permissionLabel(code, "English name", true)).toMatch(/[؀-ۿ]/);
    expect(permissionLabel("custom.thing", "Custom thing", true)).toBe("Custom thing"); // a permission nobody mapped keeps its own name
  });
  it("names every built-in role in Arabic, owner included", () => {
    for (const role of [...operationalRoleDefinitions.map(({ code, name }) => ({ code, name })), { code: "TENANT_OWNER", name: "Tenant Owner" }]) expect(getOperationalRoleName(role, true), role.code).toMatch(/[؀-ۿ]/);
    expect(getOperationalRoleName({ code: "SOMETHING_CUSTOM", name: "Our Own Role" }, true)).toBe("Our Own Role");
  });
  it("names the three products", () => {
    expect(["EXECUTIVE", "PMO", "PROJECT"].map(code => productLabel(code, true))).toEqual(["المستوى التنفيذي", "مكتب إدارة المشاريع", "إدارة المشروع"]);
    expect(productLabel("PROJECT", false)).toBe("PROJECT");
  });
});

describe("the two permissions whose meaning the owner defined", () => {
  it("names tenant.manage and executive.read in Arabic, as the owner worded them", () => {
    expect(permissionLabel("tenant.manage", "Manage the company", true)).toBe("إدارة الشركة");
    expect(permissionLabel("executive.read", "Senior management dashboard", true)).toBe("لوحة الإدارة العليا");
    expect(permissionNote("tenant.manage", true)).toBe("المستخدمون والإعدادات والاشتراك في الشركة. لمدير النظام في الشركة فقط.");
    expect(permissionNote("executive.read", true)).toBe("للاطلاع فقط. للمدير العام ولرئيس إدارة المشاريع.");
  });
  it("names them in English with the same meaning", () => {
    expect(permissionLabel("tenant.manage", "Manage the company", false)).toBe("Manage the company");
    expect(permissionLabel("executive.read", "Senior management dashboard", false)).toBe("Senior management dashboard");
    expect(permissionNote("tenant.manage", false)).toBe("The company's users, settings and subscription. For the company's system administrator only.");
    expect(permissionNote("executive.read", false)).toBe("View only. For the general manager and the head of project management.");
  });
  it("never shows the raw code as the name, and the old Arabic name is gone", () => {
    for (const code of ["tenant.manage", "executive.read"]) {
      expect(permissionLabel(code, code, true)).not.toBe(code);
      expect(permissionLabel(code, code, true)).toMatch(/[؀-ۿ]/);
      expect(permissionNote(code, true)).not.toContain(code);
      expect(permissionNote(code, false)).not.toContain(code);
    }
    expect(permissionLabel("executive.read", "x", true)).not.toContain("عرض المستوى التنفيذي");
  });
  it("has a note only for the two permissions the owner defined", () => {
    expect(permissionNote("project.read", true)).toBeUndefined();
    expect(permissionNote("project.read", false)).toBeUndefined();
  });
  it("uses the English names the server catalogue stores, so the English page and the API agree", () => {
    const db = readFileSync(join(__dirname, "..", "..", "..", "server", "db.ts"), "utf8");
    expect(db).toContain('{ code: "tenant.manage", name: "Manage the company", productCode: "EXECUTIVE" as const }');
    expect(db).toContain('{ code: "executive.read", name: "Senior management dashboard", productCode: "EXECUTIVE" as const }');
  });
});

describe("no screen prints a status code straight from a row", () => {
  const dirs = [join(__dirname, "..", "pages"), join(__dirname, "..", "components")];
  const files = dirs.flatMap(dir => readdirSync(dir).filter(name => /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)).map(name => ({ name, source: readFileSync(join(dir, name), "utf8") })));
  it("scans the screens (the scan is not vacuous)", () => { expect(files.length).toBeGreaterThan(60); });
  it("passes every row's status, stage, health and movement type through enumLabel (or a screen's own map)", () => {
    // text position in JSX ( >{x.status} or · {x.status} ) or inside a template literal shown to the reader (${x.status})
    const raw = /(?:[>·]\s*\{(?!t\.)[\w.?]+\.(?:status|lifecycleStage|transactionType)\}|\$\{(?!t\.)[\w.?]+\.(?:status|lifecycleStage|transactionType)\}|:\s*(?!t\.)[\w.?]+\.(?:status|lifecycleStage|transactionType)\}|<option[^>]*>\{stage\}<)/; // `{t.status}` is the word "Status", not a value
    const searchOnly = /\.filter\(/; // a search box matches against the codes; it displays nothing
    const offenders = files.flatMap(({ name, source }) => source.split("\n").flatMap((line, index) => (raw.test(line) && !searchOnly.test(line) ? [`${name}:${index + 1}`] : [])));
    expect(offenders).toEqual([]);
  });
});
