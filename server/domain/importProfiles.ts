// A file's header signature and how two signatures overlap: the same source sent again is recognised by its headers (Q-50 smart reader, Q-66 (6) PMC import).
// Pure. The profiles themselves are the company's rows in import_source_profiles.
import { normalizeHeader } from "./smartImport/dictionary";

/** At least this share of the headers in common (of the longer list) is the same source. */
export const PROFILE_MATCH = 0.75;
/** The normalised header words, once each, in order: what a profile is recognised by. */
export const headerSignature = (headers: string[]) => Array.from(new Set(headers.map(normalizeHeader).filter(Boolean))).sort();
/** The share of headers two signatures have in common, of the longer one (0 when either is empty). */
export const headerOverlap = (a: string[], b: string[]) => { if (!a.length || !b.length) return 0; const set = new Set(b); return a.filter(item => set.has(item)).length / Math.max(a.length, b.length); };
