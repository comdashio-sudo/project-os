// Secret scan. Modes:
//   node scripts/scan-secrets.mjs --diff <base-ref>   added lines of `git diff <base-ref>...HEAD`
//   node scripts/scan-secrets.mjs --all                every tracked text file
//   node scripts/scan-secrets.mjs --stdin              text from stdin (tests)
// Exit 1 on any finding. A finding prints file:line and the rule, never the matched value.
// A line carrying `secret-scan:allow` is skipped (use for documented fake values).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const RULES = [
  ["aws-access-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["private-key-block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["github-token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}\b/],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["stripe-live-key", /\b[sr]k_live_[A-Za-z0-9]{16,}\b/],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["resend-api-key", /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b|\bre_[A-Za-z0-9]{32,}\b/],
  ["openai-style-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  [
    "credentialed-connection-string",
    /\b(?:mysql2?|postgres(?:ql)?|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:/@'"`]+:[^\s@'"`]{3,}@(?!(?:[^\s/'"`]*\bexample\b|localhost|127\.0\.0\.1|db\.example|host\b|hostname\b))[^\s/'"`]+/,
  ],
  [
    "assigned-secret-literal",
    /\b[A-Z][A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*[=:]\s*["']?(?!process\.env|\$\{|<|\[|your_|example|changeme)[A-Za-z0-9+/_-]{20,}["']?/,
  ],
];

const SKIP_FILES = /(^|\/)(pnpm-lock\.yaml|.*\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|xlsx|zip|gz))$/i;

export function scanText(text, label) {
  const findings = [];
  text.split("\n").forEach((line, index) => {
    if (line.includes("secret-scan:allow")) return;
    for (const [rule, pattern] of RULES) if (pattern.test(line)) findings.push({ label, line: index + 1, rule });
  });
  return findings;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function scanDiff(base) {
  const findings = [];
  let file = null;
  let newLine = 0;
  for (const raw of git("diff", "--unified=0", "--no-color", `${base}...HEAD`).split("\n")) {
    if (raw.startsWith("+++ ")) {
      file = raw.slice(4).replace(/^b\//, "");
      if (file === "/dev/null" || SKIP_FILES.test(file)) file = null;
    } else if (raw.startsWith("@@")) {
      newLine = Number(/\+(\d+)/.exec(raw)?.[1] ?? 0) - 1;
    } else if (file && raw.startsWith("+") && !raw.startsWith("+++")) {
      newLine += 1;
      findings.push(...scanText(raw.slice(1), file).map(f => ({ ...f, line: newLine })));
    }
  }
  return findings;
}

function scanAll() {
  const findings = [];
  for (const file of git("ls-files", "-z").split("\0").filter(Boolean)) {
    if (SKIP_FILES.test(file)) continue;
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\u0000")) continue;
    findings.push(...scanText(text, file));
  }
  return findings;
}

const [mode, arg] = process.argv.slice(2);
let findings;
if (mode === "--diff" && arg) findings = scanDiff(arg);
else if (mode === "--all") findings = scanAll();
else if (mode === "--stdin") findings = scanText(readFileSync(0, "utf8"), "stdin");
else {
  console.error("usage: scan-secrets.mjs --diff <base-ref> | --all | --stdin");
  process.exit(2);
}
for (const f of findings) console.error(`${f.label}:${f.line}  ${f.rule}`);
console.log(JSON.stringify({ mode, findings: findings.length }));
process.exit(findings.length ? 1 : 0);
