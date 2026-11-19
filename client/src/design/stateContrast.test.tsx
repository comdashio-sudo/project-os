import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../lib/contrast";

// Q-19: the progress states the platform runs on (the live tokens in client/src/index.css), read from the file itself.
const css = readFileSync(path.resolve(import.meta.dirname, "../index.css"), "utf8");
const value = (token: string) => {
  const match = css.match(new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`no ${token}`);
  return match[1]!;
};
const STATES = ["none", "start", "progress", "advanced", "complete", "stopped"];

describe("Q-19: the progress states of the approved identity", () => {
  it.each(STATES.map(state => [state]))("text on %s reads at 4.5:1 or more", state => {
    expect(contrastRatio(value(`state-${state}-foreground`), value(`state-${state}`))).toBeGreaterThanOrEqual(4.5);
  });

  it("not started → start → in progress → advanced → complete get darker, so they read apart without hue", () => {
    const steps = ["none", "start", "progress", "advanced", "complete"].map(state => contrastRatio(value(`state-${state}`), "#ffffff"));
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
  });

  it("the status marks read the states, and the turquoise is never a status", () => {
    for (const [mark, state] of [["todo", "none"], ["progress", "progress"], ["review", "advanced"], ["done", "complete"], ["blocked", "stopped"]]) {
      expect(css).toMatch(new RegExp(`--status-${mark}:\\s*var\\(--state-${state}\\);`));
    }
    expect(css).not.toMatch(/--status-[a-z]+:\s*#2ED3C6/i);
  });

  it("the approved neutrals, warning and radii are the live values", () => {
    expect(value("dashio-paper").toUpperCase()).toBe("#F3F4F9");
    expect(value("dashio-line").toUpperCase()).toBe("#DEE1EE");
    expect(value("dashio-slate").toUpperCase()).toBe("#575D78");
    expect(css).toMatch(/--radius: var\(--radius-md\);/);
    expect(css).toMatch(/--radius-card: var\(--radius-lg\);/);
    expect(css).toMatch(/--warning: #b45309;/);
  });
});
