/** @vitest-environment node */
// Static check: a permission's raw code is never visible text on a screen. The role forms show the owner's name for tenant.manage and executive.read
// (and every other permission's name); the code stays in a title attribute, as role codes do (arabicLabels.test.tsx). Reads source and the TypeScript
// syntax tree, so it runs without a browser.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const OWNER_NAMED_CODES = ["tenant.manage", "executive.read"];
const parse = (source: string, name: string) => ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** Every place a file prints a permission code as text: a JSX text node that is the code, `{permission.code}` as a child, or a string literal child naming one of the owner's codes. */
function visiblePermissionCodes(source: string, name: string) {
  const file = parse(source, name);
  const found: string[] = [];
  const report = (node: ts.Node, what: string) => found.push(`${name}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1} ${what}`);
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && OWNER_NAMED_CODES.includes(node.text.trim())) report(node, `${node.text.trim()} as text`);
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const expression = node.expression;
      if (ts.isPropertyAccessExpression(expression) && expression.name.text === "code" && ts.isIdentifier(expression.expression) && expression.expression.text === "permission") report(node, "permission.code as a child");
      if ((ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) && OWNER_NAMED_CODES.includes(expression.text)) report(node, `${expression.text} as a child`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe("a permission code is never visible text", () => {
  it("detects a code printed as text or as a child, and not one kept in a title attribute (the detector is not vacuous)", () => {
    expect(visiblePermissionCodes('const a = <span>{permission.code}</span>;', "fixture.tsx")).toHaveLength(1);
    expect(visiblePermissionCodes('const a = <span>tenant.manage</span>;', "fixture.tsx")).toHaveLength(1);
    expect(visiblePermissionCodes('const a = <span>{"executive.read"}</span>;', "fixture.tsx")).toHaveLength(1);
    expect(visiblePermissionCodes('const a = <label title={permission.code}><span>{permissionLabel(permission.code, permission.name, true)}</span></label>;', "fixture.tsx")).toEqual([]);
  });
  it("no page or component prints a permission code or one of the owner's two codes as text", () => {
    const dirs = [join(__dirname, "..", "pages"), join(__dirname, "..", "components")];
    const offenders = dirs.flatMap(dir => readdirSync(dir).filter(name => /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)).flatMap(name => visiblePermissionCodes(readFileSync(join(dir, name), "utf8"), name)));
    expect(offenders).toEqual([]);
  });
  it("the role forms keep each permission's code in a title attribute, on the checkbox label", () => {
    const source = readFileSync(join(__dirname, "..", "pages", "TenantAdministration.tsx"), "utf8");
    expect(source.match(/<label key=\{permission\.code\} title=\{permission\.code\}/g)?.length).toBe(2);
    expect(source).not.toMatch(/\{permission\.code\}<\/span>/);
  });
});
