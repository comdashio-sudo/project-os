import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// D-78: .github/workflows/migrate-production.yml deploys production itself with the Vercel CLI, and the ORDER of its steps is the safety: nothing reaches
// production unless the migrations (2), verify-db-security (2b) and the release check (3) passed first. The repository has no YAML library, so the job is
// read as text and cut into its "- name:" / "- uses:" blocks (the same approach as supabasePublicConfig.test.ts). releaseProblems() returns every rule a
// workflow text breaks; the committed file must break none, and each of the three mutations below must break at least one.
const root = path.resolve(import.meta.dirname, "../..");
const workflowsDir = path.join(root, ".github/workflows");
const releaseFile = "migrate-production.yml";
const releaseText = readFileSync(path.join(workflowsDir, releaseFile), "utf8");
const SCOPE_CONDITION = "steps.scope.outputs.deploy == 'true'";
// D-85: the CLI deployment (4b) and its check (5) run only when scripts/ci/vercel-access.sh found the token able to use the project
const CLI_CONDITION = `${SCOPE_CONDITION} && steps.config.outputs.cli == 'true'`;
const accessScript = readFileSync(path.join(root, "scripts/ci/vercel-access.sh"), "utf8");

type Step = { name: string; text: string };

/** The steps of the one job, in order. A step starts at a line "      - name:" or "      - uses:" (six spaces: jobs.<job>.steps). */
export function workflowSteps(text: string): Step[] {
  const lines = text.replace(/\n+$/, "").split("\n"); // no empty last line: each block is exactly the text of the file
  const start = lines.findIndex(line => /^ {4}steps:\s*$/.test(line));
  if (start < 0) return [];
  const steps: Step[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^ {0,3}\S/.test(line)) break; // the next job or top-level key
    const head = /^ {6}- (name|uses): (.*)$/.exec(line);
    if (head) steps.push({ name: head[1] === "name" ? head[2].trim() : `uses ${head[2].trim()}`, text: `${line}\n` });
    else if (steps.length) steps[steps.length - 1].text += `${line}\n`;
  }
  return steps;
}

/** The step's own `if:` value ("" when it has none). */
function condition(step: Step): string {
  return /^ {8}if: (.*)$/m.exec(step.text)?.[1].trim() ?? "";
}

const firstIndex = (steps: Step[], test: (step: Step) => boolean) => steps.findIndex(test);
const named = (prefix: string) => (step: Step) => step.name.startsWith(prefix);

/** The body of a shell function `name() { … }` in a step (up to its closing brace at the same indentation). */
function shellFunction(text: string, name: string): string {
  const match = new RegExp(`^( *)${name}\\(\\) \\{\\n([\\s\\S]*?)^\\1\\}`, "m").exec(text);
  return match?.[2] ?? "";
}

/** Step 5's rules (QA and engineering review on #231). */
function verifyProblems(step: Step): string[] {
  const problems: string[] = [];
  const text = step.text;
  if (/always\(\)|failure\(\)|cancelled\(\)/.test(condition(step))) problems.push("step 5 runs after a failed deployment");
  // a failing check must reach its handler: GitHub's default shell is `bash -e`, which ends the step on the failing pipeline itself
  const shell = /^ {8}shell: (.*)$/m.exec(text)?.[1] ?? "";
  const errexitOff = (shell !== "" && !/(^|\s)-[a-z]*e/.test(shell.replace(/--\w+/g, ""))) || /^\s*set \+e\b/m.test(text);
  if (!errexitOff) problems.push("step 5 runs under bash -e (the default shell): a failed check ends the step before the rollback");
  if (/^\s*set -[a-z]*e/m.test(text)) problems.push("step 5 turns errexit on");
  if (!/^\s*set -[a-z]*o pipefail\b/m.test(text)) problems.push("step 5 has no set -o pipefail");
  const fail = shellFunction(text, "fail");
  const rollBack = shellFunction(text, "roll_back");
  if (!/^\s*exit 1\s*$/m.test(fail)) problems.push("fail() does not exit 1");
  if (!/vercel rollback "\$PREVIOUS"/.test(rollBack) || !/^\s*exit 1\s*$/m.test(rollBack)) problems.push("roll_back() does not run vercel rollback and exit 1");
  const lines = text.split("\n");
  const at = (pattern: RegExp) => lines.findIndex(line => pattern.test(line));
  const inspect = at(/vercel inspect "\$DEPLOY_URL" --wait/);
  const deploymentCheck = at(/post-deploy-check\.mjs "\$DEPLOY_URL"/);
  const promote = at(/vercel promote "\$new_id" --yes \|\| roll_back /);
  const loop = at(/^\s*(while|until) /);
  const productionCheck = at(/post-deploy-check\.mjs "\$PRODUCTION_URL"/);
  if (inspect < 0) problems.push("step 5 does not wait for the deployment with vercel inspect");
  if (deploymentCheck < 0) problems.push("step 5 does not check the deployment's own address before the promotion");
  if (promote < 0) problems.push("step 5 does not run vercel promote (with roll_back on its failure)");
  if (loop < 0 || !lines.slice(loop).some(line => /vercel inspect "\$\{PRODUCTION_URL#https:\/\/\}"/.test(line)) || !/"\$served" != "\$new_id"\s*\]; then roll_back /.test(text)) {
    problems.push("step 5 does not ask until the production address serves the new deployment id (roll_back otherwise)");
  }
  if (productionCheck < 0) problems.push("step 5 does not check the production address after the promotion");
  if (!(inspect < deploymentCheck && deploymentCheck < promote && promote < loop && loop < productionCheck)) problems.push("step 5 is not in the order inspect, check the deployment, promote, wait for the domain, check production");
  // every check is followed by its handler: fail before the promotion, roll_back after it
  for (const [index, handler] of [[deploymentCheck, "fail"], [productionCheck, "roll_back"]] as const) {
    if (index < 0) continue;
    const after = lines.slice(index + 1, index + 10).join("\n");
    if (!/PIPESTATUS\[0\]/.test(after) || !new RegExp(`\\b${handler} "`).test(after)) problems.push(`the check on line ${index + 1} of step 5 is not followed by PIPESTATUS and ${handler}`);
  }
  // before the promotion production is untouched, so those failures stop (fail), they do not roll back
  if (!/vercel inspect "\$DEPLOY_URL"[^\n]*\|\| fail "/.test(text) || !/then fail "\$DEPLOY_URL is id=/.test(text)) problems.push("a failure before the promotion does not stop with fail");
  // a fixed wait is a guess: every sleep sits inside the loop that asks which deployment serves
  let depth = 0;
  for (const line of lines) {
    if (/^\s*(while|until|for) .*; do\s*$/.test(line)) depth += 1;
    else if (/^\s*done\b/.test(line)) depth -= 1;
    else if (/^\s*sleep \d/.test(line) && depth === 0) problems.push(`step 5 waits a fixed time: ${line.trim()}`);
  }
  return problems;
}

/** Every rule of the D-78 plan that this workflow text breaks. Empty = the text is safe. */
export function releaseProblems(text: string, otherWorkflows: Record<string, string> = {}): string[] {
  const problems: string[] = [];
  const steps = workflowSteps(text);
  const deploys = steps.filter(step => /\bvercel deploy\b/.test(step.text));
  // (a) exactly one step runs `vercel deploy`, and it comes after steps 2, 2b and 3
  if (deploys.length !== 1) return [`expected exactly one step running "vercel deploy", found ${deploys.length}`];
  const deployIndex = steps.indexOf(deploys[0]);
  const deploy = deploys[0];
  for (const prefix of ["2. ", "2b. ", "3. "]) {
    const index = firstIndex(steps, named(prefix));
    if (index < 0) problems.push(`step "${prefix.trim()}" is missing`);
    else if (index > deployIndex) problems.push(`the deployment step comes before step "${prefix.trim()}"`);
  }
  if (!/vercel pull --yes --environment=production/.test(deploy.text) || !/vercel build --prod/.test(deploy.text) || !/vercel deploy --prebuilt --prod/.test(deploy.text)) {
    problems.push("the deployment step is not vercel pull --environment=production, vercel build --prod, vercel deploy --prebuilt --prod");
  }
  // the new deployment must not take the production domains by itself: it is checked first, then promoted (step 5)
  if (!/vercel deploy --prebuilt --prod --skip-domain\b/.test(deploy.text)) problems.push("vercel deploy runs without --skip-domain (production would serve the deployment before it is checked)");
  // (b2) a failed command before the deployment must fail its step: a `| tee` without pipefail, or `|| true` on a node/pnpm command, would let the deployment run
  steps.slice(0, deployIndex).forEach(step => {
    const lines = step.text.split("\n");
    lines.forEach((line, index) => {
      if (/\|\s*tee\b/.test(line) && !lines.slice(0, index).some(before => /^\s*set -[a-z]*o pipefail\b|^\s*set -o pipefail\b/.test(before))) problems.push(`"${step.name}" pipes into tee without set -o pipefail before it`);
      if (/\b(node|pnpm)\b/.test(line) && /\|\|\s*(true|:)\b|;\s*true\s*$/.test(line)) problems.push(`"${step.name}" ignores a failure: ${line.trim()}`);
    });
  });
  const order = ["vercel pull", "vercel build", "vercel deploy"].map(command => deploy.text.indexOf(command));
  if (!(order[0] < order[1] && order[1] < order[2])) problems.push("the deployment step does not run pull, then build, then deploy");
  // (b) no step before the deployment (nor the job) may continue on error: a failed migration would then not stop the deployment
  steps.slice(0, deployIndex).forEach(step => { if (/continue-on-error:\s*(true|\$\{\{)/.test(step.text)) problems.push(`"${step.name}" has continue-on-error before the deployment`); });
  if (/^ {4}continue-on-error:/m.test(text)) problems.push("the job has continue-on-error");
  // (c) the deployment runs on success only, under the same scope condition as the steps before it
  const deployIf = condition(deploy);
  if (/always\(\)|failure\(\)|cancelled\(\)|success\(\)\s*\|\|/.test(deployIf)) problems.push(`the deployment's condition is "${deployIf}" (it would run after a failure)`);
  if (deployIf !== CLI_CONDITION) problems.push(`the deployment's condition is "${deployIf}", not "${CLI_CONDITION}"`);
  // the token's access (vercel whoami, then a throw-away vercel pull: run 42606597331) is decided by scripts/ci/vercel-access.sh in the config step, before any migration
  const access = firstIndex(steps, step => /bash scripts\/ci\/vercel-access\.sh "\$GITHUB_OUTPUT"/.test(step.text));
  const migrate = firstIndex(steps, named("2. "));
  if (access < 0 || migrate < 0 || access > migrate) problems.push("scripts/ci/vercel-access.sh does not run before step 2 (the migrations)");
  else if (!/^ {8}id: config$/m.test(steps[access].text)) problems.push("the access decision is not in the step with id config (4b and 5 read steps.config.outputs.cli)");
  // D-85: production advances after the migrations (2, 2b) and the release check (3) — with or without the CLI — and never after a failure
  const advance = firstIndex(steps, step => /refs\/heads\/production/.test(step.text));
  if (advance < 0) problems.push("no step advances the production branch");
  else {
    for (const prefix of ["2. ", "2b. ", "3. "]) { const index = firstIndex(steps, named(prefix)); if (index > advance) problems.push(`the production branch moves before step "${prefix.trim()}"`); }
    if (condition(steps[advance]) !== SCOPE_CONDITION) problems.push(`the production branch's condition is "${condition(steps[advance])}", not "${SCOPE_CONDITION}" (it would move after a failure, or never without the CLI)`);
    steps.slice(0, advance + 1).forEach(step => { if (/continue-on-error:\s*(true|\$\{\{)/.test(step.text)) problems.push(`"${step.name}" has continue-on-error before the production branch moves`); });
  }
  // step 5: check the deployment (inspect, then post-deploy-check on its own address), vercel promote, ask until the production address serves it, check again,
  // and roll back on any failure after the promotion
  const verify = firstIndex(steps, named("5. "));
  if (verify <= deployIndex) problems.push("step 5 (verify) does not come after the deployment");
  else {
    problems.push(...verifyProblems(steps[verify]));
    if (condition(steps[verify]) !== CLI_CONDITION) problems.push(`step 5's condition is "${condition(steps[verify])}", not "${CLI_CONDITION}"`);
  }  const promote = firstIndex(steps, step => /refs\/heads\/production/.test(step.text));
  if (promote >= 0 && promote < verify) problems.push("the production branch moves before production is verified");
  // the pulled environment is deleted by a last, unconditional step and never uploaded
  const last = steps[steps.length - 1];
  if (!last || !/rm -rf \.vercel\b/.test(last.text) || !/always\(\)/.test(condition(last))) problems.push("the last step is not an always() step deleting .vercel/");
  if (/upload-artifact/.test(text)) problems.push("the workflow uploads an artifact");
  if (/^\s*set -[a-z]*x/m.test(text)) problems.push("the workflow turns on shell tracing (set -x)");
  // (e) VERCEL_TOKEN only as `VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}` in an env block, never printed, never on a command line
  for (const line of text.split("\n")) {
    if (line.includes("secrets.VERCEL_TOKEN") && !/^ {8,10}VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}$/.test(line)) problems.push(`VERCEL_TOKEN used outside an env entry: ${line.trim()}`);
    if (/\b(echo|printf)\b/.test(line) && /\$\{?VERCEL_TOKEN/.test(line)) problems.push(`a line prints VERCEL_TOKEN: ${line.trim()}`);
    if (/--token\b/.test(line)) problems.push(`a token is passed on a command line: ${line.trim()}`);
  }
  if (/^ {4}env:[\s\S]*?^ {6}VERCEL_TOKEN:/m.test(text.split(/^ {4}steps:/m)[0])) problems.push("VERCEL_TOKEN is in the job's env (every step would see it)");
  // (d) no other workflow deploys production with the CLI
  for (const [file, other] of Object.entries(otherWorkflows)) {
    if (/\bvercel deploy\b/.test(other) || /(^|\s)--prod\b/.test(other)) problems.push(`${file} also runs "vercel deploy" or --prod`);
  }
  return problems;
}

const otherWorkflows = Object.fromEntries(
  readdirSync(workflowsDir).filter(file => /\.ya?ml$/.test(file) && file !== releaseFile).map(file => [file, readFileSync(path.join(workflowsDir, file), "utf8")]),
);

/** Moves the block of the step whose name starts with `moving` to just before the step whose name starts with `before`. */
function moveStep(text: string, moving: string, before: string): string {
  const steps = workflowSteps(text);
  const block = steps.find(named(moving))!.text;
  const target = steps.find(named(before))!.text;
  return text.replace(block, "").replace(target, () => block + target);
}

describe("release workflow: production is deployed by the Vercel CLI only after the migrations (D-78)", () => {
  it("the committed workflow breaks no rule", () => {
    expect(releaseProblems(releaseText, otherWorkflows)).toEqual([]);
  });

  it("reads the steps in order (the parser itself)", () => {
    const names = workflowSteps(releaseText).map(step => step.name);
    const at = (prefix: string) => names.findIndex(name => name.startsWith(prefix));
    expect(at("2. ")).toBeGreaterThan(0);
    expect(at("2. ")).toBeLessThan(at("2b. "));
    expect(at("2b. ")).toBeLessThan(at("3. "));
    expect(at("3. ")).toBeLessThan(at("4b. "));
    expect(at("4b. ")).toBeLessThan(at("5. "));
    expect(at("5. ")).toBeLessThan(at("6. "));
  });

  it("mutation 1: the deployment moved before step 2 is refused", () => {
    const mutated = moveStep(releaseText, "4b. ", "2. ");
    expect(mutated).not.toBe(releaseText);
    expect(releaseProblems(mutated)).toEqual(expect.arrayContaining([expect.stringContaining('comes before step "2."')]));
  });

  it("mutation 2: continue-on-error on step 2 is refused", () => {
    const step2 = workflowSteps(releaseText).find(named("2. "))!.text;
    const mutated = releaseText.replace(step2, () => step2.replace(/\n {8}if: /, "\n        continue-on-error: true\n        if: "));
    expect(mutated).not.toBe(releaseText);
    expect(releaseProblems(mutated)).toEqual(expect.arrayContaining([expect.stringContaining("continue-on-error before the deployment")]));
  });

  it("mutation 3: if: always() on the deployment is refused", () => {
    const deploy = workflowSteps(releaseText).find(named("4b. "))!.text;
    const mutated = releaseText.replace(deploy, () => deploy.replace(/\n {8}if: .*\n/, "\n        if: always()\n"));
    expect(mutated).not.toBe(releaseText);
    expect(releaseProblems(mutated)).toEqual(expect.arrayContaining([expect.stringContaining("it would run after a failure")]));
  });

  it("a printed token, a token in the job env or another workflow deploying production are refused", () => {
    const printed = releaseText.replace('echo "deployed (not yet serving production): $url"', 'echo "token $VERCEL_TOKEN"');
    expect(printed).not.toBe(releaseText);
    expect(releaseProblems(printed)).toEqual(expect.arrayContaining([expect.stringContaining("prints VERCEL_TOKEN")]));
    const jobEnv = releaseText.replace("      GH_TOKEN: ${{ github.token }}\n", "      GH_TOKEN: ${{ github.token }}\n      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}\n");
    expect(releaseProblems(jobEnv)).toEqual(expect.arrayContaining([expect.stringContaining("job's env")]));
    expect(releaseProblems(releaseText, { "other.yml": "run: npx vercel deploy --prod" })).toEqual(["other.yml also runs \"vercel deploy\" or --prod"]);
  });

  // QA and engineering review on #231: each mutation below once passed the test; now each is refused
  const step = (prefix: string) => workflowSteps(releaseText).find(named(prefix))!.text;
  const mutate = (prefix: string, from: string | RegExp, to: string) => {
    const block = step(prefix);
    const changed = block.replace(from, to);
    expect(changed, `${prefix} ${String(from)}`).not.toBe(block);
    return releaseText.replace(block, () => changed);
  };
  it.each([
    ["|| true after the migrations in step 2", () => mutate("2. ", /(predeploy\.mjs[^\n]*)/, "$1 || true"), "ignores a failure"],
    ["no set -o pipefail in step 2", () => mutate("2. ", /\n\s*set -o pipefail\n/, "\n"), "without set -o pipefail"],
    ["step 5 under the default bash -e", () => mutate("5. ", /\n {8}shell: [^\n]*/, ""), "runs under bash -e"],
    ["the production check no longer rolls back", () => mutate("5. ", 'then roll_back "the post-deploy check of $PRODUCTION_URL failed"', 'then true'), "followed by PIPESTATUS and roll_back"],
    ["the deployment check no longer stops the run", () => mutate("5. ", 'fail "the post-deploy check of $DEPLOY_URL failed"', 'true'), "followed by PIPESTATUS and fail"],
    ["roll_back() does not exit 1", () => mutate("5. ", /(Instant Rollback"\n {12}fi\n) {12}exit 1\n/, "$1"), "roll_back() does not"],
    ["no --skip-domain", () => mutate("4b. ", " --skip-domain >", " >"), "without --skip-domain"],
    ["no vercel promote", () => mutate("5. ", /\n[^\n]*vercel promote[^\n]*/, ""), "does not run vercel promote"],
    ["a fixed sleep instead of asking for the id", () => mutate("5. ", /( *)served=""\n[\s\S]*?\n *done\n/, '$1sleep 20\n$1served="$new_id"\n'), "waits a fixed time"],
  ])("refuses: %s", (_label, make, expected) => {
    expect(releaseProblems(make())).toEqual(expect.arrayContaining([expect.stringContaining(expected)]));
  });

  // D-85 (run 42738392972): without the CLI the release still migrates, checks and advances production — and a failure before step 6 still stops it
  it.each([
    ["the production branch moves after a failure (if: always())", () => mutate("6. ", /\n {8}if: [^\n]*\n/, "\n        if: always()\n"), "it would move after a failure"],
    ["the production branch waits for the CLI", () => mutate("6. ", /\n {8}if: [^\n]*\n/, `\n        if: ${CLI_CONDITION}\n`), "never without the CLI"],
    ["the production branch moved before the release check (3)", () => moveStep(releaseText, "6. ", "3. "), 'moves before step "3."'],
    ["continue-on-error on the release check (3)", () => mutate("3. ", /\n {8}if: /, "\n        continue-on-error: true\n        if: "), "continue-on-error before the production branch moves"],
    ["4b runs without the access decision", () => mutate("4b. ", /\n {8}if: [^\n]*\n/, `\n        if: ${SCOPE_CONDITION}\n`), "the deployment's condition"],
    ["the access decision dropped before the migrations", () => mutate("Refuse to start", /\n[^\n]*bash scripts\/ci\/vercel-access\.sh[^\n]*/, ""), "vercel-access.sh does not run before step 2"],
  ])("refuses (D-85): %s", (_label, make, expected) => {
    expect(releaseProblems(make())).toEqual(expect.arrayContaining([expect.stringContaining(expected)]));
  });

  it("the access script holds the probe the workflow relied on (whoami, then a throw-away pull, deleted on every path) and never names the token on a command line", () => {
    expect(accessScript).toMatch(/vercel whoami/);
    expect(accessScript).toMatch(/vercel pull --yes --environment=production --cwd "\$probe"/);
    expect((accessScript.match(/rm -rf "\$probe"/g) ?? []).length).toBe(2);
    expect(accessScript).not.toMatch(/--token\b|(echo|printf)[^\n]*\$\{?VERCEL_TOKEN/);
  });

  it("the cleanup of .vercel/ stays the last, unconditional step", () => {
    const steps = workflowSteps(releaseText);
    const last = steps[steps.length - 1].text;
    const withoutCleanup = releaseText.replace(last, "");
    expect(releaseProblems(withoutCleanup)).toEqual(expect.arrayContaining([expect.stringContaining("deleting .vercel/")]));
  });
});
