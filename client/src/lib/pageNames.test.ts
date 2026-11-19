/** @vitest-environment node */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_NAMES, PROJECT_SUBPAGE_NAMES, RETIRED_PAGE_NAMES } from "@shared/pageNames";

// Q-36 (step 1): one name per page. Every name is given in the three languages, no two pages share an Arabic name, and a name a page no longer goes by is
// not shown anywhere in the client (tests excluded: they may quote the old name to prove it is gone).
const root = join(__dirname, "..");
const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return sources(path);
  return /\.(tsx?|json)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
});

describe("one name per page (Q-36)", () => {
  it("each page has its name in Arabic, English and Urdu, and no two pages share an Arabic name", () => {
    for (const [key, name] of Object.entries(PAGE_NAMES)) for (const language of ["ar", "en", "ur"] as const) expect(name[language].trim(), `${key}.${language}`).not.toBe("");
    const arabic = Object.values(PAGE_NAMES).map(name => name.ar);
    expect(new Set(arabic).size).toBe(arabic.length);
  });

  it("every project sub-page in the breadcrumb table has a name", () => {
    for (const key of Object.values(PROJECT_SUBPAGE_NAMES)) expect(PAGE_NAMES[key]).toBeTruthy();
  });

  it("NEGATIVE: a name a page no longer goes by appears nowhere in the client", () => {
    const found: string[] = [];
    for (const file of sources(root)) {
      const text = readFileSync(file, "utf8");
      for (const [old] of RETIRED_PAGE_NAMES) if (text.includes(old)) found.push(`${file.slice(root.length + 1)}: «${old}»`);
    }
    expect(found).toEqual([]);
  });

  it("the project page's lanes carry the titles of the sections they open", () => {
    const controls = readFileSync(join(root, "pages", "ProjectControls.tsx"), "utf8");
    for (const title of ["تحديث التخطيط والتكلفة", "العقود والمستندات والمطالبات", "سجل الموقع والجودة", "التخطيط وملفات البيانات"]) expect(controls.split(title).length - 1, title).toBeGreaterThanOrEqual(2);
  });
});
