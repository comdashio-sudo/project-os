import React, { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

type DashboardProduct = "EXECUTIVE" | "PMO" | "PROJECT";
type DashboardState = "error" | "partial";

export function DashboardSectionReporter({ tenantId, product, sectionKey, state, projectId }: { tenantId: string; product: DashboardProduct; sectionKey: string; state: DashboardState | null; projectId?: string }) {
  const reported = useRef(new Set<string>());
  const mutation = trpc.dashboards.reportSectionIssue.useMutation();
  useEffect(() => {
    if (!state) return;
    const fingerprint = `${tenantId}:${product}:${projectId ?? "tenant"}:${sectionKey}:${state}`;
    if (reported.current.has(fingerprint)) return;
    reported.current.add(fingerprint);
    mutation.mutate({ tenantId, product, sectionKey, state, ...(projectId ? { projectId } : {}) });
  }, [mutation, product, projectId, sectionKey, state, tenantId]);
  return null;
}
