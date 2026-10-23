// WCAG 2.x contrast ratio of two sRGB colours written as #rgb or #rrggbb (docs/UI_AUDIT.md section 11).
// Used by the static accessibility checks in client/src/lib/accessibility.static.test.tsx to test the colour tokens and the
// colours a screen uses. The browser measurement in the audit reads computed colours instead; it does not use this file.

export type Rgb = readonly [number, number, number];

export function parseHex(color: string): Rgb {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color.trim());
  if (!match) throw new Error(`not a #rgb or #rrggbb colour: ${color}`);
  const digits = match[1].length === 3 ? match[1].split("").map(d => d + d).join("") : match[1];
  return [0, 2, 4].map(i => parseInt(digits.slice(i, i + 2), 16)) as unknown as Rgb;
}

// Relative luminance (WCAG 2.x definition) of an sRGB colour.
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(channel => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contrast ratio between two colours, from 1 (identical) to 21 (black on white). Order does not matter.
export function contrastRatio(a: string, b: string): number {
  const x = relativeLuminance(parseHex(a));
  const y = relativeLuminance(parseHex(b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// WCAG AA thresholds: 4.5:1 for normal text, 3:1 for large text (24px, or 18.66px bold) and for the boundary of a control (1.4.11).
export const AA_TEXT = 4.5;
export const AA_LARGE_TEXT_AND_CONTROL = 3;
