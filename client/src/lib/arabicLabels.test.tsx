/** @vitest-environment node */
// Static checks for the Arabic interface: role codes never show as visible text, the Arabic and English dictionaries of the touched screens have the same keys,
// and an Arabic branch never prints the English heading "Master Plan". They read source text and the TypeScript syntax tree, so they run without a browser.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { operationalRoleDefinitions } from "../../../server/domain/operationalRoles";
import { getOperationalRoleName } from "./operationalRolePresentation";

const ARABIC = /[؀-ۿ]/;
const RAW_CODE = /^[A-Z][A-Z0-9_]*$/;
const read = (path: string) => readFileSync(path, "utf8");
const pages = (name: string) => join(__dirname, "..", "pages", name);

/** A role code printed as visible text: as an element's content, after a middle dot, or as an option's label. A code inside a title attribute does not match. */
const VISIBLE_ROLE_CODE = /(?:>\s*\{role\.code\}\s*<|·\s*\{role\.code\}|\{role\.code\}\s*<\/option>)/;

const parse = (source: string, name: string) => ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** Every `pickLanguage(language, { ar, en, ur })` in a file, as the key lists of its Arabic, English and Urdu objects, with the line it starts on. */
function dictionaryPairs(source: string, name: string) {
  const file = parse(source, name);
  const pairs: Array<{ line: number; ar: string[]; en: string[]; ur: string[] }> = [];
  const keysOf = (object: ts.ObjectLiteralExpression) => object.properties.map(property => (property.name ? property.name.getText(file).replace(/^["']|["']$/g, "") : ""));
  const sideOf = (object: ts.ObjectLiteralExpression, key: string) => {
    const property = object.properties.find(candidate => candidate.name?.getText(file).replace(/^["']|["']$/g, "") === key);
    return property && ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer) ? property.initializer : undefined;
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "pickLanguage" && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
      const texts = node.arguments[1];
      const ar = sideOf(texts, "ar"), en = sideOf(texts, "en"), ur = sideOf(texts, "ur");
      if (ar && en && ur) pairs.push({ line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, ar: keysOf(ar), en: keysOf(en), ur: keysOf(ur) });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return pairs;
}

/** The text a file shows in Arabic mode: the string literals inside the Arabic side of `isArabic ? … : …`, and every `ar: "…"` property. */
function arabicStrings(source: string, name: string) {
  const file = parse(source, name);
  const found: string[] = [];
  const literals = (node: ts.Node) => {
    const walk = (inner: ts.Node) => {
      if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) found.push(inner.text);
      ts.forEachChild(inner, walk);
    };
    walk(node);
  };
  const visit = (node: ts.Node) => {
    if (ts.isConditionalExpression(node) && ts.isIdentifier(node.condition) && node.condition.text === "isArabic") literals(node.whenTrue);
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "ar" && ts.isStringLiteral(node.initializer)) found.push(node.initializer.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

const SCREENS_TOUCHED = ["TenantAdministration.tsx", "ProjectMasterPlan.tsx", "ProjectControls.tsx"];

describe("role names in Arabic mode", () => {
  const roles = [...operationalRoleDefinitions.map(({ code, name }) => ({ code, name })), { code: "TENANT_OWNER", name: "Tenant Owner" }];
  for (const role of roles) {
    it(`${role.code} shows an Arabic name, never its code`, () => {
      const label = getOperationalRoleName(role, true);
      expect(label).toMatch(ARABIC);
      expect(label).not.toMatch(RAW_CODE);
    });
    it(`${role.code} keeps an English name in English mode`, () => {
      expect(getOperationalRoleName(role, false)).not.toMatch(ARABIC);
    });
  }
});

describe("role codes are never visible text", () => {
  it("detects a code printed as text, and not one kept in a title attribute (the detector is not vacuous)", () => {
    expect(VISIBLE_ROLE_CODE.test('<span dir="ltr">{role.code}</span>')).toBe(true);
    expect(VISIBLE_ROLE_CODE.test("{displayRoleName(role)} · {role.code}</option>")).toBe(true);
    expect(VISIBLE_ROLE_CODE.test('<p className="font-semibold" title={role.code}>{displayRoleName(role)}</p>')).toBe(false);
  });
  it("no page or component prints a role code as text", () => {
    const dirs = [join(__dirname, "..", "pages"), join(__dirname, "..", "components")];
    const offenders = dirs.flatMap(dir => readdirSync(dir).filter(name => /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)).filter(name => VISIBLE_ROLE_CODE.test(read(join(dir, name)))));
    expect(offenders).toEqual([]);
  });
  it("the admin screen keeps the code in a title attribute, so it is still reachable", () => {
    expect(read(pages("TenantAdministration.tsx"))).toContain("title={role.code}");
  });
});

describe("no translation key is missing from one language", () => {
  it.each(SCREENS_TOUCHED)("%s: the Arabic, English and Urdu dictionaries have the same keys", name => {
    const pairs = dictionaryPairs(read(pages(name)), name);
    expect(pairs.length, `${name} has a pickLanguage dictionary`).toBeGreaterThan(0);
    const gaps = pairs.map(({ line, ar, en, ur }) => ({ line, missing: [...ar.filter(key => !en.includes(key) || !ur.includes(key)), ...en.filter(key => !ar.includes(key) || !ur.includes(key)), ...ur.filter(key => !ar.includes(key) || !en.includes(key))] })).filter(gap => gap.missing.length);
    expect(gaps).toEqual([]);
  });
  it("the key check is not vacuous: it reports a key present on one side only", () => {
    const pairs = dictionaryPairs('const t = pickLanguage(language, { ar: { a: "x", b: "y" }, en: { a: "x", c: "z" }, ur: { a: "x", b: "y" } });', "fixture.tsx");
    expect(pairs).toEqual([{ line: 1, ar: ["a", "b"], en: ["a", "c"], ur: ["a", "b"] }]);
  });
});

describe("the Arabic side never prints the English heading Master Plan", () => {
  it.each([...SCREENS_TOUCHED, "../../../shared/projectErrors.ts"])("%s", name => {
    const path = name.startsWith("..") ? join(__dirname, name) : pages(name);
    const strings = arabicStrings(read(path), name);
    expect(strings.filter(text => /Master Plan/.test(text))).toEqual([]);
  });
  it("the check reads the Arabic side and nothing else (not vacuous)", () => {
    expect(arabicStrings('const t = isArabic ? { title: "Master Plan" } : { title: "Master Plan" }; const m = { ar: "رمز Master Plan", en: "Master Plan" };', "fixture.tsx").filter(text => /Master Plan/.test(text))).toEqual(["Master Plan", "رمز Master Plan"]);
  });
});
