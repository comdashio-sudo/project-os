// D-66 (D-12 a): an Urdu text that is a copy of its English twin is an untranslated text. This reads a TypeScript source with the compiler API
// and returns every `ur` entry whose text is the same as the `en` entry beside it — in a dictionary object ({ en: {...}, ur: {...} }, key by key)
// or in an inline pick ({ ar, en, ur }). A text made only of the terms the glossary keeps in Latin (docs/GLOSSARY_AR.md rule 5: PMC, EVM, WBS…),
// of numbers or of symbols is not a copy: it is the same in every language by rule.
import * as ts from "typescript";

/** Words the glossary keeps in Latin in every language (rule 5), and file formats/units that are names, not words. */
export const LATIN_TERMS = new Set(["PMC", "PMO", "EVM", "TCPI", "FPAC", "PO", "GRN", "Primavera", "PowerPoint", "WBS", "BOQ", "CPI", "SPI", "BAC", "EAC", "ETC", "PV", "EV", "AC", "VAC", "SV", "CV", "QC", "NCR", "RFI", "WIR", "HSE", "KPI", "ID", "Excel", "CSV", "XLSX", "XER", "P6", "PDF", "DXF", "DWG", "PNG", "JPEG", "JPG", "GeoJSON", "SVG", "Dashio", "PROJECT", "OS", "SAR", "m", "m2", "m²", "km"]);

export type UrduCopy = { line: number; key: string; text: string };

const textOf = (node: ts.Node, source: ts.SourceFile): string | null => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return node.getText(source);
  return null;
};
/** `{...} as Record<…>`, `{...} satisfies …` and `( … )` are the same dictionary. */
const unwrap = (node: ts.Expression): ts.Expression => (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node);
const nameOf = (property: ts.ObjectLiteralElementLike, source: ts.SourceFile) => (property.name ? property.name.getText(source).replace(/^["']|["']$/g, "") : "");

/** True when the text carries no word that needs translating (only glossary terms, numbers, symbols, interpolations). */
export function isLanguageNeutral(text: string): boolean {
  const words = text.replace(/\$\{[^}]*\}/g, " ").match(/[A-Za-z][A-Za-z0-9²]*/g) ?? [];
  return words.every(word => LATIN_TERMS.has(word) || word.length === 1); // a single letter (an axis "X", a size "m") is a symbol
}

export function urduCopiesOf(sourceText: string, fileName = "file.tsx"): UrduCopy[] {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: UrduCopy[] = [];
  const add = (node: ts.Node, key: string, text: string) => { if (!isLanguageNeutral(text)) found.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, key, text: text.slice(0, 80) }); };
  const compare = (enNode: ts.Expression, urNode: ts.Expression, key: string) => {
    const en = unwrap(enNode), ur = unwrap(urNode);
    if (ts.isObjectLiteralExpression(en) && ts.isObjectLiteralExpression(ur)) {
      const english = new Map(en.properties.filter(ts.isPropertyAssignment).map(property => [nameOf(property, source), property.initializer]));
      for (const property of ur.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const twin = english.get(nameOf(property, source));
        if (twin) compare(twin, property.initializer, `${key}${key ? "." : ""}${nameOf(property, source)}`);
      }
      return;
    }
    if (ts.isArrayLiteralExpression(en) && ts.isArrayLiteralExpression(ur)) { // D-68: [label, formula] pairs are texts too
      ur.elements.forEach((element, index) => { const twin = en.elements[index]; if (twin) compare(twin, element, `${key}[${index}]`); });
      return;
    }
    const a = textOf(en, source), b = textOf(ur, source);
    if (a !== null && b !== null && a === b) add(ur, key, b);
    // D-68: `ur: englishDictionary` (the same name as `en`) is a whole dictionary copied by reference
    else if (a === null && b === null && (ts.isIdentifier(ur) || ts.isPropertyAccessExpression(ur)) && en.getText(source) === ur.getText(source)) found.push({ line: source.getLineAndCharacterOfPosition(ur.getStart(source)).line + 1, key: key || "(whole)", text: `= ${ur.getText(source)}` });
  };
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const en = node.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && nameOf(p, source) === "en");
      const ur = node.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && nameOf(p, source) === "ur");
      if (en && ur) compare(en.initializer, ur.initializer, "");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
