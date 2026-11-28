// Q-66 batch 1 (8) (adviser's I68): «download the cleaned copy» — the file as the import read it, in the same colours as the review grid and with a notes column,
// to send back to whoever filled it in. One sheet, the file's own row numbers, a column per field read (the platform's name and the file's column), the row's
// state, and in words what was corrected (with the file's value), what stops the row, and why a row was not read. Nothing here reads or writes the project.
import ExcelJS from "exceljs";
import { PMC_FIELD_LABELS, pmcImportReason } from "../../shared/pmcImportMessages";
import type { InterfaceLanguage } from "../../shared/interfaceLanguages";
import type { GridRow, GridStatus } from "./importGrid";

const TEXT = {
  ar: { sheet: "الملف بعد المعالجة", row: "الصف في الملف", state: "الحالة", notes: "ملاحظات", inFile: "في الملف", empty: "فارغ",
    status: { ready: "جاهز", corrected: "صُحّح", error: "خطأ", ignored: "متجاهَل" } as Record<GridStatus, string>,
    why: { edited: "صُحّحت", replaced: "صُحّحت مع كل خلية مثلها", filledDown: "أُخذ من الصف أعلاه", fraction: "كسر قُرئ نسبة مئوية" } as Record<string, string>,
    total: "سطر مجموع: لا يُقرأ", leftOut: "تُرك: لا يُقرأ" },
  en: { sheet: "File after processing", row: "Row in the file", state: "State", notes: "Notes", inFile: "in the file", empty: "empty",
    status: { ready: "Ready", corrected: "Corrected", error: "Error", ignored: "Ignored" } as Record<GridStatus, string>,
    why: { edited: "corrected", replaced: "corrected with every cell like it", filledDown: "taken from the row above", fraction: "a fraction read as a percent" } as Record<string, string>,
    total: "Totals line: not read", leftOut: "Left out: not read" },
  ur: { sheet: "پروسیسنگ کے بعد فائل", row: "فائل میں قطار", state: "حالت", notes: "نوٹس", inFile: "فائل میں", empty: "خالی",
    status: { ready: "تیار", corrected: "درست کیا گیا", error: "غلطی", ignored: "نظرانداز" } as Record<GridStatus, string>,
    why: { edited: "درست کیا گیا", replaced: "اس جیسے ہر خانے کے ساتھ درست کیا گیا", filledDown: "اوپر والی قطار سے لیا گیا", fraction: "کسر کو فیصد پڑھا گیا" } as Record<string, string>,
    total: "میزان کی سطر: نہیں پڑھی جاتی", leftOut: "چھوڑی گئی: نہیں پڑھی جاتی" },
};
/** The review grid's colours (ARGB): yellow corrected, red rejected, grey not read. */
export const CLEANED_FILLS = { corrected: "FFFFF1C2", error: "FFFADBD8", ignored: "FFE5E7EB" } as const;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

/** The note of a row: each corrected cell with the file's value, each reason, or why the row was not read. */
export function cleanedRowNote(row: GridRow, fields: Array<{ key: string }>, language: InterfaceLanguage) {
  const t = TEXT[language];
  const labels = PMC_FIELD_LABELS[language] as Record<string, string>;
  if (row.status === "ignored") return row.class === "total" ? t.total : t.leftOut;
  const parts: string[] = row.rowErrors.map(error => pmcImportReason(error, language));
  for (const field of fields) {
    const cell = row.cells[field.key];
    if (!cell) continue;
    if (cell.why) parts.push(`${labels[field.key] ?? field.key}: ${t.why[cell.why]} (${t.inFile} «${cell.from || t.empty}»)`);
    for (const error of cell.errors ?? []) parts.push(`${labels[field.key] ?? field.key}: ${pmcImportReason(error, language)}`);
  }
  return parts.join(" · ");
}

export async function cleanedWorkbook(input: { rows: GridRow[]; fields: Array<{ key: string; header: string }>; language: InterfaceLanguage }): Promise<Buffer> {
  const t = TEXT[input.language];
  const labels = PMC_FIELD_LABELS[input.language] as Record<string, string>;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t.sheet, { views: [{ state: "frozen", xSplit: 1, ySplit: 1, rightToLeft: input.language !== "en" }] });
  sheet.columns = [
    { header: t.row, key: "__row", width: 12 },
    ...input.fields.map(field => ({ header: `${labels[field.key] ?? field.key} (${field.header})`, key: field.key, width: 24 })),
    { header: t.state, key: "__state", width: 14 },
    { header: t.notes, key: "__notes", width: 60 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of input.rows) {
    const values: Record<string, unknown> = { __row: row.row, __state: t.status[row.status], __notes: cleanedRowNote(row, input.fields, input.language) };
    for (const field of input.fields) { const value = row.cells[field.key]?.value ?? ""; values[field.key] = NUMBER.test(value) ? Number(value) : value; }
    const line = sheet.addRow(values);
    if (row.status === "ignored") line.eachCell({ includeEmpty: true }, cell => { cell.fill = fill(CLEANED_FILLS.ignored); cell.font = { strike: true, color: { argb: "FF6B7280" } }; });
    else input.fields.forEach((field, index) => {
      const cell = row.cells[field.key];
      const target = line.getCell(index + 2);
      if (cell?.errors?.length) target.fill = fill(CLEANED_FILLS.error);
      else if (cell?.why) target.fill = fill(CLEANED_FILLS.corrected);
    });
    if (row.status === "error") line.getCell(1).fill = fill(CLEANED_FILLS.error);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
