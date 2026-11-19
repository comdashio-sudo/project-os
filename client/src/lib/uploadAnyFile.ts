// Work order 21: the project header's "Upload any file" button opens the smart-import screen that Agent 1 builds (work order 20).
// That screen has no route yet, so until it does the button opens this page's own data-imports group. When the screen lands, return its path
// here (for example `/projects/${tenantId}/${projectId}/import`); the header follows, nothing else changes. Coordinated in docs/STATE.md.
// Q-36 (step 3 c): the screen now exists — the import entry, which names each kind of file and sends it where it is imported.
export function uploadAnyFileHref(tenantId: string, projectId: string): string | null {
  return `/projects/${tenantId}/${projectId}/import`;
}

/** The project page's group that holds the data imports today (ProjectControls, OperationsGroup id). */
export const UPLOAD_ANY_FILE_FALLBACK_GROUP = "manager-assurance";
