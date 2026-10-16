/** @vitest-environment node */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { operationalPermissionCatalog, operationalRoleDefinitions } from "../../../server/domain/operationalRoles";
import { enumLabel, hasArabicLabel, hasArabicPermission, permissionLabel, productLabel } from "./labels";
import { getOperationalRoleName } from "./operationalRolePresentation";

const schema = readFileSync(join(__dirname, "..", "..", "..", "drizzle", "schema.ts"), "utf8");
const STATUS_LIKE = ["status", "lifecycleStage", "transactionType", "receiptMode", "severity", "priority", "outcome", "employmentStatus", "escalationStatus", "fromStatus", "toStatus", "attendanceStatus", "sourceType"];
const enumValues = (column: string) => Array.from(schema.matchAll(new RegExp(`mysqlEnum\\("${column}",\\s*\\[([^\\]]*)\\]`, "g"))).flatMap(match => Array.from(match[1].matchAll(/"([^"]+)"/g), value => value[1]));

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
