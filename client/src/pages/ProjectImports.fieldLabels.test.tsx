import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// G-151 (D-30): the column-mapping list named a field by its importer key (description, warehouseCode…) where the screen had no word for it.
// Every key the general importer reads (server/domain/dataImport.ts) has a word in each of the screen's three field maps.
const importer = readFileSync(new URL("../../../server/domain/dataImport.ts", import.meta.url), "utf8");
const keys = Array.from(new Set(Array.from(importer.matchAll(/\{ key: "([a-zA-Z]+)", required:/g), match => match[1])));
const screen = readFileSync(new URL("./ProjectImports.tsx", import.meta.url), "utf8");
const maps = Array.from(screen.matchAll(/field: \{([^}]*)\}/g), match => match[1]);

describe("every importer field has a label on the import screen (G-151)", () => {
  it("finds the three language maps and the importer's keys", () => {
    expect(maps).toHaveLength(3);
    expect(keys).toEqual(expect.arrayContaining(["code", "description", "unitOfMeasure", "warehouseCode", "materialCode", "quantity", "unitCost"]));
  });

  it("each map names each key", () => {
    maps.forEach((map, index) => { for (const key of keys) expect(map, `map ${["ar", "en", "ur"][index]} lacks ${key}`).toMatch(new RegExp(`\\b${key}: "[^"]+"`)); });
  });
});
