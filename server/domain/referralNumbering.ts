// Referral numbers, the transmittals of drawings to the consultant (work order 5, item 7): the rules that need no database. A number is
// <project-code>-<discipline-code>-<sequence>, the sequence four digits from 0001. The service (server/designService.ts) passes in the numbers
// already issued for the project, cancelled ones included, so that no number is ever reused.

import { DESIGN_DISCIPLINES, type DesignDiscipline } from "@shared/designDisciplines";

/**
 * One letter per discipline: the prefix the drawing register already uses (A-101, S-101, M-101). "other" is X.
 * This table is the only place these codes are set; the screen can show it, and it cannot leave a discipline out (the type demands every one).
 */
export const DISCIPLINE_CODES: Readonly<Record<DesignDiscipline, string>> = {
  architectural: "A",
  interior: "I",
  landscape: "L",
  structural: "S",
  civil: "C",
  mechanical: "M",
  electrical: "E",
  plumbing: "P",
  fire_fighting: "F",
  other: "X",
};

const DISCIPLINE_BY_CODE = new Map<string, DesignDiscipline>(DESIGN_DISCIPLINES.map(discipline => [DISCIPLINE_CODES[discipline], discipline]));
const PROJECT_CODE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const MAX_PROJECT_CODE_LENGTH = 32;
const MAX_SEQUENCE = 9999;

export type ReferralRefusal =
  | "REFERRAL_PROJECT_CODE_INVALID"
  | "REFERRAL_DISCIPLINE_UNKNOWN"
  | "REFERRAL_SEQUENCE_INVALID"
  | "REFERRAL_SEQUENCE_EXHAUSTED"
  | "REFERRAL_NUMBER_MALFORMED"
  | "REFERRAL_NUMBER_TAKEN";

export function isValidProjectCode(projectCode: string): boolean {
  return projectCode.length <= MAX_PROJECT_CODE_LENGTH && PROJECT_CODE.test(projectCode);
}

/** The number for a project, discipline and sequence (1 to 9999). Refuses a project code that cannot sit in a number, or a sequence out of range. */
export function formatReferralNumber(projectCode: string, discipline: DesignDiscipline, sequence: number): { ok: true; value: string } | { ok: false; code: ReferralRefusal } {
  if (!isValidProjectCode(projectCode)) return { ok: false, code: "REFERRAL_PROJECT_CODE_INVALID" };
  if (!DISCIPLINE_CODES[discipline]) return { ok: false, code: "REFERRAL_DISCIPLINE_UNKNOWN" };
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) return { ok: false, code: "REFERRAL_SEQUENCE_INVALID" };
  return { ok: true, value: `${projectCode}-${DISCIPLINE_CODES[discipline]}-${String(sequence).padStart(4, "0")}` };
}

/**
 * Reads a number back to its parts. The project code may itself contain hyphens, so the parse works from the right: the last two parts are
 * the discipline letter and the four-digit sequence. Anything else (lower case, a missing part, a sequence of 0000) is malformed.
 */
export function parseReferralNumber(value: string): { ok: true; projectCode: string; discipline: DesignDiscipline; sequence: number } | { ok: false; code: ReferralRefusal } {
  const match = /^(.+)-([A-Z])-(\d{4})$/.exec(value);
  if (!match) return { ok: false, code: "REFERRAL_NUMBER_MALFORMED" };
  const [, projectCode, letter, digits] = match;
  if (!isValidProjectCode(projectCode)) return { ok: false, code: "REFERRAL_NUMBER_MALFORMED" };
  const discipline = DISCIPLINE_BY_CODE.get(letter);
  if (!discipline) return { ok: false, code: "REFERRAL_DISCIPLINE_UNKNOWN" };
  const sequence = Number(digits);
  if (sequence < 1) return { ok: false, code: "REFERRAL_NUMBER_MALFORMED" };
  return { ok: true, projectCode, discipline, sequence };
}

/**
 * The next sequence for a project and discipline: the highest one already issued in that scope, plus one, so a gap is never filled and a
 * number is never reused. Numbers of other projects or disciplines are ignored, and so is any stored text that does not parse (it cannot
 * collide with a well-formed number). Stored text is compared in upper case, the same way the uniqueness check does.
 */
export function nextReferralNumber(existing: readonly string[], projectCode: string, discipline: DesignDiscipline): { ok: true; sequence: number; value: string } | { ok: false; code: ReferralRefusal } {
  if (!isValidProjectCode(projectCode)) return { ok: false, code: "REFERRAL_PROJECT_CODE_INVALID" };
  let highest = 0;
  for (const item of existing) {
    const parsed = parseReferralNumber(item.trim().toUpperCase());
    if (parsed.ok && parsed.projectCode === projectCode && parsed.discipline === discipline) highest = Math.max(highest, parsed.sequence);
  }
  const sequence = highest + 1;
  if (sequence > MAX_SEQUENCE) return { ok: false, code: "REFERRAL_SEQUENCE_EXHAUSTED" };
  const formatted = formatReferralNumber(projectCode, discipline, sequence);
  return formatted.ok ? { ok: true, sequence, value: formatted.value } : formatted;
}

/**
 * A candidate is taken when an issued number is the same. The comparison ignores case and surrounding spaces, because the database's
 * default collation does not tell "prj-a-0001" from "PRJ-A-0001" and the register must not either.
 */
export function checkReferralNumberUnique(candidate: string, existing: readonly string[]): { ok: true } | { ok: false; code: "REFERRAL_NUMBER_TAKEN" } {
  const key = candidate.trim().toUpperCase();
  return existing.some(item => item.trim().toUpperCase() === key) ? { ok: false, code: "REFERRAL_NUMBER_TAKEN" } : { ok: true };
}
