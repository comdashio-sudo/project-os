// Work order 22: which catalogue activity (the monthly report's and the consultant's 128) a site activity (the site's 114) stands for. The platform SUGGESTS by name; the owner
// confirms once. One site activity may stand for several catalogue activities (the catalogue splits it by floor: «… - Ground floor», «… - First Floor»).
// Pure: no database. The score is the overlap of the significant words, after the location words and the generic «works» are set aside.

const LOCATION = /\b(ground floor|first floor|second floor|whole building|boundary wall|annex|roof|basement|gf|ff)\b/g;
const GENERIC = new Set(["works", "work", "the", "of", "and", "for", "to", "in", "a", "an", "-", "&"]);
export const normaliseName = (value: string) => value.toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(LOCATION, " ").replace(/[^a-z0-9؀-ۿ]+/g, " ").replace(/\s+/g, " ").trim();
const words = (value: string) => new Set(normaliseName(value).split(" ").filter(word => word && !GENERIC.has(word)));

/** 0..1: how much of the two names' significant words they share (Dice). Equal names after normalisation score 1. */
export function nameScore(a: string, b: string): number {
  const x = words(a); const y = words(b);
  if (!x.size || !y.size) return 0;
  if (normaliseName(a) === normaliseName(b)) return 1;
  let shared = 0; for (const word of Array.from(x)) if (y.has(word)) shared += 1;
  return (2 * shared) / (x.size + y.size);
}

export type SiteActivityRef = { id: string; name: string; section?: string | null };
export type CatalogActivityRef = { code: string; name: string; section?: string | null };
export type LinkSuggestion = { siteActivityId: string; activityCode: string; score: number };
export const SUGGEST_THRESHOLD = 0.75;

const sectionCode = (value: string | null | undefined) => (value ?? "").match(/\b\d{2}\b/)?.[0] ?? null;

/**
 * Every catalogue activity is given to the site activity whose name fits it best (when the fit reaches the threshold), so a split activity lands on its one site activity,
 * and a catalogue activity is never claimed twice. A section code shared by both sides (CSI «03») breaks ties.
 */
export function suggestLinks(site: SiteActivityRef[], catalog: CatalogActivityRef[], threshold = SUGGEST_THRESHOLD): { links: LinkSuggestion[]; unmatchedSite: string[]; unmatchedCatalog: string[] } {
  const links: LinkSuggestion[] = [];
  for (const activity of catalog) {
    let best: LinkSuggestion | null = null;
    for (const candidate of site) {
      let score = nameScore(candidate.name, activity.name);
      if (score > 0 && sectionCode(candidate.section) && sectionCode(candidate.section) === sectionCode(activity.section)) score = Math.min(1, score + 0.01);
      if (!best || score > best.score) best = { siteActivityId: candidate.id, activityCode: activity.code, score };
    }
    if (best && best.score >= threshold) links.push({ ...best, score: Math.round(Math.min(1, best.score) * 1e4) / 1e4 });
  }
  const linkedSite = new Set(links.map(link => link.siteActivityId)); const linkedCatalog = new Set(links.map(link => link.activityCode));
  return { links, unmatchedSite: site.filter(item => !linkedSite.has(item.id)).map(item => item.id), unmatchedCatalog: catalog.filter(item => !linkedCatalog.has(item.code)).map(item => item.code) };
}
