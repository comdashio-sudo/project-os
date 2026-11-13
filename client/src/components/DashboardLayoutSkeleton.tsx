import { ShellSkeleton } from "./ShellSkeleton";

/** Q-18: kept for its callers (RequireAuth, MfaGate). It was a sidebar layout of accent-coloured (green) boxes the app no longer has; it is now the
 * platform's own frame in grey (ShellSkeleton), so what loads has the shape and colour of what arrives. */
export function DashboardLayoutSkeleton() {
  return <ShellSkeleton />;
}
