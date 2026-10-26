import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The design rules of work order 19 are held by the build (scripts/check-design-rules.mjs, run by `pnpm check`). This proves the rules catch what they name, leave comments and the
// component library's own internals alone, and that a NEW violation in a screen fails while the recorded legacy ones do not.
const script = path.resolve(import.meta.dirname, "../../scripts/check-design-rules.mjs");
const load = async () => (await import(/* @vite-ignore */ script)) as { violationsOf: (file: string, source: string) => Record<string, number> };
const run = (rootDir?: string) => spawnSync(process.execPath, [script], { env: { ...process.env, ...(rootDir ? { DESIGN_RULES_ROOT: rootDir } : {}) }, encoding: "utf8" });

describe("design rules: what each rule catches", () => {
  it("western digits: an Arabic-Indic or Persian digit in screen code is a violation, the example title included", async () => {
    const { violationsOf } = await load();
    expect(violationsOf("client/src/pages/X.tsx", 'const t = "٢. أول مشروع";')).toEqual({ "western-digits": 1 });
    expect(violationsOf("client/src/pages/X.tsx", 'const t = "۱۲۳";')).toEqual({ "western-digits": 3 });
    expect(violationsOf("client/src/pages/X.tsx", 'const t = "2. أول مشروع";')).toEqual({});
  });
  it("raw browser controls: input type=file and select/option are violations outside the library, and allowed inside it", async () => {
    const { violationsOf } = await load();
    expect(violationsOf("client/src/pages/X.tsx", '<input type="file" onChange={f} />')).toEqual({ "raw-file-input": 1 });
    expect(violationsOf("client/src/pages/X.tsx", "<select value={a}><option value=\"1\">x</option></select>")).toEqual({ "raw-select": 2 });
    expect(violationsOf("client/src/components/ds/FileDropzone.tsx", '<input type="file" className="sr-only" />')).toEqual({});
  });
  it("colours: a hex in a class or style, and rgb()/hsl()/oklch(), are violations; a token is not", async () => {
    const { violationsOf } = await load();
    expect(violationsOf("client/src/pages/X.tsx", '<p className="text-[#0e6b70]">x</p>')).toEqual({ "hardcoded-colour": 1 });
    expect(violationsOf("client/src/pages/X.tsx", '<p style={{ color: "#112233" }}>x</p>')["hardcoded-colour"]).toBeGreaterThan(0);
    expect(violationsOf("client/src/pages/X.tsx", 'const c = "rgb(1, 2, 3)";')).toEqual({ "hardcoded-colour": 1 });
    expect(violationsOf("client/src/pages/X.tsx", '<p className="text-primary bg-card" style={{ color: "var(--primary)" }}>x</p>')).toEqual({});
  });
  it("number format: toLocaleString / Intl / toFixed to print a figure are violations everywhere but the format module", async () => {
    const { violationsOf } = await load();
    expect(violationsOf("client/src/pages/X.tsx", "const a = n.toLocaleString();")).toEqual({ "number-format": 1 });
    expect(violationsOf("client/src/pages/X.tsx", "const a = n.toFixed(2);")).toEqual({ "number-format": 1 });
    expect(violationsOf("client/src/components/ds/format.ts", "new Intl.NumberFormat('en-US'); n.toFixed(1)")).toEqual({});
  });
  it("a comment may quote a bad example without failing", async () => {
    const { violationsOf } = await load();
    expect(violationsOf("client/src/pages/X.tsx", '// never "٢. أول مشروع" nor <select>\n/* <input type="file"> */\nconst ok = 1;')).toEqual({});
  });
});

describe("design rules: the build gate", () => {
  it("passes on the tree as it is (the recorded legacy violations only, nothing new)", () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/design rules ok/);
  });
  it("fails on a NEW violation in a screen, and names the file and the rule", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "design-rules-"));
    try {
      mkdirSync(path.join(dir, "client/src/pages"), { recursive: true });
      writeFileSync(path.join(dir, "client/src/pages/Fresh.tsx"), 'export const A = () => <div><select><option>1</option></select><input type="file" /><b>٢. أول مشروع</b></div>;');
      const result = run(dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/client\/src\/pages\/Fresh\.tsx: raw-select 2 \(allowed 0\)/);
      expect(result.stderr).toMatch(/raw-file-input 1/);
      expect(result.stderr).toMatch(/western-digits 1/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("the design system itself is held to zero with no baseline: a colour value in client/src/components/ds fails", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "design-rules-"));
    try {
      mkdirSync(path.join(dir, "client/src/components/ds"), { recursive: true });
      writeFileSync(path.join(dir, "client/src/components/ds/Bad.tsx"), 'export const B = () => <p className="text-[#123456]">x</p>;');
      const result = run(dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/components\/ds\/Bad\.tsx: hardcoded-colour 1 \(allowed 0\)/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
