/** @vitest-environment node */
// Missing-translation check for the three interface languages (Arabic, English, Urdu). The screens build their text in one of two forms,
// and this test reads the client source and checks both:
//   1. a dictionary `const t = pickLanguage(language, { ar: {…}, en: {…}, ur: {…} })`: a key that is absent from one language fails, and so
//      does a key read as `t.<key>` that is absent from one language;
//   2. any object literal that has an `ar` and an `en` property must also have `ur`, with the same keys (nested objects are compared the same
//      way). Such an object is a bilingual text, and it is the form the error catalogue and the label maps use.
// A two-language dictionary `isArabic ? {…} : {…}` fails: it cannot show Urdu. A value that is an empty or blank string fails. Values that are
// not plain strings (a variable, a call) cannot be read statically and are counted, not judged.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const LANGUAGE_SIDES = ["ar", "en", "ur"] as const;
type Side = (typeof LANGUAGE_SIDES)[number];
type Finding = { file: string; line: number; problem: string; keys?: string[] };
type Dictionary = { file: string; line: number; name: string; sides: Record<Side, ts.ObjectLiteralExpression> };

const CLIENT_SRC = join(__dirname, "..");

const keyOf = (property: ts.ObjectLiteralElementLike, sourceFile: ts.SourceFile) => (property.name ? property.name.getText(sourceFile).replace(/^["']|["']$/g, "") : "");

/** key → its string value, or null when the value is not a plain string literal (then it is not judged). */
function stringValues(object: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile) {
  const map = new Map<string, string | null>();
  for (const property of object.properties) {
    if (!property.name) continue;
    const value = ts.isPropertyAssignment(property) ? property.initializer : undefined;
    map.set(keyOf(property, sourceFile), value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) ? value.text : null);
  }
  return map;
}

/** The object literal under `key`, when that property holds one. */
const objectValue = (object: ts.ObjectLiteralExpression, key: string, sourceFile: ts.SourceFile) => {
  const property = object.properties.find(candidate => keyOf(candidate, sourceFile) === key);
  return property && ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer) ? property.initializer : undefined;
};

/** Compares the three sides of one bilingual object: the keys that are not in every language, then the nested objects, then the empty values. */
function compareSides(sides: Record<Side, ts.ObjectLiteralExpression>, sourceFile: ts.SourceFile, fileName: string, line: number, path: string, findings: Finding[]) {
  const keys = new Map<string, Side[]>();
  for (const side of LANGUAGE_SIDES) for (const key of Array.from(stringValues(sides[side], sourceFile).keys())) keys.set(key, [...(keys.get(key) ?? []), side]);
  for (const [key, present] of Array.from(keys)) {
    const missing = LANGUAGE_SIDES.filter(side => !present.includes(side));
    if (missing.length) findings.push({ file: fileName, line, problem: `${path}${key} is missing in ${missing.join(" and ")}` });
  }
  for (const key of Array.from(keys.keys())) {
    const nested = LANGUAGE_SIDES.map(side => objectValue(sides[side], key, sourceFile));
    if (nested.every(Boolean)) compareSides({ ar: nested[0]!, en: nested[1]!, ur: nested[2]! }, sourceFile, fileName, line, `${path}${key}.`, findings);
  }
  for (const side of LANGUAGE_SIDES) {
    const empty = Array.from(stringValues(sides[side], sourceFile)).filter(([, value]) => value !== null && value.trim() === "").map(([key]) => key);
    if (empty.length) findings.push({ file: fileName, line, problem: `${path}empty value in ${side}`, keys: empty });
  }
}

/** Every dictionary in one source file, and every `t.<key>` read that resolves to one of them (by the scope that declares `t`). */
export function scanSource(source: string, fileName: string) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const dictionaries: Dictionary[] = [];
  const byDeclaration = new Map<ts.Node, Dictionary>();
  const findings: Finding[] = [];
  const lineOf = (node: ts.Node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const collect = (node: ts.Node) => {
    // pickLanguage(language, { ar, en, ur }) assigned to a name: a screen dictionary
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === "pickLanguage") {
      const argument = node.initializer.arguments[1];
      if (argument && ts.isObjectLiteralExpression(argument)) {
        const sides = LANGUAGE_SIDES.map(side => objectValue(argument, side, sourceFile));
        if (sides.every(Boolean)) {
          const dictionary: Dictionary = { file: fileName, line: lineOf(node), name: node.name.text, sides: { ar: sides[0]!, en: sides[1]!, ur: sides[2]! } };
          dictionaries.push(dictionary);
          byDeclaration.set(node, dictionary);
        }
      }
    }
    // a two-language dictionary `isArabic ? {…} : {…}`: it cannot show Urdu
    if (ts.isConditionalExpression(node) && ts.isIdentifier(node.condition) && node.condition.text === "isArabic" && ts.isObjectLiteralExpression(node.whenTrue) && ts.isObjectLiteralExpression(node.whenFalse)) {
      findings.push({ file: fileName, line: lineOf(node), problem: "two-language dictionary (isArabic ? {…} : {…}): it has no Urdu side; use pickLanguage" });
    }
    // every bilingual object must carry the Urdu side too, with the same keys
    if (ts.isObjectLiteralExpression(node)) {
      const names = node.properties.map(property => keyOf(property, sourceFile));
      if (names.includes("ar") && names.includes("en")) {
        const ar = objectValue(node, "ar", sourceFile), en = objectValue(node, "en", sourceFile), ur = objectValue(node, "ur", sourceFile);
        if (!names.includes("ur")) findings.push({ file: fileName, line: lineOf(node), problem: 'object with "ar" and "en" has no "ur"' });
        else if (ar && en && ur) compareSides({ ar, en, ur }, sourceFile, fileName, lineOf(node), "", findings);
        else compareSides({ ar: ar ?? node, en: en ?? node, ur: ur ?? node }, sourceFile, fileName, lineOf(node), "", findings);
      }
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

  for (const read of reads) {
    const missing = LANGUAGE_SIDES.filter(side => !read.dictionary.sides[side].properties.some(property => keyOf(property, sourceFile) === read.key));
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

describe("every screen dictionary and bilingual text has the same keys in Arabic, English and Urdu", () => {
  const client = scanClient();

  it("reads the screen dictionaries and the t.<key> reads that use them (the check is not vacuous)", () => {
    expect(client.dictionaries.length).toBeGreaterThan(40);
    expect(client.reads).toBeGreaterThan(800);
  });
  it("no two-language dictionary is left (every isArabic ? {…} : {…} has become pickLanguage with an Urdu side)", () => {
    expect(client.findings.filter(finding => /two-language dictionary/.test(finding.problem))).toEqual([]);
  });
  it("no key is present in one language and absent from another", () => {
    expect(client.findings.filter(finding => /is missing in/.test(finding.problem) && !/is read but/.test(finding.problem))).toEqual([]);
  });
  it("every key read as t.<key> exists in Arabic, English and Urdu", () => {
    expect(client.findings.filter(finding => /is read but missing/.test(finding.problem))).toEqual([]);
  });
  it("every object with an ar and an en property also has ur", () => {
    expect(client.findings.filter(finding => /has no "ur"/.test(finding.problem))).toEqual([]);
  });
  it("no value is an empty or blank string", () => {
    expect(client.findings.filter(finding => /empty value/.test(finding.problem))).toEqual([]);
  });
});

describe("the check fails on each kind of gap (fixtures, so the check cannot pass by doing nothing)", () => {
  const problems = (source: string) => scanSource(source, "fixture.tsx").findings.map(finding => finding.problem);

  it("a complete dictionary, with every read present in all three languages, has no findings", () => {
    const scanned = scanSource('function A({ language }: { language: Language }) { const t = pickLanguage(language, { ar: { title: "عنوان", save: "حفظ" }, en: { title: "Title", save: "Save" }, ur: { title: "عنوان", save: "محفوظ کریں" } }); return <p>{t.title}{t.save}</p>; }', "fixture.tsx");
    expect(scanned.dictionaries).toHaveLength(1);
    expect(scanned.findings).toEqual([]);
  });
  it("a key removed from the Urdu side is reported", () => {
    expect(problems('const t = pickLanguage(language, { ar: { title: "عنوان", save: "حفظ" }, en: { title: "Title", save: "Save" }, ur: { title: "عنوان" } });')).toEqual(['save is missing in ur']);
  });
  it("a key removed from the English side is reported", () => {
    expect(problems('const t = pickLanguage(language, { ar: { title: "عنوان", save: "حفظ" }, en: { title: "Title" }, ur: { title: "عنوان", save: "محفوظ" } });')).toEqual(['save is missing in en']);
  });
  it("a key removed from the Arabic side is reported", () => {
    expect(problems('const t = pickLanguage(language, { ar: { title: "عنوان" }, en: { title: "Title", save: "Save" }, ur: { title: "عنوان", save: "محفوظ" } });')).toEqual(['save is missing in ar']);
  });
  it("a key read in the scope of a dictionary but absent from one language is reported", () => {
    const scanned = scanSource('function A() { const t = pickLanguage(language, { ar: { title: "عنوان" }, en: { title: "Title" }, ur: { title: "عنوان" } }); return <p>{t.title}{t.subtitle}</p>; }', "fixture.tsx");
    expect(scanned.findings.map(finding => finding.problem)).toEqual(["t.subtitle is read but missing in ar and en and ur"]);
  });
  it("a bilingual object with no Urdu side is reported", () => {
    expect(problems('const m = { ar: "عنوان", en: "Title" };')).toEqual(['object with "ar" and "en" has no "ur"']);
  });
  it("a two-language dictionary (isArabic ? {…} : {…}) is reported", () => {
    expect(problems('const t = isArabic ? { title: "عنوان" } : { title: "Title" };')).toEqual(["two-language dictionary (isArabic ? {…} : {…}): it has no Urdu side; use pickLanguage"]);
  });
  it("an empty or blank value is reported, in any language", () => {
    expect(problems('const t = pickLanguage(language, { ar: { title: "عنوان", note: "   " }, en: { title: "", note: "Note" }, ur: { title: "عنوان", note: "ملاحظہ" } });')).toEqual(['empty value in ar', 'empty value in en']);
  });
  it("a read that resolves to a different object (shadowed by a parameter) is not judged against the dictionary", () => {
    expect(problems('const t = pickLanguage(language, { ar: { title: "عنوان" }, en: { title: "Title" }, ur: { title: "عنوان" } }); function B(t: { other: string }) { return t.other; }')).toEqual([]);
  });
  it("a nested bilingual value with a key missing in Urdu is reported with its path", () => {
    expect(problems('const e = { ar: { errors: { a: "x", b: "y" } }, en: { errors: { a: "x", b: "y" } }, ur: { errors: { a: "x" } } };')).toEqual(["errors.b is missing in ur"]);
  });
});
