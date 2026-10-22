import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { operationalRoleDefinitions } from "../../../server/domain/operationalRoles";
import { GUIDE_ANCHORS, GUIDE_CADENCES, guideImage, guideStepHref, userGuide } from "./userGuide";

const controlsSource = readFileSync("client/src/pages/ProjectControls.tsx", "utf8");
const pmcSource = readFileSync("client/src/pages/ProjectPmc.tsx", "utf8");

describe("user guide content", () => {
  it("has the five sections the order names, each with both languages, at least four steps, and both daily and weekly steps", () => {
    expect(userGuide.map(section => section.id)).toEqual(["cost-control", "planning", "project-coordination", "design-coordination", "contracts"]);
    for (const section of userGuide) {
      expect(section.steps.length, section.id).toBeGreaterThanOrEqual(4);
      for (const cadence of GUIDE_CADENCES) expect(section.steps.some(step => step.cadence === cadence), `${section.id} has ${cadence} steps`).toBe(true);
      for (const text of [section.title, section.intro, section.cannot, ...section.steps.flatMap(step => [step.title, step.body])]) { expect(text.ar.length).toBeGreaterThan(5); expect(text.en.length).toBeGreaterThan(5); }
    }
  });
  it("gives every step one known cadence", () => {
    for (const section of userGuide) for (const step of section.steps) expect(GUIDE_CADENCES as readonly string[], `${section.id} ${step.title.ar}`).toContain(step.cadence);
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
  it("shows a picture only where one is on disk: every referenced picture is a real file taken from the screens", () => {
    const missing: string[] = [];
    let pictures = 0;
    for (const section of userGuide) for (const step of section.steps) {
      if (!step.image) continue;
      pictures += 1;
      const file = `client/public${step.image}`;
      if (!step.image.startsWith("/guide/") || !existsSync(file) || statSync(file).size < 5000) missing.push(`${section.id}: ${step.image}`);
    }
    expect(pictures).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });
  it("writes the guide in the glossary's terms: no forbidden alternative for WBS, RFI, levelling, revision or review comments", () => {
    const arabic = userGuide.flatMap(section => [section.title.ar, section.intro.ar, section.cannot.ar, ...section.steps.flatMap(step => [step.title.ar, step.body.ar, step.focus ?? ""])]).join("\n");
    for (const forbidden of ["هيكل تقسيم", "الاستيضاح", "استيضاح", "المعايرة", "عند الإنجاز", "مراجعة جديدة", "تعليق"]) expect(arabic.includes(forbidden), forbidden).toBe(false);
  });
});
