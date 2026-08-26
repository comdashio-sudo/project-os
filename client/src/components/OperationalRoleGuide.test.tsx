/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperationalRoleGuide } from "./OperationalRoleGuide";

const roles = [
  { code: "PROJECT_MANAGER", name: "Project Manager", systemManaged: true, permissions: Array.from({ length: 18 }, (_, index) => ({ code: `permission-${index}` })) },
  { code: "PROCUREMENT_OFFICER", name: "Procurement Officer", systemManaged: true, permissions: [{ code: "project.procurement.manage" }] },
  { code: "QA_QC_MANAGER", name: "QA/QC Manager", systemManaged: true, permissions: [{ code: "project.quality.manage" }, { code: "project.ncr.manage" }] },
  { code: "HSE_MANAGER", name: "HSE Manager", systemManaged: true, permissions: [{ code: "project.hse.manage" }, { code: "project.field.manage" }] },
];

describe("OperationalRoleGuide", () => {
  it("explains the project-manager authority and segregation boundary in English", () => {
    render(<OperationalRoleGuide roles={roles} isArabic={false} />);
    expect(screen.getByText("Ready role guide")).toBeTruthy();
    expect(screen.getByText("Lead the project and daily decisions")).toBeTruthy();
    expect(screen.getByText("Does not execute procurement, warehouse custody, or payroll approval")).toBeTruthy();
    expect(screen.getByText("QA/QC Manager")).toBeTruthy();
    expect(screen.getByText("Does not manage contractual quality, budget, or procurement")).toBeTruthy();
  });

  it("localizes the role guide in Arabic", () => {
    render(<OperationalRoleGuide roles={roles} isArabic />);
    expect(screen.getByText("دليل الأدوار الجاهزة")).toBeTruthy();
    expect(screen.getByText("قيادة المشروع والقرارات اليومية")).toBeTruthy();
    expect(screen.getByText("لا يصدر مشتريات أو يدير المستودع أو يعتمد الرواتب")).toBeTruthy();
    expect(screen.getByText("مدير الجودة وضبط الجودة")).toBeTruthy();
    expect(screen.getByText("مدير الصحة والسلامة والبيئة")).toBeTruthy();
  });
});
