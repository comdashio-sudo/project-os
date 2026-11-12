// D-47 (b): the daily report as PDF (A4 portrait) with pdfkit (MIT) and the Noto Naskh Arabic font (OFL, server/assets/fonts). Arabic lines are laid out by
// rtlText.ts; tables run right to left in Arabic; the three logos head the first page and «report no. | project | date | page x of y» closes every page.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { layoutLine, wrapLine } from "./rtlText";
import type { DailyReportDocument } from "./dailyReportModel";

let fontBytes: Buffer | null = null;
/** The font: next to the bundled function on Vercel (scripts/build-vercel.mjs copies it), or in the repository otherwise. */
export function reportFont() {
  if (fontBytes) return fontBytes;
  const candidates = [path.join(path.dirname(new URL(import.meta.url).pathname), "fonts", "NotoNaskhArabic.ttf"), path.resolve(process.cwd(), "server/assets/fonts/NotoNaskhArabic.ttf")];
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) throw new Error("report font missing");
  fontBytes = readFileSync(found);
  return fontBytes;
}

const PAGE = { width: 595.28, height: 841.89, margin: 40, footer: 30 };
// The letters arrive already in their joined forms (rtlText.ts), so the font's own substitutions are all turned off: some of them split a letter into a base and a mark
// that carries no Unicode value, or draw two letters with one glyph, and a reader extracting the text would then get the wrong letters.
const OFF = Object.fromEntries(["ccmp", "isol", "fina", "fin2", "fin3", "medi", "med2", "init", "rlig", "calt", "liga", "dlig", "mset", "locl", "rclt", "stch"].map(tag => [tag, false]));
const DRAW = { lineBreak: false, features: OFF } as unknown as PDFKit.Mixins.TextOptions;

export async function renderDailyReportPdf(model: DailyReportDocument): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: PAGE.margin, bufferPages: true, font: reportFont() as unknown as string, info: { Title: `${model.title} ${model.footer[0]}` } });
  const chunks: Buffer[] = []; doc.on("data", chunk => chunks.push(chunk)); const ended = new Promise(resolve => doc.on("end", resolve));
  const left = PAGE.margin; const width = PAGE.width - 2 * PAGE.margin; const bottom = PAGE.height - PAGE.margin - PAGE.footer;
  const direction = model.rtl ? "rtl" : "ltr";
  // measured with the same (absent) substitutions it is drawn with: a measure with the defaults would record the wrong letter for a shared glyph
  const measure = (value: string) => doc.widthOfString(value, { features: OFF } as never);
  /** One logical line in a box: right-aligned in Arabic, left-aligned otherwise. */
  const line = (text: string, x: number, y: number, boxWidth: number) => {
    const laid = layoutLine(text, measure, direction);
    const start = model.rtl ? x + boxWidth - laid.width : x;
    for (const token of laid.tokens) doc.text(token.text, start + token.x, y, DRAW);
  };
  let y = PAGE.margin;
  const room = (height: number) => { if (y + height > bottom) { doc.addPage(); y = PAGE.margin; } };

  // the three parties' logos (a party without a PNG/JPEG logo shows its name), the title, the header fields
  const third = width / 3;
  model.logos.forEach((logo, i) => {
    const x = model.rtl ? left + width - (i + 1) * third : left + i * third;
    if (logo.bytes) doc.image(logo.bytes, x + 10, y, { fit: [third - 20, 50], align: "center", valign: "center" }); else { doc.fontSize(10); line(logo.party, x + 10, y + 18, third - 20); }
  });
  y += 60; doc.fontSize(16); line(model.title, left, y, width); y += 28;
  const table = (columns: string[], rows: string[][], total?: string[]) => {
    const cell = width / columns.length; const size = rows.length > 25 ? 8 : 9; doc.fontSize(size); const lineHeight = size * 1.6;
    const row = (cells: string[], header: boolean) => {
      const wrapped = cells.map(value => wrapLine(value, cell - 8, measure, direction));
      const height = Math.max(1, ...wrapped.map(lines => lines.length)) * lineHeight + 6;
      if (y + height > bottom) { doc.addPage(); y = PAGE.margin; if (!header) row(columns, true); }
      cells.forEach((_v, i) => {
        const x = model.rtl ? left + width - (i + 1) * cell : left + i * cell;
        if (header) doc.save().rect(x, y, cell, height).fill("#e8eef4").restore();
        doc.rect(x, y, cell, height).lineWidth(0.5).stroke("#8a99a8");
        wrapped[i].forEach((text, k) => line(text, x + 4, y + 3 + k * lineHeight, cell - 8));
      });
      y += height;
    };
    room(lineHeight * 2 + 12); // the header row never sits alone at the foot of a page
    row(columns, true); for (const values of rows) row(values, false); if (total) row(total, false); y += 10;
  };
  table(model.header.map(([label]) => label), [model.header.map(([, value]) => value)]);
  for (const section of model.sections) {
    room(section.tables.length ? 110 : 60); doc.fontSize(12); line(section.title, left, y, width); y += 22; // a title stays with its table's header and first row
    for (const t of section.tables) table(t.columns, t.rows, t.total);
    for (const photo of section.images ?? []) { room(200); doc.image(photo.bytes, left + width / 4, y, { fit: [width / 2, 170], align: "center" }); y += 175; doc.fontSize(9); line(photo.caption, left, y, width); y += 18; }
  }
  // every page: report no. | project | date | page x of y
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i); doc.page.margins.bottom = 0; doc.fontSize(8); // the footer sits in the bottom margin, which must not start a new page
    line([...model.footer, `${model.pageWord} ${i + 1} ${model.ofWord} ${range.count}`].join(" | "), left, PAGE.height - PAGE.margin - 12, width);
  }
  doc.end(); await ended;
  return Buffer.concat(chunks);
}
