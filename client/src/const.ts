export { COOKIE_NAME, SESSION_MAX_AGE_MS } from "@shared/const";

/** A path on this site only; anything else becomes "/". */
export const safeNext = (value: string | null | undefined): string => {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
};

export const loginPath = (next?: string) => (next && safeNext(next) !== "/" ? `/login?next=${encodeURIComponent(safeNext(next))}` : "/login");

// Send the visitor to the sign-in page and bring them back to where they were.
// Call it from an event handler or an effect, never during render.
export const startLogin = () => {
  window.location.assign(loginPath(`${window.location.pathname}${window.location.search}`));
};
