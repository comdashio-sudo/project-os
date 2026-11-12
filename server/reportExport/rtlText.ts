// D-47 (b): Arabic text for the PDF. pdfkit draws glyphs left to right and does not order a mixed line, so a line is laid out here:
//   1. the harakat are dropped (a report does not carry them, and they would not survive the shaping below);
//   2. numbers with separators (dates, report numbers) are isolated as one left-to-right run, as a reader expects them inside Arabic text;
//   3. the letters take their joined forms (arabic-persian-reshaper), and the Unicode bidi algorithm (bidi-js) puts the runs in visual order;
//   4. each word is one token: an Arabic token is handed to the font in logical order (fontkit lays an Arabic run out right to left itself), and the tokens are
//      written in LOGICAL order at their visual places, so a reader that extracts the text gets it in reading order.
// The font's ccmp feature is turned off when drawing (see dailyReportPdf.ts): it splits some letters into a base and a mark that carries no Unicode value.
import bidiFactory from "bidi-js";
import reshaper from "arabic-persian-reshaper";

const bidi = bidiFactory();
export type Token = { text: string; x: number };

export function layoutLine(text: string, measure: (value: string) => number, direction: "rtl" | "ltr" = "rtl"): { width: number; tokens: Token[] } {
  const isolated = text.replace(/[ً-ْ]/g, "").replace(/-?[0-9A-Za-z][0-9A-Za-z./:_-]*[0-9A-Za-z]|-?[0-9]/g, match => `⁦${match}⁩`);
  // the reshaper draws a final alef maksura with the Farsi yeh forms; the Arabic forms keep the letter (U+0649) for a reader that extracts the text
  const shaped: string = reshaper.ArabicShaper.convertArabic(isolated).replace(/\uFBFC/g, "\uFEEF").replace(/\uFBFD/g, "\uFEF0");
  const embedding = bidi.getEmbeddingLevels(shaped, direction);
  const order = Array.from({ length: shaped.length }, (_v, i) => i);
  for (const [start, end] of bidi.getReorderSegments(shaped, embedding)) order.splice(start, end - start + 1, ...order.slice(start, end + 1).reverse());
  const tokens: Array<Token & { first: number }> = [];
  let x = 0; let current: { rtl: boolean; indexes: number[] } | null = null;
  const flush = () => {
    if (!current) return;
    const indexes = current.rtl ? [...current.indexes].reverse() : current.indexes;
    let value = indexes.map(i => shaped[i]).join("");
    if (current.rtl) value = Array.from(value, ch => bidi.getMirroredCharacter(ch) ?? ch).join("");
    tokens.push({ text: value, x, first: Math.min(...current.indexes) });
    x += measure(value); current = null;
  };
  for (const i of order) {
    const ch = shaped[i]; const rtl = embedding.levels[i] % 2 === 1;
    if (ch === "⁦" || ch === "⁩") continue;
    if (ch === " ") { flush(); x += measure(" "); continue; }
    if (current && current.rtl === rtl) current.indexes.push(i); else { flush(); current = { rtl, indexes: [i] }; }
  }
  flush();
  return { width: x, tokens: tokens.sort((a, b) => a.first - b.first).map(({ text: value, x: at }) => ({ text: value, x: at })) };
}

/** Words of a logical line broken into lines no wider than `width` (each measured after the layout above). */
export function wrapLine(text: string, width: number, measure: (value: string) => number, direction: "rtl" | "ltr" = "rtl"): string[] {
  const lines: string[] = []; let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && layoutLine(next, measure, direction).width > width) { lines.push(line); line = word; } else line = next;
  }
  return line ? [...lines, line] : [""];
}
