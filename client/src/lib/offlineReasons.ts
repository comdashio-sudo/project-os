import { getProjectError } from "@shared/projectErrors";
import { pickLanguage, type Language } from "@/lib/language";

/** Q-24: a kept save the server refused, as sentences: «CODE:villa CODE:villa» (a refusal villa by villa) through the screen's own issue texts, or one product error code. */
export function offlineReasons(error: string | undefined, issues: Record<string, ((villa?: string, detail?: string) => string) | undefined>, language: Language): string[] {
  if (!error) return [];
  const parts = error.split(" ").filter(Boolean);
  if (parts.every(part => /^SITE_[A-Z_]+(:.*)?$/.test(part))) return parts.map(part => { const [code, villa] = part.split(":"); return issues[code]?.(villa) ?? part; });
  return [pickLanguage(language, getProjectError(error).messages)];
}
