import React from "react";
import { Link } from "wouter";
import { PAGE_ACCESS, type PageKey } from "@shared/pageAccess";
import { useCanPage } from "@/lib/permissions";

/** D-20 (G-144/G-163): one link of «Project pages», drawn only for whoever holds what that page's server read needs (the guide needs nothing). */
export function ProjectPageLink({ tenantId, projectId, path, label }: { tenantId: string; projectId: string; path: string; label: string }) {
  const gated = path in PAGE_ACCESS;
  const allowed = useCanPage((gated ? path : "registry") as PageKey, projectId);
  if (gated && !allowed) return null;
  return <Link href={`/projects/${tenantId}/${projectId}/${path}`} data-project-page={path} className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-input px-3 md:min-h-11 text-sm font-medium text-foreground hover:bg-muted">{label}</Link>;
}

