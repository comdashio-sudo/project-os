import ExcelJS from "exceljs";

// Q-48: two synthetic weights workbooks in the SHAPE of the owner's real file (which never enters the repository). Every name, code and number here is made up.
// (a) the original: two merged title rows, the header in row 3, thirteen columns in the owner's order, a division merged over its rows (one division merged
//     and left without a name), «م» written as =1+#REF!, the division's weight and value as #REF!, a scope column with no header, weights as fractions of 1,
//     a zero weight, and a totals line.
// (b) the edited copy: the header in row 1 with «القسم» written twice (B the division, E the item), the division's weight and value as #REF!, weights in %.
const REF = { formula: "1+#REF!", result: { error: "#REF!" } } as unknown as ExcelJS.CellValue;
const refOnly = { formula: "#REF!", result: { error: "#REF!" } } as unknown as ExcelJS.CellValue;

export type OwnerShapeOptions = { weightOfFirst?: ExcelJS.CellValue };

export async function ownerOriginalWeights(options: OwnerShapeOptions = {}): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet("الأوزان");
  ws.getCell("A1").value = "مشروع مختلق — جدول أوزان الفيلا";
  ws.mergeCells("A1:M1");
  ws.getCell("A2").value = "قيمة المشروع المختلقة: 1,000,000";
  ws.mergeCells("A2:H2");
  ws.getRow(3).values = ["م", "القسم", "وزن القسم", "قيمة القسم", "بند CSI", "تصنيف داخلي", "Activity Code", "البند الفرعي", "Activity Title", "Old Percentage", "NEW Percentage", null, "تفصيل البند في الجدول الزمني"];
  const lines: unknown[][] = [
    ["03 30 00 خرسانة مختلقة", "هيكل", "WIR.3.1.1", "صب القواعد", "Footings", 0.1, options.weightOfFirst ?? 0.25, "Whole Building", "تفصيل 1"],
    ["03 30 00 خرسانة مختلقة", "هيكل", "WIR.3.1.2", "صب الأعمدة", "Columns", 0.2, 0.25, "Ground floor", "تفصيل 2"],
    ["03 30 00 خرسانة مختلقة", "هيكل", "WIR.3.1.3", "صب السقف", "Slab", 0.2, 0.2, "First floor", "تفصيل 3"],
    ["09 91 00 دهانات مختلقة", "تشطيب", "WIR.9.1.1", "دهان داخلي", "Interior paint", 0.3, 0.2, "Whole Building", ""],
    ["09 91 00 دهانات مختلقة", "تشطيب", "WIR.9.1.2", "دهان خارجي", "Exterior paint", 0.2, 0.1, "Whole Building", ""],
    ["09 91 00 دهانات مختلقة", "تشطيب", "WIR.9.1.3", "تنظيف نهائي", "Final cleaning", 0, 0, "Whole Building", ""],
  ];
  lines.forEach((line, index) => {
    const row = 4 + index;
    ws.getCell(row, 1).value = REF;
    line.forEach((value, column) => { ws.getCell(row, 5 + column).value = value as ExcelJS.CellValue; });
  });
  // division 03 named and merged over its three rows; division 09 merged over its three rows and LEFT WITHOUT A NAME (B7:B9 empty)
  ws.getCell("B4").value = "Division 03 مختلق";
  ws.mergeCells("B4:B6");
  ws.mergeCells("B7:B9");
  ws.getCell("C4").value = refOnly; ws.mergeCells("C4:C6");
  ws.getCell("D4").value = refOnly; ws.mergeCells("D4:D6");
  ws.mergeCells("C7:C9");
  ws.mergeCells("D7:D9");
  ws.getCell("E10").value = "الإجمالي";
  ws.getCell("K10").value = 1;
  return new Uint8Array(await book.xlsx.writeBuffer());
}

export async function ownerEditedWeights(): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet("Sheet1");
  ws.getRow(1).values = ["م", "القسم", "وزن القسم", "قيمة القسم", "القسم", "النشاط", "البند الفرعي", "الوزن"];
  const lines: unknown[][] = [
    ["03 30 00 خرسانة مختلقة", "هيكل", "صب القواعد", 25],
    ["03 30 00 خرسانة مختلقة", "هيكل", "صب الأعمدة", 25],
    ["03 30 00 خرسانة مختلقة", "هيكل", "صب السقف", 20],
    ["09 91 00 دهانات مختلقة", "تشطيب", "دهان داخلي", 20],
    ["09 91 00 دهانات مختلقة", "تشطيب", "دهان خارجي", 10],
  ];
  lines.forEach((line, index) => {
    const row = 2 + index;
    ws.getCell(row, 1).value = index + 1;
    ws.getCell(row, 3).value = refOnly;
    ws.getCell(row, 4).value = refOnly;
    line.forEach((value, column) => { ws.getCell(row, 5 + column).value = value as ExcelJS.CellValue; });
  });
  ws.getCell("B2").value = "Division 03 مختلق";
  ws.mergeCells("B2:B4");
  ws.mergeCells("B5:B6"); // a division merged and left without a name
  return new Uint8Array(await book.xlsx.writeBuffer());
}
