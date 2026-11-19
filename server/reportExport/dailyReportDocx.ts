// D-47 (b): the daily report as Word (docx, MIT), the same sections and tables as the PDF, A4 portrait; Word shapes and orders the Arabic itself, so the paragraphs
// and the tables are only marked right-to-left. The three logos head the document; «report no. | project | date | page x of y» is the footer of every page.
import { AlignmentType, Document, Footer, ImageRun, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, ShadingType } from "docx";
import type { DailyReportDocument } from "./dailyReportModel";

const A4 = { width: 11906, height: 16838 }; // twips
const FONT = "Arial";

export async function renderDailyReportDocx(model: DailyReportDocument): Promise<Buffer> {
  const rtl = model.rtl;
  const run = (text: string, size = 20, bold = false) => new TextRun({ text, size, bold, font: { ascii: FONT, cs: FONT }, rightToLeft: rtl, sizeComplexScript: size, boldComplexScript: bold });
  const para = (text: string, size = 20, bold = false) => new Paragraph({ bidirectional: rtl, alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [run(text, size, bold)] });
  const table = (columns: string[], rows: string[][], total?: string[]) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: rtl,
    rows: [columns, ...rows, ...(total ? [total] : [])].map((cells, r) => new TableRow({ tableHeader: r === 0, children: cells.map(text => new TableCell({
      shading: r === 0 ? { type: ShadingType.CLEAR, fill: "E8EEF4", color: "auto" } : undefined, children: [para(text, 18, r === 0 || (total !== undefined && r === rows.length + 1))],
    })) })),
  });
  const logos = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: rtl,
    rows: [new TableRow({ children: model.logos.map(logo => new TableCell({ children: [logo.bytes
      ? new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: logo.bytes[0] === 0x89 ? "png" : "jpg", data: logo.bytes, transformation: { width: 120, height: 50 } })] })
      : para(logo.party, 18, true)] })) })],
  });
  const body: Array<Paragraph | Table> = [logos, para(model.title, 32, true), table(model.header.map(([label]) => label), [model.header.map(([, value]) => value)])];
  for (const section of model.sections) {
    body.push(para(""), para(section.title, 24, true));
    for (const t of section.tables) body.push(table(t.columns, t.rows, t.total));
    for (const photo of section.images ?? []) body.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: photo.bytes[0] === 0x89 ? "png" : "jpg", data: photo.bytes, transformation: { width: 320, height: 220 } })] }), para(photo.caption, 18));
  }
  const footer = new Footer({ children: [new Paragraph({ bidirectional: rtl, alignment: AlignmentType.CENTER, children: [
    run(`${model.footer.join(" | ")} | ${model.pageWord} `, 16), new TextRun({ children: [PageNumber.CURRENT], size: 16 }), run(` ${model.ofWord} `, 16), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16 }),
  ] })] });
  const document = new Document({ creator: "Dashio", title: `${model.title} ${model.footer[0]}`, sections: [{ properties: { page: { size: A4, margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, footers: { default: footer }, children: body }] });
  return Buffer.from(await Packer.toBuffer(document));
}
