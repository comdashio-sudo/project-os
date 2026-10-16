import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Found by the automatic accessibility check (scripts/check-accessibility.mjs): the page told the browser not to let people zoom,
// which locks out anyone who needs larger text. It stays out.
describe("accessibility guards", () => {
  const html = readFileSync(join(__dirname, "..", "client", "index.html"), "utf8");
  const viewport = /<meta\s+name="viewport"\s+content="([^"]*)"/s.exec(html)?.[1] ?? "";

  it("has a viewport that does not forbid zooming", () => {
    expect(viewport).toContain("width=device-width");
    expect(viewport).not.toMatch(/maximum-scale\s*=\s*1(\.0)?\b/);
    expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)/);
  });

  it("keeps the muted text colour readable on white (4.5:1)", () => {
    const css = readFileSync(join(__dirname, "..", "client", "src", "index.css"), "utf8");
    const slate = /--dashio-slate:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1] ?? "";
    const channel = (hex: string, offset: number) => { const value = parseInt(hex.slice(offset, offset + 2), 16) / 255; return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };
    const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
    const ratio = (1 + 0.05) / (luminance(slate) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
