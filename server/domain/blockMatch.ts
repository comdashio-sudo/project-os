// Q-67 (a): which block did the person mean? The site writes «33» or «بلوك 33» where the project's block is «BLK 33», and a literal comparison said «block 33 does not exist» (the owner, on his own
// project). The match goes from the strictest to the loosest and stops at the first step that finds something: literal (code or name) → the same after folding case, spaces, dashes,
// dots and Arabic-Indic digits → the bare number (33 = 033 = BLK 33 = B-33 = بلوك 33). A step that finds more than one block refuses with the options (never a guess); a block that is not
// there is refused with the closest one named, so the screen can ask «did you mean BLK 33?». Pure: no database, no screen.

export type BlockRef = { id: string; code: string; name: string | null };
export type BlockMatch<B extends BlockRef = BlockRef> =
  | { ok: true; block: B; via: "literal" | "folded" | "number" }
  | { ok: false; reason: "ambiguous"; options: string[] }
  | { ok: false; reason: "unknown"; suggestion: string | null };

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";
/** Arabic-Indic (٣٣) and Persian (۳۳) digits as Latin ones; the rest of the text unchanged. */
export const toLatinDigits = (text: string) => text.replace(/[٠-٩۰-۹]/g, char => String(ARABIC_INDIC.includes(char) ? ARABIC_INDIC.indexOf(char) : PERSIAN.indexOf(char)));
/** Case, spaces, dashes, underscores, dots and slashes folded away, digits Latin: «B-33», «b 33» and «BLK 33» → «b33», «b33», «blk33». */
const folded = (text: string) => toLatinDigits(text).toLowerCase().normalize("NFKC").replace(/[\s\-_.\/‏‎]+/g, "");
/** The one number in a block's code or name or in the query («BLK 033» → 33); null when there is no digit or more than one run of digits (a code like «B2-33» names two numbers). */
const numberOf = (text: string): number | null => { const runs = toLatinDigits(text).match(/\d+/g); return runs && runs.length === 1 ? Number(runs[0]) : null; };
const label = (block: BlockRef) => block.code;

export function matchBlock<B extends BlockRef>(blocks: readonly B[], query: string): BlockMatch<B> {
  const wanted = query.trim();
  if (!wanted) return { ok: false, reason: "unknown", suggestion: null };

  const literal = blocks.filter(block => block.code === wanted || block.name === wanted);
  if (literal.length === 1) return { ok: true, block: literal[0], via: "literal" };
  if (literal.length > 1) return { ok: false, reason: "ambiguous", options: literal.map(label) };

  const key = folded(wanted);
  const same = blocks.filter(block => folded(block.code) === key || (block.name !== null && folded(block.name) === key));
  if (same.length === 1) return { ok: true, block: same[0], via: "folded" };
  if (same.length > 1) return { ok: false, reason: "ambiguous", options: same.map(label) };

  const number = numberOf(wanted);
  if (number !== null) {
    const byNumber = blocks.filter(block => numberOf(block.code) === number || (block.name !== null && numberOf(block.name) === number));
    if (byNumber.length === 1) return { ok: true, block: byNumber[0], via: "number" };
    if (byNumber.length > 1) return { ok: false, reason: "ambiguous", options: byNumber.map(label) };
  }
  // not there: the closest block, so the refusal can say «did you mean …?» (a code that contains what was typed, or the other way round)
  const close = key ? blocks.filter(block => { const code = folded(block.code); return code.includes(key) || key.includes(code); }) : [];
  return { ok: false, reason: "unknown", suggestion: close.length === 1 ? label(close[0]) : null };
}
