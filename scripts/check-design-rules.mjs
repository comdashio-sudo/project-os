// The design rules of work order 19, held by the build (`pnpm check`). Four rules, each a ratchet: a file may not get WORSE than scripts/design-rules-baseline.json records,
// and a file that is not in the baseline starts at zero. The design system itself (client/src/components/ds, client/src/design, client/src/pages/DesignPreview*.tsx) is held to zero
// with no baseline at all. Fixing a violation lowers the number; `--update` rewrites the baseline from the current tree (run it only after FIXING, never to hide a new violation).
//
//   western-digits    Arabic-Indic (U+0660-0669) and Persian (U+06F0-06F9) digits in screen code: every figure is 0-9 (docs/TASLEEM_LESSONS.md section 6). "٢. أول مشروع" is the example.
//   raw-file-input    <input type="file"> outside the component library: the browser's own "Choose File" is never shown; FileDropzone is the one place.
//   raw-select        <select> and <option> outside the component library: the custom Select is the one list.
//   hardcoded-colour  a colour written as a value in a screen (a #hex in a class or style, rgb()/hsl()/oklch()): colours come from the tokens in client/src/design/directions.css.
//   number-format     toLocaleString / Intl.NumberFormat / toFixed used to PRINT a figure outside client/src/components/ds/format.ts: one place formats numbers.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.env.DESIGN_RULES_ROOT ? path.resolve(process.env.DESIGN_RULES_ROOT) : path.resolve(import.meta.dirname, "..");
const BASELINE = path.join(root, "scripts/design-rules-baseline.json");
const SCAN = ["client/src"];
const STRICT = [/^client\/src\/components\/ds\//, /^client\/src\/design\//, /^client\/src\/pages\/DesignPreview(Frame)?\.tsx$/];
const LIBRARY = /^client\/src\/components\/ds\//;
const FORMAT_MODULE = "client/src/components/ds/format.ts";

const rules = {
  "western-digits": { test: text => count(text, /[٠-٩۰-۹]/g), inLibrary: true },
  "raw-file-input": { test: text => count(text, /<input\b[^>]*\btype=["']file["']/g), inLibrary: false },
  "raw-select": { test: text => count(text, /<select[\s>]/g) + count(text, /<option[\s>]/g), inLibrary: false },
  "hardcoded-colour": { test: text => count(text, /\[#[0-9a-fA-F]{3,8}\]/g) + count(text, /(?:fill|stroke|color|background(?:Color)?|borderColor)\s*[:=]\s*\{?["'`]#[0-9a-fA-F]{3,8}["'`]/g) + count(text, /["'`]#[0-9a-fA-F]{6}["'`]/g) + count(text, /\b(?:rgb|rgba|hsl|hsla|oklch)\(/g), inLibrary: true },
  "number-format": { test: (text, file) => (file === FORMAT_MODULE ? 0 : count(text, /\.toLocaleString\(/g) + count(text, /\bIntl\.(?:NumberFormat|DateTimeFormat)\b/g) + count(text, /\.toFixed\(/g)), inLibrary: true },
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
export function violationsOf(file, source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const found = {};
  for (const [rule, { test, inLibrary }] of Object.entries(rules)) {
    if (!inLibrary && LIBRARY.test(file)) continue;
    const n = test(text, file);
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
  if (process.argv.includes("--update")) {
    const kept = Object.fromEntries(Object.entries(current).filter(([file]) => !STRICT.some(pattern => pattern.test(file))));
    writeFileSync(BASELINE, JSON.stringify(kept, null, 1) + "\n");
    console.log(`design-rules baseline written: ${Object.keys(kept).length} files`);
    process.exit(0);
  }
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
  const failures = []; let improved = 0;
  for (const [file, found] of Object.entries(current)) {
    const strict = STRICT.some(pattern => pattern.test(file));
    for (const [rule, n] of Object.entries(found)) {
      const allowed = strict ? 0 : (baseline[file]?.[rule] ?? 0);
      if (n > allowed) failures.push(`${file}: ${rule} ${n} (allowed ${allowed})`);
    }
  }
  for (const [file, was] of Object.entries(baseline)) for (const [rule, n] of Object.entries(was)) if ((current[file]?.[rule] ?? 0) < n) improved += 1;
  if (failures.length) {
    console.error("design rules (work order 19) violated:\n" + failures.map(line => `  - ${line}`).join("\n"));
    console.error("\nUse the shared components (client/src/components/ds), the tokens (client/src/design/directions.css) and the format module (client/src/components/ds/format.ts).");
    process.exit(1);
  }
  const total = Object.values(baseline).reduce((sum, was) => sum + Object.values(was).reduce((a, b) => a + b, 0), 0);
  console.log(`design rules ok: ${Object.keys(current).length} files carry the ${total} recorded legacy violations, none new${improved ? `; ${improved} entries improved -- run with --update to lock the gain in` : ""}`);
}
