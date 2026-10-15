import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const publicFile = (url: string) => path.join(root, "client/public", url.replace(/^\//, ""));

// Every brand asset the pages, the manifest and BrandMark point at must exist
// in client/public, and none may point at the old platform-hosted path.
describe("brand assets", () => {
  const references = [
    ...[...read("client/index.html").matchAll(/(?:href|src)="(\/brand\/[^"]+)"/g)].map(m => m[1]),
    ...[...read("client/public/manifest.webmanifest").matchAll(/"src":\s*"([^"]+)"/g)].map(m => m[1]),
    ...[...read("client/src/components/BrandMark.tsx").matchAll(/"(\/brand\/[^"]+)"/g)].map(m => m[1]),
  ];

  it("finds the references it is supposed to check", () => {
    expect(references.length).toBeGreaterThanOrEqual(10);
  });

  it("serves every referenced asset from client/public", () => {
    for (const url of new Set(references)) expect(existsSync(publicFile(url)), url).toBe(true);
  });

  it("no longer points at the platform-hosted storage path", () => {
    for (const file of ["client/index.html", "client/public/manifest.webmanifest", "client/src/components/BrandMark.tsx"]) {
      expect(read(file), file).not.toContain("/manus-storage/");
    }
  });
});
