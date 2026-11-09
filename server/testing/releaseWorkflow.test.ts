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
  const order = ["vercel pull", "vercel build", "vercel deploy"].map(command => deploy.text.indexOf(command));
  if (!(order[0] < order[1] && order[1] < order[2])) problems.push("the deployment step does not run pull, then build, then deploy");
  // (b) no step before the deployment (nor the job) may continue on error: a failed migration would then not stop the deployment
  steps.slice(0, deployIndex).forEach(step => { if (/continue-on-error:\s*(true|\$\{\{)/.test(step.text)) problems.push(`"${step.name}" has continue-on-error before the deployment`); });
  if (/^ {4}continue-on-error:/m.test(text)) problems.push("the job has continue-on-error");
  // (c) the deployment runs on success only, under the same scope condition as the steps before it
  const deployIf = condition(deploy);
  if (/always\(\)|failure\(\)|cancelled\(\)|success\(\)\s*\|\|/.test(deployIf)) problems.push(`the deployment's condition is "${deployIf}" (it would run after a failure)`);
  if (deployIf !== SCOPE_CONDITION) problems.push(`the deployment's condition is "${deployIf}", not "${SCOPE_CONDITION}"`);
  // the token is proven (vercel whoami) before any migration
  const whoami = firstIndex(steps, step => /\bvercel whoami\b/.test(step.text));
  const migrate = firstIndex(steps, named("2. "));
  if (whoami < 0 || migrate < 0 || whoami > migrate) problems.push("vercel whoami does not run before step 2 (the migrations)");
  // step 5 verifies with vercel inspect and the post-deploy check, and rolls back on failure; the production branch moves only after it
  const verify = firstIndex(steps, named("5. "));
  if (verify <= deployIndex) problems.push("step 5 (verify) does not come after the deployment");
  else {
    const verifyText = steps[verify].text;
    for (const needed of ["vercel inspect", "scripts/ci/post-deploy-check.mjs", "vercel rollback"]) if (!verifyText.includes(needed)) problems.push(`step 5 does not run ${needed}`);
    if (/always\(\)|failure\(\)|cancelled\(\)/.test(condition(steps[verify]))) problems.push("step 5 runs after a failed deployment");
  }
  const promote = firstIndex(steps, step => /refs\/heads\/production/.test(step.text));
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
  return text.replace(block, "").replace(target, block + target);
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
    const mutated = releaseText.replace(step2, step2.replace(/\n {8}if: /, "\n        continue-on-error: true\n        if: "));
    expect(mutated).not.toBe(releaseText);
    expect(releaseProblems(mutated)).toEqual(expect.arrayContaining([expect.stringContaining("continue-on-error before the deployment")]));
  });

  it("mutation 3: if: always() on the deployment is refused", () => {
    const deploy = workflowSteps(releaseText).find(named("4b. "))!.text;
    const mutated = releaseText.replace(deploy, deploy.replace(/\n {8}if: .*\n/, "\n        if: always()\n"));
    expect(mutated).not.toBe(releaseText);
    expect(releaseProblems(mutated)).toEqual(expect.arrayContaining([expect.stringContaining("it would run after a failure")]));
  });

  it("a printed token, a token in the job env or another workflow deploying production are refused", () => {
    const printed = releaseText.replace('echo "Vercel token accepted (vercel whoami)"', 'echo "token $VERCEL_TOKEN"');
    expect(releaseProblems(printed)).toEqual(expect.arrayContaining([expect.stringContaining("prints VERCEL_TOKEN")]));
    const jobEnv = releaseText.replace("      GH_TOKEN: ${{ github.token }}\n", "      GH_TOKEN: ${{ github.token }}\n      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}\n");
    expect(releaseProblems(jobEnv)).toEqual(expect.arrayContaining([expect.stringContaining("job's env")]));
    expect(releaseProblems(releaseText, { "other.yml": "run: npx vercel deploy --prod" })).toEqual(["other.yml also runs \"vercel deploy\" or --prod"]);
  });

  it("the cleanup of .vercel/ stays the last, unconditional step", () => {
    const steps = workflowSteps(releaseText);
    const last = steps[steps.length - 1].text;
    const withoutCleanup = releaseText.replace(last, "");
    expect(releaseProblems(withoutCleanup)).toEqual(expect.arrayContaining([expect.stringContaining("deleting .vercel/")]));
  });
});
