/** @vitest-environment node */
// Visible text outside a translation dictionary. A component or a shared helper in client/src/components and client/src/lib must not write
// an English (Latin) sentence straight into its JSX (`<p>Save</p>`), into a visible attribute (`aria-label="Close"`), or into a branch of a
// child expression (`{ok ? "Saved" : "Failed"}`). The text belongs in a dictionary with ar, en and ur (`pickLanguage(language, { ar, en, ur })`)
// or in a `useUiText()` call, which is also a dictionary. The check reads the TypeScript source with the compiler API, so it sees what the
// browser would show, not the words in a comment or a class name.
// Scope: client/src/components and client/src/lib, excluding tests. client/src/pages is not scanned yet: those files are owned by other
// work orders and still hold English JSX; they are listed as open in docs/TRANSLATION_REVIEW.md, and the scope widens when they are done.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/** Latin text a screen may show without a dictionary. Each entry names the thing and the reason. */
const EXCEPTIONS: Record<string, string> = {
  // The product name is written the same in every language (the brand, docs/DASHIO_BRAND_NAMING.md).
  Dashio: "brand name, kept in Latin in every language",
  // Technical codes the glossary keeps in Latin (docs/GLOSSARY_AR.md rule 5); they are not translated words.
  PMO: "acronym kept in Latin by the glossary (rule 5)",
  // Symbols and separators that carry no word.
  "·": "separator",
};

const VISIBLE_ATTRIBUTES = new Set(["title", "aria-label", "placeholder", "alt", "label", "aria-description", "aria-placeholder"]);
const LATIN_WORD = /[A-Za-z]{2,}/;

type Finding = { file: string; line: number; text: string };

const CLIENT_SRC = join(__dirname, "..");

/** The source files this check covers: components and lib, not the tests. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) ? [path] : [];
  });
}

/** True when the literal sits inside a dictionary: an object that has an `ar` or `en` key, or the argument of `pickLanguage` or `useUiText`. */
function insideDictionary(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (ts.isObjectLiteralExpression(current) && current.properties.some(property => ts.isPropertyAssignment(property) && ["ar", "en"].includes(property.name.getText(sourceFile).replace(/^["']|["']$/g, "")))) return true;
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression) && ["pickLanguage", "ut"].includes(current.expression.text)) return true;
  }
  return false;
}

const isException = (text: string) => Object.keys(EXCEPTIONS).some(exception => text.trim() === exception || (exception === "Dashio" && text.includes("Dashio")));

/** The Latin visible text in one source file, outside every dictionary. */
export function scanVisibleText(source: string, fileName: string): Finding[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings: Finding[] = [];
  const lineOf = (node: ts.Node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const report = (node: ts.Node, text: string) => {
    if (!LATIN_WORD.test(text) || isException(text) || insideDictionary(node, sourceFile)) return;
    findings.push({ file: fileName, line: lineOf(node), text: text.trim().slice(0, 100) });
  };

  const visit = (node: ts.Node) => {
    // 1. text between tags: <p>Save</p>
    if (ts.isJsxText(node)) report(node, node.text);

    // 2. a visible attribute holding a plain string: aria-label="Close"
    if (ts.isJsxAttribute(node) && VISIBLE_ATTRIBUTES.has(node.name.getText(sourceFile)) && node.initializer) {
      const value = ts.isStringLiteral(node.initializer) ? node.initializer : ts.isJsxExpression(node.initializer) && node.initializer.expression && (ts.isStringLiteral(node.initializer.expression) || ts.isNoSubstitutionTemplateLiteral(node.initializer.expression)) ? node.initializer.expression : undefined;
      if (value) report(value, value.text);
    }

    // 3. a string in a child expression: {ok ? "Saved" : "Failed"}, {label || "Open"}
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const collect = (expression: ts.Expression): void => {
        if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) report(expression, expression.text);
        else if (ts.isConditionalExpression(expression)) { collect(expression.whenTrue); collect(expression.whenFalse); }
        else if (ts.isBinaryExpression(expression) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(expression.operatorToken.kind)) { collect(expression.left); collect(expression.right); }
        else if (ts.isParenthesizedExpression(expression)) collect(expression.expression);
      };
      collect(node.expression);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function scanClient() {
  const findings: Finding[] = [];
  let files = 0;
  for (const dir of [join(CLIENT_SRC, "components"), join(CLIENT_SRC, "lib")]) {
    for (const path of sourceFiles(dir)) {
      files += 1;
      findings.push(...scanVisibleText(readFileSync(path, "utf8"), relative(CLIENT_SRC, path).split(sep).join("/")));
    }
  }
  return { findings, files };
}

describe("visible text in components and lib is in a dictionary, not written straight into JSX", () => {
  const client = scanClient();

  it("reads the component and lib sources (the check is not vacuous)", () => {
    expect(client.files).toBeGreaterThan(80);
  });

  it("no English sentence is written directly in JSX, in a visible attribute, or in a child expression", () => {
    expect(client.findings.map(finding => `${finding.file}:${finding.line} ${finding.text}`)).toEqual([]);
  });
});

describe("the check fails on each kind of bad string (fixtures, so the check cannot pass by doing nothing)", () => {
  const texts = (source: string) => scanVisibleText(source, "fixture.tsx").map(finding => finding.text);

  it("a string in a dictionary is not visible text written in the JSX", () => {
    expect(texts('const t = pickLanguage(language, { ar: { save: "حفظ" }, en: { save: "Save" }, ur: { save: "محفوظ کریں" } }); const x = <button>{t.save}</button>;')).toEqual([]);
  });

  it("English text between tags is reported", () => {
    expect(texts("const x = <button>Save changes</button>;")).toEqual(["Save changes"]);
  });

  it("an English visible attribute is reported", () => {
    expect(texts('const x = <button aria-label="Close" />;')).toEqual(["Close"]);
  });

  it("an English branch of a child expression is reported", () => {
    expect(texts('const x = <p>{ok ? "Saved" : "Failed"}</p>;')).toEqual(["Saved", "Failed"]);
  });

  it("a class name and an Arabic label are not reported", () => {
    expect(texts('const x = <div className="flex font-semibold"><p>حفظ</p></div>;')).toEqual([]);
  });

  it("the named exceptions are not reported", () => {
    expect(texts('const x = <img alt="Dashio" />;')).toEqual([]);
  });
});
