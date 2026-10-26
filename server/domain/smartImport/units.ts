// Units as written on site: م3 · م³ · m3 · cum · متر مكعب all mean the same cubic metre. One canonical code per unit, the display for each language, and what could not be read stays as written (never guessed).
export type UnitCode = "m3" | "m2" | "m" | "ton" | "kg" | "no" | "l" | "ls" | "bag" | "set" | "day" | "hr" | "month" | "pct";
export const UNIT_LABELS: Record<UnitCode, { ar: string; en: string }> = {
  m3: { ar: "م³", en: "m³" }, m2: { ar: "م²", en: "m²" }, m: { ar: "م.ط", en: "m" }, ton: { ar: "طن", en: "ton" }, kg: { ar: "كجم", en: "kg" }, no: { ar: "عدد", en: "no." },
  l: { ar: "لتر", en: "L" }, ls: { ar: "مقطوعية", en: "LS" }, bag: { ar: "كيس", en: "bag" }, set: { ar: "طقم", en: "set" }, day: { ar: "يوم", en: "day" }, hr: { ar: "ساعة", en: "hr" }, month: { ar: "شهر", en: "month" }, pct: { ar: "%", en: "%" },
};

const SYNONYMS: Record<UnitCode, string[]> = {
  m3: ["م3", "م³", "م ٣", "m3", "m³", "m^3", "cum", "cu.m", "cu m", "cbm", "متر مكعب", "متر3", "متر ٣", "م.م", "م مكعب", "cubic meter", "cubic metre", "cubic meters"],
  m2: ["م2", "م²", "m2", "m²", "m^2", "sqm", "sq.m", "sq m", "متر مربع", "متر2", "م.م", "م مربع", "square meter", "square metre", "square meters"],
  m: ["م", "م.ط", "م ط", "متر", "متر طولي", "m", "lm", "l.m", "rm", "mtr", "meter", "metre", "meters", "linear meter"],
  ton: ["طن", "ton", "tons", "tonne", "tonnes", "mt", "t"],
  kg: ["كجم", "كغ", "كغم", "كيلو", "كيلوجرام", "kg", "kgs", "kilogram"],
  no: ["عدد", "حبة", "قطعة", "وحدة", "no", "no.", "nos", "nr", "each", "ea", "pcs", "pc", "piece", "pieces", "unit", "units"],
  l: ["لتر", "ل", "l", "lt", "ltr", "liter", "litre", "liters"],
  ls: ["مقطوعية", "مقطوع", "مق", "ls", "l.s", "lump sum", "lumpsum", "lot", "l/s", "paus"],
  bag: ["كيس", "أكياس", "bag", "bags"],
  set: ["طقم", "مجموعة", "set", "sets"],
  day: ["يوم", "أيام", "ايام", "day", "days", "d"],
  hr: ["ساعة", "ساعات", "hr", "hrs", "hour", "hours", "h"],
  month: ["شهر", "أشهر", "اشهر", "month", "months", "mo"],
  pct: ["%", "٪", "نسبة", "percent", "pct"],
};

const clean = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[٠-٩]/g, ch => String("٠١٢٣٤٥٦٧٨٩".indexOf(ch))).replace(/[ً-ٰٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
// "m" and "d" and "t" are ambiguous single letters in free text: they count only when the whole cell is that letter
const INDEX = new Map<string, UnitCode>();
// m² and m³ share "م.م" in some sheets; the cube wins only through its own spellings, so the shared one is left out of the table on purpose
const AMBIGUOUS = new Set(["م.م"]);
for (const [code, words] of Object.entries(SYNONYMS) as Array<[UnitCode, string[]]>) for (const word of words) { const key = clean(word); if (!AMBIGUOUS.has(key)) INDEX.set(key, code); }

export function normalizeUnit(input: unknown): { code: UnitCode | null; raw: string } {
  const raw = String(input ?? "").trim();
  if (!raw) return { code: null, raw };
  return { code: INDEX.get(clean(raw)) ?? null, raw };
}

export const isUnitText = (input: unknown) => normalizeUnit(input).code !== null;
