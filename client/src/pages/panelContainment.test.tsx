/** @vitest-environment node */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// G-100: a page that puts several independent data panels together must contain a failure in one of them. The scan finds every page that imports two or
// more sibling components which read data themselves (they call `trpc.`), and requires the page to use one of the containment tools. A new composed page
// that forgets fails here by name, instead of taking all of its panels down the day one of them throws.
const dir = __dirname;
const files = readdirSync(dir).filter(name => /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name));
const source = (name: string) => readFileSync(join(dir, name), "utf8");
const readsData = (name: string) => /\btrpc\.[a-zA-Z]+/.test(source(`${name}.tsx`));
const CONTAINMENT = /GuardedPanels|SectionErrorBoundary|withProjectSectionBoundary|RouteBoundary/;

function dataPanelsOf(file: string) {
  const imported = Array.from(source(file).matchAll(/import (?:\{ ([A-Za-z, ]+) \}|([A-Za-z]+)) from "\.\/([A-Za-z]+)";/g));
  return imported.map(match => match[3]).filter(name => files.includes(`${name}.tsx`) && readsData(name));
}

describe("a failing panel does not take its page down (G-100)", () => {
  const composed = files.map(file => ({ file, panels: dataPanelsOf(file) })).filter(entry => entry.panels.length >= 2);

  it("finds the composed pages it is meant to guard (the scan is not vacuous)", () => {
    expect(composed.map(entry => entry.file)).toEqual(expect.arrayContaining(["ProjectControls.tsx", "ProjectFpac.tsx", "PayrollWorkspace.tsx"]));
  });

  it("every page that composes two or more data panels contains a failure in one of them", () => {
    const uncontained = composed.filter(entry => !CONTAINMENT.test(source(entry.file))).map(entry => `${entry.file} (${entry.panels.join(", ")})`);
    expect(uncontained).toEqual([]);
  });

  it("the page-level boundary covers every signed-in route", () => {
    expect(CONTAINMENT.test(readFileSync(join(dir, "..", "App.tsx"), "utf8"))).toBe(true);
  });
});
