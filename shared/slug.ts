// The short name of a workspace (its slug): lowercase English letters, digits and single dashes between them, 3 to 120 characters.
// The rule is shared by the form (client) and the procedure (server), so a value the form accepts is a value the server accepts.
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 120;
export const SLUG_RULE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SlugProblem = "required" | "too_short" | "too_long" | "format";

/** The first rule a value breaks, or null when the value is a valid short name. */
export function slugProblem(value: string): SlugProblem | null {
  const slug = value.trim();
  if (!slug) return "required";
  if (slug.length < SLUG_MIN_LENGTH) return "too_short";
  if (slug.length > SLUG_MAX_LENGTH) return "too_long";
  if (!SLUG_RULE.test(slug)) return "format";
  return null;
}

// Arabic and Urdu letters, read as the Latin letters a person would type for them (the short name is written in Latin letters).
// Vowels that the letter itself carries are written with it (ا and ى and ء and ة are "a"), so فناء becomes fanaa.
const TRANSLITERATION: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "i", "آ": "a", "ء": "a", "ؤ": "u", "ئ": "i", "ى": "a", "ة": "a",
  "ب": "b", "پ": "p", "ت": "t", "ث": "th", "ج": "j", "چ": "ch", "ح": "h", "خ": "kh", "د": "d", "ذ": "dh", "ڈ": "d",
  "ر": "r", "ز": "z", "ڑ": "r", "ژ": "zh", "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a", "غ": "gh",
  "ف": "f", "ق": "q", "ک": "k", "ك": "k", "گ": "g", "ل": "l", "م": "m", "ن": "n", "ں": "n", "ه": "h", "ھ": "h", "ہ": "h",
  "و": "w", "ۓ": "e", "ے": "e", "ی": "y", "ي": "y",
};

// Arabic-Indic and Persian digits become the Latin digits.
const DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

// The Arabic and Urdu letters that are consonants. Between two of them a short "a" is read, since Arabic is written without short vowels
// (فناء is read fanaa, not fnaa). Long vowels and glides (ا و ي ى ء ة ؤ ئ) are letters of their own and get no extra "a".
const CONSONANTS = new Set("بتثجحخدذرزسشصضطظعغفقكلمنهڈڑٹپچژگکںھہ");

/**
 * A suggested short name from a legal name: Arabic and Urdu letters are transliterated, Latin letters are kept (accents removed),
 * digits are kept, and every other run of characters becomes one dash. The person can change the suggestion.
 */
export function slugFromName(legalName: string): string {
  let out = "";
  let previousWasConsonant = false;
  for (const char of legalName.normalize("NFD")) {
    // combining marks (accents on Latin letters), Arabic harakat and tatweel are dropped
    if (/[̀-ًͯ-ٰٟـ]/.test(char)) continue;
    const isConsonant = CONSONANTS.has(char);
    if (isConsonant && previousWasConsonant) out += "a";
    previousWasConsonant = isConsonant;
    const mapped = TRANSLITERATION[char] ?? DIGITS[char] ?? char.toLowerCase();
    out += /[a-z0-9]/.test(mapped) ? mapped : "-";
  }
  return out.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, SLUG_MAX_LENGTH).replace(/-$/, "");
}
