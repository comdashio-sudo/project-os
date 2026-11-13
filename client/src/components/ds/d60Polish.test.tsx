import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// D-60: the design review's non-blocking notes on what was merged, held in place by reading the sources (the screens' own tests cover their behaviour).
const read = (path: string) => readFileSync(new URL(`../../../../${path}`, import.meta.url));

describe("D-60 polish", () => {
  it("(1) the shell's menu, language and user buttons, and their menu items, are 44px", () => {
    const shell = read("client/src/components/ds/AppShell.tsx").toString();
    expect(shell).not.toMatch(/\bh-10 w-10\b/);
    expect(shell).not.toMatch(/flex min-h-10 cursor-pointer/);
    expect(shell.match(/grid h-11 w-11/g)?.length).toBeGreaterThanOrEqual(4);
  });
  it("(2) the project pages strip has no second PMC link (the PMC tab on the same page is the one), and every link is 44px at every width", () => {
    const controls = read("client/src/pages/ProjectControls.tsx").toString();
    expect(controls).not.toContain('["pmc", pickLanguage(language, { ar: "ضبط المشروع PMC", en: "Project control (PMC)"');
    expect(controls).not.toContain("px-3 md:min-h-10 text-sm");
  });
  it("(3) the WBS progress, planned value and cost amounts are formatted, not printed raw", () => {
    const controls = read("client/src/pages/ProjectControls.tsx").toString();
    for (const raw of ["{item.progressPercent}%", "{t.actual}: {entry.amount}", "{t.planned}: {item.plannedValue}"]) expect(controls).not.toContain(raw);
  });
  it("(4) and (5) the import job box uses the accent token, and «replace with a newer version» sits behind the module's write permission", () => {
    const imports = read("client/src/pages/ProjectImports.tsx").toString();
    expect(imports).not.toContain("bg-[#e6f4f3]");
    expect(imports).toMatch(/isReplaceable\(record\.moduleCode\) && <WriteGate permission=\{importModulePermissions\[record\.moduleCode\]\}/);
  });
  it("(7) /favicon.ico at the root is the icon itself, not the page", () => {
    expect(read("client/public/favicon.ico").equals(read("client/public/brand/favicon.ico"))).toBe(true);
  });
});
