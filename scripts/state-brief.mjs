#!/usr/bin/env node
// Compact reader for docs/STATE.md (757 KB, ~1,900 long lines): an agent reads the part its task needs
// instead of the whole file. Read-only; prints nothing secret (it only echoes STATE.md and OWNER_ACTIONS.md,
// which are committed). See CLAUDE.md §9.
//
//   node scripts/state-brief.mjs                 outline of the newest headings + the newest section + owner blockers
//   node scripts/state-brief.mjs --grep D-79     matching lines (line number, cut to --width)
//   node scripts/state-brief.mjs --section 1842  the section starting at that line, up to the next heading of its level
//   node scripts/state-brief.mjs --since bd61c0c lines added to STATE.md since that commit (what changed since you last read)
//   options: --headings N (default 15), --width N (default 400 chars per line)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const STATE = "docs/STATE.md";
const OWNER = "docs/OWNER_ACTIONS.md";
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const width = Number(opt("--width", 400));
const cut = (s) => (s.length > width ? `${s.slice(0, width)} …[+${s.length - width}]` : s);
const lines = readFileSync(STATE, "utf8").split("\n");
const level = (s) => (/^(#{1,6}) /.exec(s)?.[1].length ?? 0);

function section(start) {
  const lv = level(lines[start]) || 7;
  let end = start + 1;
  while (end < lines.length && !(level(lines[end]) && level(lines[end]) <= lv)) end++;
  return lines.slice(start, end).map((l, i) => `${start + 1 + i}: ${cut(l)}`).join("\n");
}

if (args.includes("--grep")) {
  const re = new RegExp(opt("--grep", ""), "i");
  lines.forEach((l, i) => re.test(l) && console.log(`${i + 1}: ${cut(l)}`));
} else if (args.includes("--section")) {
  console.log(section(Number(opt("--section", "1")) - 1));
} else if (args.includes("--since")) {
  const diff = execFileSync("git", ["diff", "--unified=0", opt("--since", "HEAD"), "--", STATE], { encoding: "utf8" });
  for (const l of diff.split("\n")) {
    if (l.startsWith("@@")) console.log(l.replace(/^@@ [^+]*\+(\d+).*/, "-- from line $1"));
    else if (l.startsWith("+") && !l.startsWith("+++")) console.log(cut(l.slice(1)));
  }
} else {
  const n = Number(opt("--headings", 15));
  const last = execFileSync("git", ["log", "-1", "--format=%h %ad %s", "--date=short", "--", STATE], { encoding: "utf8" }).trim();
  console.log(`${STATE}: ${lines.length} lines, ${Buffer.byteLength(lines.join("\n"))} bytes; last change ${last}`);
  console.log(`\n# Newest ${n} headings (line: heading)`);
  const heads = [];
  lines.forEach((l, i) => level(l) >= 2 && level(l) <= 3 && heads.push(i));
  for (const i of heads.slice(-n)) console.log(`${i + 1}: ${cut(lines[i])}`);
  console.log("\n# Newest section");
  console.log(section(heads.at(-1)));
  console.log(`\n# Owner actions still blocked (${OWNER})`);
  readFileSync(OWNER, "utf8").split("\n").forEach((l, i) => /^## .*BLOCKED_BY_OWNER/.test(l) && console.log(`${i + 1}: ${cut(l)}`));
  console.log("\nMore: --grep <term> | --section <line> | --since <commit>");
}
