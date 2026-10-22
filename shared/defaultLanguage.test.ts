import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Arabic is the default for the page shell (no flash of English before the app starts) and for every new company, on every path that creates one.
const read = (...parts: string[]) => readFileSync(join(__dirname, "..", ...parts), "utf8");

describe("Arabic by default", () => {
  it("the HTML shell is Arabic and right-to-left before any script runs", () => {
    expect(read("client", "index.html")).toMatch(/<html lang="ar" dir="rtl">/);
  });

  it("the company table defaults to Arabic, and both ways of creating a company say so explicitly", () => {
    expect(read("drizzle", "schema.ts")).toMatch(/defaultLocale: companiesDefaultLocaleEnum\("default_locale"\)\.default\("ar"\)/);
    const db = read("server", "db.ts");
    const inserts = Array.from(db.matchAll(/tx\.insert\(companies\)\.values\(\{[^}]*\}\)/g)).map(match => match[0]);
    expect(inserts.length).toBeGreaterThanOrEqual(2);
    for (const insert of inserts) expect(insert).toContain('defaultLocale: "ar"');
  });
});
