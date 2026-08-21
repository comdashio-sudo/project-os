/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardSectionReporter } from "./DashboardSectionReporter";

const state = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: { dashboards: { reportSectionIssue: { useMutation: () => ({ mutate: state.mutate }) } } } }));

describe("DashboardSectionReporter", () => {
  afterEach(() => { cleanup(); state.mutate.mockReset(); });

  it("reports a project section failure once with its project scope", () => {
    const { rerender } = render(<DashboardSectionReporter tenantId="tenant-1" projectId="project-1" product="PROJECT" sectionKey="project_performance" state="error" />);
    rerender(<DashboardSectionReporter tenantId="tenant-1" projectId="project-1" product="PROJECT" sectionKey="project_performance" state="error" />);
    expect(state.mutate).toHaveBeenCalledTimes(1);
    expect(state.mutate).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", product: "PROJECT", sectionKey: "project_performance", state: "error" });
  });

  it("does not emit a record while the source is healthy", () => {
    render(<DashboardSectionReporter tenantId="tenant-1" product="PMO" sectionKey="pmo_risks" state={null} />);
    expect(state.mutate).not.toHaveBeenCalled();
  });
});
