// The languages an export or a template can be written in. Arabic and Urdu lay out right to left; the importer matches the headers of all three.
export const EXPORT_LOCALES = ["ar", "en", "ur"] as const;
export type ExportLocale = (typeof EXPORT_LOCALES)[number];
