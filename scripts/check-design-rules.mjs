// The design rules of work order 19, held by the build (`pnpm check`). D-76: the ceiling is ZERO for every file, with no baseline: the legacy violations recorded in
// scripts/design-rules-baseline.json were all fixed by D-75 (630 -> 0), so that file and its `--update` are gone, and one violation anywhere fails the build.
// The only way past a rule is the marked colour exemption below (a canvas pixel, PDF paper, an <input type=color> default), with its reason on the same line.
//
//   western-digits    Arabic-Indic (U+0660-0669) and Persian (U+06F0-06F9) digits in screen code: every figure is 0-9 (docs/TASLEEM_LESSONS.md section 6). "٢. أول مشروع" is the example.
//   raw-file-input    <input type="file"> outside the component library: the browser's own "Choose File" is never shown; FileDropzone is the one place.
//   raw-select        <select> and <option> outside the component library: the custom Select is the one list.
//   hardcoded-colour  a colour written as a value in a screen (a #hex in a class or style, rgb()/hsl()/oklch()): colours come from the tokens in client/src/design/directions.css.
//   number-format     toLocaleString / toLocaleDateString / toLocaleTimeString / Intl.NumberFormat / toFixed used to PRINT a figure or a date outside client/src/components/ds/format.ts: one place formats numbers.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.env.DESIGN_RULES_ROOT ? path.resolve(process.env.DESIGN_RULES_ROOT) : path.resolve(import.meta.dirname, "..");
const SCAN = ["client/src"];
const LIBRARY = /^client\/src\/components\/ds\//;
const FORMAT_MODULE = "client/src/components/ds/format.ts";

const rules = {
  "western-digits": { test: text => count(text, /[٠-٩۰-۹]/g), inLibrary: true },
  "raw-file-input": { test: text => count(text, /<input\b[^>]*\btype=["']file["']/g), inLibrary: false },
  // a <datalist> is the suggestions under a free-text field, not a list to pick from: its <option>s are not a raw select
  "raw-select": { test: text => { const lists = text.replace(/<datalist[\s>][\s\S]*?<\/datalist>/g, " "); return count(lists, /<select[\s>]/g) + count(lists, /<option[\s>]/g); }, inLibrary: false },
  "hardcoded-colour": { test: text => count(text, /\[#[0-9a-fA-F]{3,8}\]/g) + count(text, /(?:fill|stroke|color|background(?:Color)?|borderColor)\s*[:=]\s*\{?["'`]#[0-9a-fA-F]{3,8}["'`]/g) + count(text, /["'`]#[0-9a-fA-F]{6}["'`]/g) + count(text, /\b(?:rgb|rgba|hsl|hsla|oklch)\(/g), inLibrary: true },
  "number-format": { test: (text, file) => (file === FORMAT_MODULE ? 0 : count(text, /\.toLocaleString\(/g) + count(text, /\bIntl\.(?:NumberFormat|DateTimeFormat)\b/g) + count(text, /\.toFixed\(/g) + count(text, /\.toLocale(?:Date|Time)String\(/g)), inLibrary: true },
};
function count(text, pattern) { return (text.match(pattern) ?? []).length; }

function* walk(dir) {
  for (const name of readdirSync(path.join(root, dir))) {
    const relative = `${dir}/${name}`;
    const stat = statSync(path.join(root, relative));
    // client/src/test holds test fixtures and stand-ins (e.g. a native select standing in for the Radix list in jsdom); they never ship, so they are not screens
    if (stat.isDirectory()) { if (name !== "node_modules" && relative !== "client/src/test") yield* walk(relative); }
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield relative;
  }
}

/** The violations of one file, comments excluded (a comment may quote a bad example). */
// A colour that cannot be a token (a canvas pixel, the paper of a PDF, the #rrggbb an <input type="color"> requires) is marked on its own line with
// "design-rules: allow hardcoded-colour — <why>" (a reason of at least 10 characters). The mark exempts that line from the colour rule only, never from another rule.
const COLOUR_ALLOWED = /design-rules: allow hardcoded-colour\s*[—-]\s*\S.{9,}/;
const withoutCommentsOf = source => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function violationsOf(file, source) {
  const text = withoutCommentsOf(source);
  const colourText = withoutCommentsOf(source.split("\n").filter(line => !COLOUR_ALLOWED.test(line)).join("\n"));
  const found = {};
  for (const [rule, { test, inLibrary }] of Object.entries(rules)) {
    if (!inLibrary && LIBRARY.test(file)) continue;
    const n = test(rule === "hardcoded-colour" ? colourText : text, file);
    if (n) found[rule] = n;
  }
  return found;
}

export function scan() {
  const result = {};
  for (const base of SCAN) for (const file of walk(base)) { const found = violationsOf(file, readFileSync(path.join(root, file), "utf8")); if (Object.keys(found).length) result[file] = found; }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const current = scan();
  const failures = Object.entries(current).flatMap(([file, found]) => Object.entries(found).map(([rule, n]) => `${file}: ${rule} ${n} (allowed 0)`));
  if (failures.length) {
    console.error("design rules (work order 19) violated:\n" + failures.map(line => `  - ${line}`).join("\n"));
    console.error("\nUse the shared components (client/src/components/ds), the tokens (client/src/design/directions.css) and the format module (client/src/components/ds/format.ts).");
    process.exit(1);
  }
  console.log("design rules ok: 0 violations (the ceiling is zero, no baseline)");
}
