import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { operationalRoleDefinitions } from "../../../server/domain/operationalRoles";
import { GUIDE_ANCHORS, guideImage, guideStepHref, userGuide } from "./userGuide";

const controlsSource = readFileSync("client/src/pages/ProjectControls.tsx", "utf8");
const pmcSource = readFileSync("client/src/pages/ProjectPmc.tsx", "utf8");

describe("user guide content", () => {
  it("has the five sections the order names, each with both languages and at least four steps", () => {
    expect(userGuide.map(section => section.id)).toEqual(["cost-control", "planning", "project-coordination", "design-coordination", "contracts"]);
    for (const section of userGuide) {
      expect(section.steps.length, section.id).toBeGreaterThanOrEqual(4);
      for (const text of [section.title, section.intro, section.cannot, ...section.steps.flatMap(step => [step.title, step.body])]) { expect(text.ar.length).toBeGreaterThan(5); expect(text.en.length).toBeGreaterThan(5); }
    }
  });
  it("only claims a permission the section's own role template really holds", () => {
    for (const section of userGuide) {
      const role = operationalRoleDefinitions.find(definition => definition.code === section.roleCode);
      expect(role, `${section.id} role ${section.roleCode}`).toBeTruthy();
      section.steps.forEach((step, index) => expect(role!.permissions as readonly string[], `${section.id} step ${index + 1} needs ${step.needs}`).toContain(step.needs));
    }
  });
  it("points every step at a screen that exists: a controls lane that is really on the page, the PMC tab, or a project route", () => {
    for (const section of userGuide) for (const step of section.steps) {
      const [path, anchor] = step.screen.split("#");
      expect(["controls", "profitability", "field"], step.screen).toContain(path);
      if (anchor) {
        expect(GUIDE_ANCHORS as readonly string[], step.screen).toContain(anchor);
        expect(anchor === "pmc" ? controlsSource.includes('"pmc"') && pmcSource.includes("ProjectPmcWorkspace") : controlsSource.includes(`id="${anchor}"`), `${step.screen} exists on the controls page`).toBe(true);
      }
    }
  });
  it("builds addresses inside the project and the phone route", () => {
    expect(guideStepHref("controls#manager-design", "t", "p")).toBe("/projects/t/p/controls#manager-design");
    expect(guideStepHref("field", "t", "p")).toBe("/m/t/p");
    expect(guideImage("planning", 3)).toBe("/guide/planning-3.jpg");
  });
  it("ships a real screenshot for every step (taken from the live screens by scripts/capture-screenshots.mjs)", () => {
    const missing: string[] = [];
    for (const section of userGuide) for (let n = 1; n <= section.steps.length; n++) { const file = `client/public${guideImage(section.id, n)}`; if (!existsSync(file) || readFileSync(file).length < 5000) missing.push(file); }
    expect(missing).toEqual([]);
  });
});
