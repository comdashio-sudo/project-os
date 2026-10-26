// Numbers as people write them in project files: Arabic-Indic digits, Arabic separators, spaces for thousands, "1.234,56" and "1,234.56", brackets or a trailing minus for negatives, units and currency words
// glued to the figure. Free, deterministic, no model. Returns null when the text is not a number (never a guess).
const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** Eastern Arabic and Persian digits become 0-9 (the platform's own rule: Western digits only). */
export function toLatinDigits(text: string): string {
  return text.replace(/[٠-٩]/g, ch => String(ARABIC_INDIC.indexOf(ch))).replace(/[۰-۹]/g, ch => String(EXTENDED_INDIC.indexOf(ch)));
}

const CURRENCY_WORDS = /(?:ر\.?\s?س\.?|ريال(?:\s+سعودي)?|ريالات|sar|s\.r\.?|sr|usd|\$|﷼|د\.?\s?إ|aed|دينار|kd|kwd)/gi;

export type ParsedNumber = { value: number; percent: boolean };

export function parseNumber(input: unknown): ParsedNumber | null {
  if (typeof input === "number") return Number.isFinite(input) ? { value: input, percent: false } : null;
  if (typeof input !== "string") return null;
  let text = toLatinDigits(input).replace(/ | |‏|‎/g, " ").trim();
  if (!text) return null;
  const percent = /%|٪/.test(text);
  text = text.replace(/[%٪]/g, "").replace(CURRENCY_WORDS, "").replace(/\s*(?:days?|d|hours?|hrs?|يوم|ايام|أيام|ساعه|ساعة|ساعات|شهر|اشهر|أشهر|weeks?|اسبوع|أسبوع)\s*$/i, "").trim();
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1).trim(); }
  if (/-\s*$/.test(text)) { negative = true; text = text.replace(/-\s*$/, "").trim(); }
  if (/^[-−–]/.test(text)) { negative = !negative; text = text.replace(/^[-−–]\s*/, ""); }
  if (/^\+/.test(text)) text = text.slice(1).trim();
  // Arabic decimal and thousands marks
  text = text.replace(/٫/g, ".").replace(/[٬،]/g, ",");
  // spaces between digit groups are thousands separators ("1 250 000")
  if (/^\d{1,3}(?: \d{3})+(?:[.,]\d+)?$/.test(text)) text = text.replace(/ /g, "");
  if (!/^\d[\d.,]*$|^[.,]\d+$/.test(text)) return null;
  const lastDot = text.lastIndexOf("."); const lastComma = text.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // both present: the one that comes last is the decimal mark
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    normalized = text.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    const parts = text.split(",");
    // "1,234" and "1,234,567" are thousands; "12,5" and "0,125" are decimals
    normalized = parts.length > 2 || (parts[1]?.length === 3 && parts[0].length >= 1 && parts[0] !== "0") ? parts.join("") : `${parts[0]}.${parts[1]}`;
  } else if (lastDot >= 0) {
    const parts = text.split(".");
    // "1.234.567" is thousands in the European style; one dot is a decimal point
    normalized = parts.length > 2 ? parts.join("") : text;
  } else normalized = text;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return { value: negative ? -value : value, percent };
}

/** A text the quantity/amount columns hold: a figure, possibly with a unit or a currency word after it. */
export const looksNumeric = (input: unknown) => parseNumber(input) !== null;
