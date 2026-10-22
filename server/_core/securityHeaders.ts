import type { RequestHandler } from "express";

// The page is one React bundle served from this origin. What it fetches from elsewhere is only the two Google Fonts hosts named in
// client/index.html, and (as images and previews) signed Supabase Storage links. Everything else is refused by the browser.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // Component libraries inject <style> elements and React sets style attributes, so styles need 'unsafe-inline'; scripts do not.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.supabase.co",
  // the browser PUTs an import file straight to the project's Supabase Storage (signed URL); nothing else is reachable from page scripts
  "connect-src 'self' https://*.supabase.co",
  "frame-src 'self' https://*.supabase.co",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

export const HSTS = "max-age=31536000; includeSubDomains";
export const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()";

/** The headers every response carries. In production it adds the CSP and HSTS (the development server needs inline scripts for hot reload). */
export function responseSecurityHeaders(production: boolean): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": PERMISSIONS_POLICY,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...(production ? { "Content-Security-Policy": CONTENT_SECURITY_POLICY, "Strict-Transport-Security": HSTS } : {}),
  };
}

/** Express middleware that sets them. On Vercel the page itself comes from the CDN, which carries the same headers through the build output's routes. */
export function securityHeaders(options: { production: boolean }): RequestHandler {
  const headers = Object.entries(responseSecurityHeaders(options.production));
  return (_req, res, next) => {
    res.removeHeader("X-Powered-By");
    for (const [name, value] of headers) res.setHeader(name, value);
    next();
  };
}
