import React from "react";
import { Link } from "wouter";
import { PROJECT_PAGE_PERMISSIONS, useCan } from "@/lib/permissions";

/** D-20 (G-144/G-163): one link of «Project pages», drawn only for whoever holds what that page's server read needs (the guide needs nothing). */
export function ProjectPageLink({ tenantId, projectId, path, label }: { tenantId: string; projectId: string; path: string; label: string }) {
  const needs = (PROJECT_PAGE_PERMISSIONS as Record<string, readonly string[]>)[path];
  const allowed = useCan(needs ?? [], projectId);
  if (needs && !allowed) return null;
  return <Link href={`/projects/${tenantId}/${projectId}/${path}`} data-project-page={path} className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-input px-3 md:min-h-10 text-sm font-medium text-foreground hover:bg-muted">{label}</Link>;
}

