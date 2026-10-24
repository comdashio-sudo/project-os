import type { RequestHandler } from "express";

// The page is one React bundle served from this origin. What it fetches from elsewhere is only the two Google Fonts hosts named in
// client/index.html, and (as images and previews) signed Supabase Storage links. Everything else is refused by the browser.
const policy = (connectSources: readonly string[]) => [
  "default-src 'self'",
  // wasm-unsafe-eval lets the browser compile WebAssembly (OpenCV.js and Tesseract.js in the master-plan drawing); it does not allow JavaScript eval.
  "script-src 'self' 'wasm-unsafe-eval'",
  // Component libraries inject <style> elements and React sets style attributes, so styles need 'unsafe-inline'; scripts do not.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.supabase.co",
  // the browser PUTs an import file straight to the project's Supabase Storage (signed URL); nothing else is reachable from page scripts
  ["connect-src 'self' https://*.supabase.co", ...connectSources].join(" "),
  "frame-src 'self' https://*.supabase.co",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/** The policy of the Vercel build and of every response by default. */
export const CONTENT_SECURITY_POLICY = policy([]);

/**
 * The exact origin the browser uploads import files to: the project's own storage endpoint. In production it is already covered by the Supabase wildcard; the
 * point is a rehearsal against a local S3-compatible server on 127.0.0.1, which the wildcard cannot cover. Nothing but a plain origin is ever returned.
 */
export function storageConnectOrigin(endpoint: string | undefined): string | null {
  try { const url = new URL(endpoint ?? ""); return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null; } catch { return null; }
}


export const HSTS = "max-age=31536000; includeSubDomains";
// camera=(self): the quick-issue screen scans a material label with the phone camera (getUserMedia). `camera=()` made the browser refuse it with NotAllowedError
// for this very page, so "Scan QR" always fell back to "could not read the label" (found by scripts/e2e-quick-issue.mjs MODE=camera, work order 14 item 2).
// Only this origin may ask; embedded frames still may not.
export const PERMISSIONS_POLICY = "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()";

/** The headers every response carries. In production it adds the CSP and HSTS (the development server needs inline scripts for hot reload). */
export function responseSecurityHeaders(production: boolean, storageOrigin: string | null = null): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": PERMISSIONS_POLICY,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...(production ? { "Content-Security-Policy": storageOrigin ? policy([storageOrigin]) : CONTENT_SECURITY_POLICY, "Strict-Transport-Security": HSTS } : {}),
  };
}

/** Express middleware that sets them. On Vercel the page itself comes from the CDN, which carries the same headers through the build output's routes. */
export function securityHeaders(options: { production: boolean; storageEndpoint?: string }): RequestHandler {
  const headers = Object.entries(responseSecurityHeaders(options.production, storageConnectOrigin(options.storageEndpoint)));
  return (_req, res, next) => {
    res.removeHeader("X-Powered-By");
    for (const [name, value] of headers) res.setHeader(name, value);
    next();
  };
}
