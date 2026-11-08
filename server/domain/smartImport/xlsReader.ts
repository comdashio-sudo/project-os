// The legacy Excel format (.xls, BIFF8 inside an OLE2 compound file), read without any library: the values of every sheet, as the same grid the .xlsx reader returns.
// Primavera P6 and many older tools still export this way. Only what a data import needs is read — text, numbers, booleans, dates (by the cell's number format), formula RESULTS —
// and anything else (charts, styles, macros) is ignored. A password-protected, damaged or pre-1997 (BIFF5) file is refused with a code, never half-read.
import type { Cell, SheetGrid } from "./sheetReader";

export const isOle2 = (bytes: Uint8Array) => bytes.length > 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 && bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1;

const FREE = 0xffffffff; const END = 0xfffffffe; const MAX_ROWS = 50_000 + 50; const MAX_COLUMNS = 300;

class XlsError extends Error { constructor(readonly code: string) { super(code); } }
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** The bytes of a named stream of the compound file. */
function readStream(file: Uint8Array, name: string): Uint8Array {
  const sectorSize = 1 << u16(file, 30); const miniSize = 1 << u16(file, 32);
  if (sectorSize !== 512 && sectorSize !== 4096) throw new XlsError("XLS_DAMAGED");
  const sector = (n: number) => { const start = (n + 1) * sectorSize; if (start + sectorSize > file.length) throw new XlsError("XLS_DAMAGED"); return file.subarray(start, start + sectorSize); };
  // the FAT: the sectors listed in the header's DIFAT (and in further DIFAT sectors)
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) { const id = u32(file, 76 + i * 4); if (id === FREE) break; fatSectors.push(id); }
  let difat = u32(file, 68); const difatCount = u32(file, 72);
  for (let i = 0; i < difatCount && difat !== END && difat !== FREE; i++) { const block = sector(difat); for (let k = 0; k < sectorSize / 4 - 1; k++) { const id = u32(block, k * 4); if (id !== FREE) fatSectors.push(id); } difat = u32(block, sectorSize - 4); }
  const fat: number[] = [];
  for (const id of fatSectors) { const block = sector(id); for (let k = 0; k < sectorSize / 4; k++) fat.push(u32(block, k * 4)); }
  const chain = (start: number, table: number[]) => { const out: number[] = []; const seen = new Set<number>(); for (let s = start; s !== END && s !== FREE; s = table[s]) { if (s === undefined || seen.has(s)) throw new XlsError("XLS_DAMAGED"); seen.add(s); out.push(s); } return out; };
  const readChain = (start: number) => { const parts = chain(start, fat).map(sector); const out = new Uint8Array(parts.length * sectorSize); parts.forEach((part, i) => out.set(part, i * sectorSize)); return out; };

  const directory = readChain(u32(file, 48));
  type Entry = { name: string; type: number; start: number; size: number };
  const entries: Entry[] = [];
  for (let o = 0; o + 128 <= directory.length; o += 128) {
    const len = u16(directory, o + 64); if (len < 2) continue;
    let text = ""; for (let k = 0; k < (len - 2) / 2; k++) text += String.fromCharCode(u16(directory, o + k * 2));
    entries.push({ name: text, type: directory[o + 66], start: u32(directory, o + 116), size: u32(directory, o + 120) });
  }
  const entry = entries.find(item => item.type === 2 && (item.name === name || (name === "Workbook" && item.name === "Book")));
  if (!entry) { if (entries.some(item => item.name === "EncryptedPackage" || item.name === "EncryptionInfo")) throw new XlsError("XLS_ENCRYPTED"); throw new XlsError("XLS_NO_WORKBOOK"); }
  const cutoff = u32(file, 56);
  if (entry.size >= cutoff) return readChain(entry.start).subarray(0, entry.size);
  // a small stream lives in the mini stream (chained through the mini FAT), which is itself the root entry's stream
  const root = entries.find(item => item.type === 5); if (!root) throw new XlsError("XLS_DAMAGED");
  const miniStream = readChain(root.start);
  const miniFatBytes = readChain(u32(file, 60)); const miniFat: number[] = []; for (let k = 0; k + 4 <= miniFatBytes.length; k += 4) miniFat.push(u32(miniFatBytes, k));
  const parts = chain(entry.start, miniFat).map(s => miniStream.subarray(s * miniSize, (s + 1) * miniSize));
  const out = new Uint8Array(parts.length * miniSize); parts.forEach((part, i) => out.set(part, i * miniSize)); return out.subarray(0, entry.size);
}

// ---------------------------------------------------------------- BIFF8 records

type Rec = { type: number; data: Uint8Array; offset: number };
function records(stream: Uint8Array, from = 0): Rec[] {
  const out: Rec[] = []; let depth = 0; // a sheet may hold nested BOF..EOF substreams (an embedded chart): the part ends at the EOF that closes the first BOF
  for (let o = from; o + 4 <= stream.length;) {
    const type = u16(stream, o); const len = u16(stream, o + 2); if (o + 4 + len > stream.length) break;
    if (type === 0x0809) depth += 1;
    if (type === 0x000a) { depth -= 1; if (depth <= 0) { out.push({ type: -1, data: new Uint8Array(0), offset: o }); break; } }
    else out.push({ type, data: stream.subarray(o + 4, o + 4 + len), offset: o });
    o += 4 + len;
  }
  return out;
}

/** The shared string table: strings may be cut by a CONTINUE record, which restarts with a flag byte telling the width of the characters that follow. */
function readSst(segments: Uint8Array[]): string[] {
  const out: string[] = [];
  let seg = 0; let pos = 8; // after cstTotal + cstUnique, in the first segment
  const byte = () => { if (pos >= segments[seg].length) { seg += 1; pos = 0; } return segments[seg][pos++]; };
  const word = () => byte() | (byte() << 8);
  const dword = () => (word() | (word() << 16)) >>> 0;
  const count = new DataView(segments[0].buffer, segments[0].byteOffset, segments[0].byteLength).getUint32(4, true);
  while (out.length < count && seg < segments.length && !(seg === segments.length - 1 && pos >= segments[seg].length)) {
    const cch = word(); const flags = byte();
    let runs = 0; let ext = 0;
    if (flags & 0x08) runs = word();
    if (flags & 0x04) ext = dword();
    let wide = (flags & 0x01) !== 0; let text = "";
    for (let i = 0; i < cch; i++) {
      if (pos >= segments[seg].length) { seg += 1; pos = 0; if (seg >= segments.length) break; wide = (segments[seg][pos++] & 0x01) !== 0; } // the width flag a continued string repeats
      if (wide) { const lo = segments[seg][pos++]; if (pos >= segments[seg].length) { seg += 1; pos = 0; if (seg >= segments.length) break; } const hi = segments[seg][pos++]; text += String.fromCharCode(lo | (hi << 8)); }
      else text += String.fromCharCode(segments[seg][pos++]);
    }
    for (let i = 0; i < runs * 4; i++) byte();
    for (let i = 0; i < ext; i++) byte();
    out.push(text);
  }
  return out;
}

function unicodeString(data: Uint8Array, o: number, lengthBytes: 1 | 2): { text: string; next: number } {
  const cch = lengthBytes === 1 ? data[o] : u16(data, o); let p = o + lengthBytes; const flags = data[p++];
  if (flags & 0x08) p += 2; if (flags & 0x04) p += 4;
  let text = "";
  if (flags & 0x01) { for (let i = 0; i < cch; i++) text += String.fromCharCode(u16(data, p + i * 2)); p += cch * 2; } else { for (let i = 0; i < cch; i++) text += String.fromCharCode(data[p + i]); p += cch; }
  return { text, next: p };
}

const rk = (value: number) => { let n: number; if (value & 0x02) n = value >> 2; else { const buf = new DataView(new ArrayBuffer(8)); buf.setUint32(4, value & 0xfffffffc, true); n = buf.getFloat64(0, true); } return value & 0x01 ? n / 100 : n; };

const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const isDateFormat = (id: number, custom: Map<number, string>) => {
  if (BUILTIN_DATE.has(id)) return true;
  const text = custom.get(id); if (!text) return false;
  const stripped = text.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  return /[dmyhs]/i.test(stripped) && !/[#0?]/.test(stripped.replace(/0+(?=\.)/g, ""));
};
const fromSerial = (serial: number, date1904: boolean) => { const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30); return new Date(base + Math.round(serial * 86400000)); };

/** Every sheet of a .xls as a grid of values. */
export function readXls(bytes: Uint8Array): { ok: true; sheets: SheetGrid[] } | { ok: false; code: string } {
  try {
    if (!isOle2(bytes)) return { ok: false, code: "XLS_NOT_OLE2" };
    const book = readStream(bytes, "Workbook");
    const first = u16(book, 0); if (first !== 0x0809) return { ok: false, code: "XLS_DAMAGED" };
    const version = u16(book, 4); if (version !== 0x0600) return { ok: false, code: "XLS_UNSUPPORTED_VERSION" }; // BIFF8 (Excel 97 and later)
    const sheets: Array<{ name: string; offset: number; kind: number }> = []; const sstSegments: Uint8Array[] = []; const formats = new Map<number, string>(); const xfFormat: number[] = []; let date1904 = false;
    let inSst = false; let globalClean = false;
    for (const rec of records(book)) {
      if (rec.type === -1) { globalClean = true; break; }
      if (inSst && rec.type === 0x003c) { sstSegments.push(rec.data); continue; } inSst = false;
      if (rec.type === 0x00fc) { sstSegments.push(rec.data); inSst = true; }
      else if (rec.type === 0x0085) { const name = unicodeString(rec.data, 6, 1).text; sheets.push({ name, offset: u32(rec.data, 0), kind: rec.data[5] }); }
      else if (rec.type === 0x041e) formats.set(u16(rec.data, 0), unicodeString(rec.data, 2, 2).text);
      else if (rec.type === 0x00e0) xfFormat.push(u16(rec.data, 2));
      else if (rec.type === 0x0022) date1904 = u16(rec.data, 0) === 1;
      else if (rec.type === 0x002f) return { ok: false, code: "XLS_ENCRYPTED" }; // FILEPASS
    }
    if (!globalClean) return { ok: false, code: "XLS_DAMAGED" }; // the workbook's global part ends with an EOF record; without it the file was cut or damaged
    const strings = sstSegments.length ? readSst(sstSegments) : [];
    const grids: SheetGrid[] = [];
    for (const sheet of sheets) {
      if (sheet.kind !== 0) continue; // worksheets only (not charts, macro sheets)
      const rows: Cell[][] = []; let maxCol = 0; let pendingString: { r: number; c: number } | null = null;
      const put = (r: number, c: number, value: Cell) => { if (r >= MAX_ROWS || c >= MAX_COLUMNS) return; (rows[r] ??= [])[c] = value; if (c + 1 > maxCol) maxCol = c + 1; };
      const numberCell = (r: number, c: number, xf: number, value: number) => put(r, c, isDateFormat(xfFormat[xf] ?? 0, formats) ? fromSerial(value, date1904) : value);
      let started = false; let sheetClean = false;
      for (const rec of records(book, sheet.offset)) {
        const d = rec.data;
        if (rec.type === 0x0809) { if (started) break; started = true; continue; }
        if (rec.type === -1) { sheetClean = true; break; }
        if (rec.type === 0x00fd) put(u16(d, 0), u16(d, 2), strings[u32(d, 6)] ?? null);
        else if (rec.type === 0x0204) put(u16(d, 0), u16(d, 2), unicodeString(d, 6, 2).text);
        else if (rec.type === 0x0203) numberCell(u16(d, 0), u16(d, 2), u16(d, 4), new DataView(d.buffer, d.byteOffset + 6, 8).getFloat64(0, true));
        else if (rec.type === 0x027e) numberCell(u16(d, 0), u16(d, 2), u16(d, 4), rk(u32(d, 6)));
        else if (rec.type === 0x00bd) { const row = u16(d, 0); const firstCol = u16(d, 2); const count = (d.length - 6) / 6; for (let k = 0; k < count; k++) numberCell(row, firstCol + k, u16(d, 4 + k * 6), rk(u32(d, 6 + k * 6))); }
        else if (rec.type === 0x0205) { if (d[7] === 0) put(u16(d, 0), u16(d, 2), d[6] ? "TRUE" : "FALSE"); }
        else if (rec.type === 0x0006) {
          const r = u16(d, 0); const c = u16(d, 2);
          if (u16(d, 12) === 0xffff) { if (d[6] === 0) pendingString = { r, c }; else if (d[6] === 1) put(r, c, d[8] ? "TRUE" : "FALSE"); }
          else numberCell(r, c, u16(d, 4), new DataView(d.buffer, d.byteOffset + 6, 8).getFloat64(0, true));
        } else if (rec.type === 0x0207 && pendingString) { put(pendingString.r, pendingString.c, unicodeString(d, 0, 2).text); pendingString = null; }
      }
      if (!sheetClean) return { ok: false, code: "XLS_DAMAGED" };
      const width = Math.min(maxCol, MAX_COLUMNS);
      const filled: Cell[][] = Array.from({ length: rows.length }, (_unused, r) => Array.from({ length: width }, (_u, c) => { const v = rows[r]?.[c]; return typeof v === "string" ? (v.replace(/ /g, " ").trim() || null) : v ?? null; }));
      grids.push({ name: sheet.name, rows: filled, mergedFilled: 0, mergeRanges: 0 });
    }
    return { ok: true, sheets: grids };
  } catch (error) { return { ok: false, code: error instanceof XlsError ? error.code : "XLS_DAMAGED" }; }
}
