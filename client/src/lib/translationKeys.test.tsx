/** @vitest-environment node */
// Missing-translation check. The app builds its screen text as `const t = isArabic ? { … } : { … }` inside each screen (there is no
// separate dictionary file), so this test reads the client source and checks every such dictionary for the supported languages (Arabic
// and English; a third language is a later order and must be added here when it comes):
//   1. a key present on one side only fails;
//   2. a key read as `t.<key>` in the scope where the dictionary is declared, and absent from one side, fails;
//   3. a value that is an empty or blank string fails.
// Values that are not plain strings (a variable, a call) cannot be read statically and are counted, not judged.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

type Side = "ar" | "en";
type Dictionary = { file: string; line: number; name: string; ar: Map<string, string | null>; en: Map<string, string | null> };
type Finding = { file: string; line: number; problem: string; keys?: string[] };

const CLIENT_SRC = join(__dirname, "..");
const isDictionaryPair = (init: ts.Expression | undefined): init is ts.ConditionalExpression =>
  !!init && ts.isConditionalExpression(init) && ts.isIdentifier(init.condition) && init.condition.text === "isArabic" &&
  ts.isObjectLiteralExpression(init.whenTrue) && ts.isObjectLiteralExpression(init.whenFalse);

/** key → its string value, or null when the value is not a plain string literal (then it is not judged). */
function readObject(object: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile) {
  const map = new Map<string, string | null>();
  for (const property of object.properties) {
    if (!property.name) continue;
    const key = property.name.getText(sourceFile).replace(/^["']|["']$/g, "");
    const value = ts.isPropertyAssignment(property) ? property.initializer : undefined;
    map.set(key, value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) ? value.text : null);
  }
  return map;
}

/** Every dictionary in one source file, and every `t.<key>` read that resolves to one of them (by the scope that declares `t`). */
export function scanSource(source: string, fileName: string) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const dictionaries: Dictionary[] = [];
  const byDeclaration = new Map<ts.Node, Dictionary>();
  const lineOf = (node: ts.Node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isDictionaryPair(node.initializer)) {
      const dictionary: Dictionary = { file: fileName, line: lineOf(node), name: node.name.text, ar: readObject(node.initializer.whenTrue as ts.ObjectLiteralExpression, sourceFile), en: readObject(node.initializer.whenFalse as ts.ObjectLiteralExpression, sourceFile) };
      dictionaries.push(dictionary);
      byDeclaration.set(node, dictionary);
    }
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);

  /** The dictionary a name refers to at this point: the nearest enclosing declaration of that name, or null when it is shadowed by something else. */
  const resolve = (node: ts.Node, name: string): Dictionary | null => {
    for (let current = node.parent; current; current = current.parent) {
      if (ts.isFunctionLike(current) && current.parameters.some(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === name)) return null;
      const statements = ts.isBlock(current) || ts.isSourceFile(current) || ts.isModuleBlock(current) || ts.isCaseClause(current) || ts.isDefaultClause(current) ? current.statements : undefined;
      for (const statement of statements ?? []) {
        if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return byDeclaration.get(declaration) ?? null;
        }
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return null;
      }
    }
    return null;
  };

  const reads: Array<{ dictionary: Dictionary; key: string; line: number }> = [];
  const collectReads = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t") {
      const dictionary = resolve(node, "t");
      if (dictionary) reads.push({ dictionary, key: node.name.text, line: lineOf(node) });
    }
    ts.forEachChild(node, collectReads);
  };
  collectReads(sourceFile);

  const findings: Finding[] = [];
  for (const dictionary of dictionaries) {
    const onlyAr = Array.from(dictionary.ar.keys()).filter(key => !dictionary.en.has(key));
    const onlyEn = Array.from(dictionary.en.keys()).filter(key => !dictionary.ar.has(key));
    if (onlyAr.length) findings.push({ file: fileName, line: dictionary.line, problem: `"${dictionary.name}": key only in Arabic (missing in English)`, keys: onlyAr });
    if (onlyEn.length) findings.push({ file: fileName, line: dictionary.line, problem: `"${dictionary.name}": key only in English (missing in Arabic)`, keys: onlyEn });
    for (const [side, map] of [["ar", dictionary.ar], ["en", dictionary.en]] as Array<[Side, Map<string, string | null>]>) {
      const empty = Array.from(map).filter(([, value]) => value !== null && value.trim() === "").map(([key]) => key);
      if (empty.length) findings.push({ file: fileName, line: dictionary.line, problem: `"${dictionary.name}": empty value in ${side}`, keys: empty });
    }
  }
  for (const read of reads) {
    const missing = (["ar", "en"] as Side[]).filter(side => !(side === "ar" ? read.dictionary.ar : read.dictionary.en).has(read.key));
    if (missing.length) findings.push({ file: fileName, line: read.line, problem: `t.${read.key} is read but missing in ${missing.join(" and ")}` });
  }
  return { dictionaries, reads: reads.length, findings };
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function scanClient() {
  const dictionaries: Dictionary[] = [];
  let reads = 0;
  const findings: Finding[] = [];
  for (const path of sourceFiles(CLIENT_SRC)) {
    const name = relative(CLIENT_SRC, path).split(sep).join("/");
    const scanned = scanSource(readFileSync(path, "utf8"), name);
    dictionaries.push(...scanned.dictionaries);
    reads += scanned.reads;
    findings.push(...scanned.findings);
  }
  return { dictionaries, reads, findings };
}

describe("every screen dictionary has the same keys in Arabic and English", () => {
  const client = scanClient();

  it("reads the screen dictionaries and the t.<key> reads that use them (the check is not vacuous)", () => {
    expect(client.dictionaries.length).toBeGreaterThan(50);
    expect(client.reads).toBeGreaterThan(1000);
  });
  it("no key is present in one language and absent from the other", () => {
    expect(client.findings.filter(finding => /only in/.test(finding.problem))).toEqual([]);
  });
  it("every key read as t.<key> exists in both languages", () => {
    expect(client.findings.filter(finding => /is read but missing/.test(finding.problem))).toEqual([]);
  });
  it("no value is an empty or blank string", () => {
    expect(client.findings.filter(finding => /empty value/.test(finding.problem))).toEqual([]);
  });
});

describe("the check fails on each kind of gap (fixtures, so the check cannot pass by doing nothing)", () => {
  it("a complete dictionary, with every read present on both sides, has no findings", () => {
    const scanned = scanSource('function A({ isArabic }: { isArabic: boolean }) { const t = isArabic ? { title: "عنوان", save: "حفظ" } : { title: "Title", save: "Save" }; return <p>{t.title}{t.save}</p>; }', "fixture.tsx");
    expect(scanned.dictionaries).toHaveLength(1);
    expect(scanned.findings).toEqual([]);
  });
  it("a key removed from the English side is reported", () => {
    const scanned = scanSource('const t = isArabic ? { title: "عنوان", save: "حفظ" } : { title: "Title" };', "fixture.tsx");
    expect(scanned.findings.map(finding => finding.problem)).toEqual(['"t": key only in Arabic (missing in English)']);
  });
  it("a key removed from the Arabic side is reported", () => {
    const scanned = scanSource('const t = isArabic ? { title: "عنوان" } : { title: "Title", save: "Save" };', "fixture.tsx");
    expect(scanned.findings.map(finding => finding.problem)).toEqual(['"t": key only in English (missing in Arabic)']);
  });
  it("a key read in the scope of a dictionary but absent from one side is reported", () => {
    const scanned = scanSource('function A() { const t = isArabic ? { title: "عنوان" } : { title: "Title" }; return <p>{t.title}{t.subtitle}</p>; }', "fixture.tsx");
    expect(scanned.findings.map(finding => finding.problem)).toEqual(["t.subtitle is read but missing in ar and en"]);
  });
  it("an empty or blank value is reported, on either side", () => {
    const scanned = scanSource('const t = isArabic ? { title: "عنوان", note: "   " } : { title: "", note: "Note" };', "fixture.tsx");
    expect(scanned.findings.map(finding => finding.problem)).toEqual(['"t": empty value in ar', '"t": empty value in en']);
  });
  it("a read that resolves to a different object (shadowed by a parameter) is not judged against the dictionary", () => {
    const scanned = scanSource('const t = isArabic ? { title: "عنوان" } : { title: "Title" }; function B(t: { other: string }) { return t.other; }', "fixture.tsx");
    expect(scanned.findings).toEqual([]);
  });
});
