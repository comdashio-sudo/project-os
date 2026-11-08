import { existsSync, readdirSync, readFileSync } from "node:fs";
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

// D-37: the files are direction A — the literal colours of client/src/design/directions.css, the word drawn as paths.
const brandDir = path.join(root, "client/public/brand");
const svgFiles = readdirSync(brandDir).filter(f => f.endsWith(".svg"));
const directions = read("client/src/design/directions.css");
const token = (block: RegExp, name: string) => {
  const body = directions.match(block)?.[1] ?? "";
  return body.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1]?.toLowerCase();
};
const lightA = /\[data-direction="a"\]\s*\{([^}]*)\}/;
const darkA = /\[data-direction="a"\]\[data-mode="dark"\]\s*\{([^}]*)\}/;
const colours = (svg: string) => new Set([...svg.matchAll(/#[0-9a-f]{6}\b/gi)].map(m => m[0].toLowerCase()));
const pngSize = (file: string) => {
  const png = readFileSync(path.join(brandDir, file));
  expect(png.subarray(1, 4).toString("latin1"), file).toBe("PNG");
  expect(png.subarray(12, 16).toString("latin1"), file).toBe("IHDR");
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};
/** The rule the SVG test enforces, kept as a function so the negative case can feed it a bad file. */
const svgProblems = (svg: string) => [
  ...(/<text\b/i.test(svg) ? ["<text> (the word must be paths)"] : []),
  ...(/font-family|@font-face/i.test(svg) ? ["depends on a font"] : []),
  ...(/#4a46e8/i.test(svg) ? ["old brand colour #4A46E8"] : []),
  ...(/var\(--/.test(svg) ? ["CSS variable (a standalone SVG cannot read it)"] : []),
];

describe("brand assets are direction A (D-37)", () => {
  it("has every file the brief lists, at the right pixel size", () => {
    for (const [file, size] of [["favicon-16.png", 16], ["favicon-32.png", 32], ["favicon-48.png", 48], ["appicon-192.png", 192], ["appicon-512.png", 512], ["appicon-maskable-512.png", 512]] as const) {
      expect(pngSize(file), file).toEqual([size, size]);
    }
    for (const file of ["logo-horizontal.svg", "logo-horizontal-on-dark.svg", "icon-primary.svg", "favicon.svg", "favicon.ico"]) expect(existsSync(path.join(brandDir, file)), file).toBe(true);
    const ico = readFileSync(path.join(brandDir, "favicon.ico"));
    expect([ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([1, 3]);
  });

  it("no SVG has <text>, a font, a CSS variable or the old colour", () => {
    expect(svgFiles.length).toBeGreaterThanOrEqual(4);
    for (const file of svgFiles) expect(svgProblems(read(`client/public/brand/${file}`)), file).toEqual([]);
  });

  it("rejects an SVG whose word is a <text> element in the old colour (negative)", () => {
    const old = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#4A46E8"/><text font-family="Inter">Dashio</text></svg>';
    expect(svgProblems(old)).toEqual(["<text> (the word must be paths)", "depends on a font", "old brand colour #4A46E8"]);
  });

  it("uses the light direction A tokens on the light files and the dark ones on the on-dark logo", () => {
    const light = ["primary", "primary-foreground", "secondary", "foreground"].map(n => token(lightA, n));
    const dark = ["primary", "primary-foreground", "secondary", "foreground"].map(n => token(darkA, n));
    expect(light).toEqual(["#4338ca", "#ffffff", "#2ed3c6", "#0c1023"]);
    expect(dark).toEqual(["#9a97f7", "#0a0e1e", "#2ed3c6", "#e6eaf6"]);
    expect(colours(read("client/public/brand/logo-horizontal.svg"))).toEqual(new Set(light));
    expect(colours(read("client/public/brand/logo-horizontal-on-dark.svg"))).toEqual(new Set(dark));
    for (const file of ["icon-primary.svg", "favicon.svg", "icon-maskable.svg"]) expect(colours(read(`client/public/brand/${file}`)), file).toEqual(new Set(light.slice(0, 3)));
  });

  it("the manifest and index.html carry direction A colours, a maskable icon and light/dark theme-color", () => {
    const manifest = JSON.parse(read("client/public/manifest.webmanifest"));
    expect(manifest.theme_color).toBe(token(lightA, "primary"));
    expect(manifest.background_color).toBe(token(lightA, "background"));
    expect(manifest.icons.some((icon: { purpose?: string; sizes: string }) => icon.purpose === "maskable" && icon.sizes === "512x512")).toBe(true);
    const html = read("client/index.html");
    expect(html).toContain(`<meta name="theme-color" media="(prefers-color-scheme: light)" content="${token(lightA, "primary")}" />`);
    expect(html).toContain(`<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${token(darkA, "background")}" />`);
    expect(html).toContain('href="/brand/favicon.ico"');
    expect(html.toLowerCase()).not.toContain("#4a46e8");
  });
});
