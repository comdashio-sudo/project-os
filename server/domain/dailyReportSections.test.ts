import { describe, expect, it } from "vitest";
import { operationalRoleDefinitions } from "./operationalRoles";
import { reportSectionAccess } from "../../shared/dailyReportSections";

// Q-12: the rule read from the role templates themselves, so a template change that moves a section shows here.
const template = (code: string) => { const role = operationalRoleDefinitions.find(item => item.code === code)!; return reportSectionAccess(permission => (role.permissions as readonly string[]).includes(permission)); };
const custom = (...codes: string[]) => reportSectionAccess(permission => codes.includes(permission));

describe("Q-12: the daily report's sections by role", () => {
  it("the HSE engineer sees and edits the safety section only (positive and negative)", () => {
    expect(template("HSE_MANAGER")).toEqual({ see: ["hse"], edit: ["hse"], whole: false });
  });
  it("the QA/QC engineer sees and edits the materials and inspections only", () => {
    expect(template("QA_QC_MANAGER")).toEqual({ see: ["qc"], edit: ["qc"], whole: false });
  });
  it("the site engineer holds the site section (and the template also carries HSE and quality, so the whole report)", () => {
    expect(template("SITE_ENGINEER").edit).toEqual(["site", "hse", "qc"]);
  });
  it("the planning engineer reads every section and edits none; the project manager reads and edits all", () => {
    expect(template("PLANNING_ENGINEER")).toEqual({ see: ["site", "hse", "qc"], edit: [], whole: true });
    expect(template("PROJECT_MANAGER")).toEqual({ see: ["site", "hse", "qc"], edit: ["site", "hse", "qc"], whole: true });
  });
  it("a reader with none of the section powers reads the whole report and edits nothing; field.manage alone is the site", () => {
    expect(custom("project.read")).toEqual({ see: ["site", "hse", "qc"], edit: [], whole: true });
    // the report's preparer (project.field.manage) holds the whole report, as before Q-12
    expect(custom("project.field.manage")).toEqual({ see: ["site", "hse", "qc"], edit: ["site", "hse", "qc"], whole: false });
    // the HSE template's field.manage is not the site's
    expect(custom("project.field.manage", "project.hse.manage").edit).toEqual(["hse"]);
  });
});
