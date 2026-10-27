// Work order 21: moves a screen's hand-written colours onto the design tokens (client/src/design/directions.css), so the screen follows the
// chosen direction and its dark mode. It rewrites Tailwind classes only, by a fixed table; it never guesses. Run it on named files, then read
// the diff: a class that is not in the table stays as it is (scripts/check-design-rules.mjs still counts any #hex that is left).
//
//   node scripts/design/to-tokens.mjs client/src/pages/ProjectControls.tsx [more files...]
import { readFileSync, writeFileSync } from "node:fs";

// [pattern, replacement]. Order matters: the specific forms come before the general ones.
export const TOKEN_TABLE = [
  // page grounds and surfaces
  [/\bbg-\[#f4f6f8\]/g, "bg-background"], [/\bbg-\[#f7f8fc\]/g, "bg-background"], [/\bbg-slate-50\b/g, "bg-muted"], [/\bbg-slate-100\b/g, "bg-muted"],
  [/\bhover:bg-slate-50\b/g, "hover:bg-muted"], [/\bhover:bg-slate-100\b/g, "hover:bg-muted"], [/\bbg-white\b/g, "bg-card"],
  // text
  [/\btext-slate-(?:900|950|800)\b/g, "text-foreground"], [/\btext-slate-(?:700|600|500|400|300)\b/g, "text-muted-foreground"],
  // lines
  [/\bring-slate-(?:100|200|300)\b/g, "ring-border"], [/\bborder-slate-(?:100|200)\b/g, "border-border"], [/\bborder-slate-300\b/g, "border-input"], [/\bdivide-slate-(?:100|200)\b/g, "divide-border"],
  // the old teal brand and its tints -> the direction's primary and accent
  [/\bhover:bg-\[#0b5559\]/g, "hover:bg-primary/90"], [/\bbg-\[#0e6b70\]/g, "bg-primary"], [/\btext-\[#0e6b70\]/g, "text-primary"], [/\bborder-\[#0e6b70\]/g, "border-primary"],
  [/\bring-\[#0e6b70\]/g, "ring-ring"], [/\bbg-\[#e6f4f3\]/g, "bg-accent"], [/\btext-\[#74d0c1\]/g, "text-primary"], [/\bborder-\[#74d0c1\]/g, "border-primary"], [/\bhover:border-\[#74d0c1\]/g, "hover:border-primary"],
  [/\bborder-\[#bde8df\]/g, "border-border"], [/\bbg-\[#123a4a\]/g, "bg-primary"], [/\bhover:bg-\[#123a4a\]/g, "hover:bg-primary"],
  [/\bbg-\[#5147e5\]/g, "bg-primary"], [/\bhover:bg-\[#4338ca\]/g, "hover:bg-primary/90"],
  [/\bbg-gradient-to-br from-\[#edf9f7\] via-white to-\[#f5fbff\]/g, "bg-card"], [/\bbg-gradient-to-br from-\[#edf9f7\] via-bg-card to-\[#f5fbff\]/g, "bg-card"],
  // states
  [/\bborder-red-(?:100|200|300)\b/g, "border-destructive/30"], [/\bbg-red-50\b/g, "bg-danger-soft"], [/\btext-red-(?:700|800|900|950)\b/g, "text-danger-soft-foreground"], [/\btext-red-600\b/g, "text-destructive"],
  [/\bborder-amber-(?:100|200|300)\b/g, "border-warning/30"], [/\bbg-amber-50\b/g, "bg-warning-soft"], [/\btext-amber-(?:800|900|950)\b/g, "text-warning-soft-foreground"],
  [/\bborder-emerald-(?:100|200|300)\b/g, "border-success/30"], [/\bbg-emerald-50\b/g, "bg-success-soft"], [/\btext-emerald-(?:700|800|900|950)\b/g, "text-success-soft-foreground"],
  [/\bborder-sky-(?:100|200|300)\b/g, "border-info/30"], [/\bbg-sky-50\b/g, "bg-info-soft"], [/\btext-sky-(?:800|900|950)\b/g, "text-info-soft-foreground"],
];

export function toTokens(source) {
  let out = source;
  for (const [pattern, replacement] of TOKEN_TABLE) out = out.replace(pattern, replacement);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const file of process.argv.slice(2)) {
    const before = readFileSync(file, "utf8");
    const after = toTokens(before);
    if (after !== before) writeFileSync(file, after);
    console.log(`${file}: ${after === before ? "unchanged" : "rewritten"}`);
  }
}
