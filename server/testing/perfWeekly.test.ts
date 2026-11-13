import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Q-17 item 15 (decision 210-10): the performance budget is a weekly run on main only, three screens, no secrets, read-only. Actions are rationed,
// so a change that makes it run on pull requests, daily, or with more rights is a regression this test names.
const workflow = readFileSync(new URL("../../.github/workflows/perf-weekly.yml", import.meta.url), "utf8");
const measure = readFileSync(new URL("../../scripts/perf-measure.mjs", import.meta.url), "utf8");

export function weeklyPerfProblems(text: string): string[] {
  const problems: string[] = [];
  const crons = Array.from(text.matchAll(/cron:\s*"([^"]+)"/g), match => match[1]);
  if (crons.length !== 1) problems.push(`expected one schedule, found ${crons.length}`);
  for (const cron of crons) { const dayOfWeek = cron.trim().split(/\s+/)[4]; if (!/^[0-6]$/.test(dayOfWeek ?? "")) problems.push(`schedule "${cron}" is not once a week`); }
  if (/^\s*(pull_request|pull_request_target|push):/m.test(text)) problems.push("runs on pushes or pull requests");
  if (!/if:\s*github\.ref == 'refs\/heads\/main'/.test(text)) problems.push("not limited to main");
  if (!/permissions:\s*\n\s*contents:\s*read\s*\n/.test(text) || /:\s*write\b/.test(text)) problems.push("asks for more than read access");
  if (/secrets\./.test(text)) problems.push("uses a repository secret");
  if (!/timeout-minutes:\s*\d+/.test(text)) problems.push("has no time limit");
  return problems;
}

describe("weekly performance check (Q-17 item 15)", () => {
  it("is weekly, on main only, read-only, without secrets, with a time limit", () => {
    expect(weeklyPerfProblems(workflow)).toEqual([]);
  });

  it("measures three screens that perf-measure.mjs knows", () => {
    const screens = /PERF_SCREENS:\s*(\S+)/.exec(workflow)?.[1].split(",") ?? [];
    expect(screens).toHaveLength(3);
    for (const screen of screens) expect(measure).toContain(`path: "${screen}"`);
  });

  it("NEGATIVE: a daily run, a pull-request trigger, a secret or write access are each named", () => {
    const daily = workflow.replace('cron: "17 3 * * 0"', 'cron: "17 3 * * *"');
    expect(weeklyPerfProblems(daily)).toContain('schedule "17 3 * * *" is not once a week');
    expect(weeklyPerfProblems(workflow.replace("  workflow_dispatch:", "  workflow_dispatch:\n  pull_request:"))).toContain("runs on pushes or pull requests");
    expect(weeklyPerfProblems(workflow.replace("LIMIT_MS: \"4000\"", "LIMIT_MS: \"4000\"\n      TOKEN: ${{ secrets.VERCEL_TOKEN }}"))).toContain("uses a repository secret");
    expect(weeklyPerfProblems(workflow.replace("contents: read", "contents: write"))).toContain("asks for more than read access");
    expect(weeklyPerfProblems(workflow.replace("    if: github.ref == 'refs/heads/main'\n", ""))).toContain("not limited to main");
  });
});
