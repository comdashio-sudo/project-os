import type { RequestHandler } from "express";

// The page is one React bundle served from this origin. What it fetches from elsewhere is only the two Google Fonts hosts named in
// client/index.html, and (as images and previews) signed Cloudflare R2 links. Everything else is refused by the browser.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // Component libraries inject <style> elements and React sets style attributes, so styles need 'unsafe-inline'; scripts do not.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com",
  "connect-src 'self'",
  "frame-src 'self' https://*.r2.cloudflarestorage.com",
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

/** Headers every response carries. In production it adds the CSP and HSTS (the development server needs inline scripts for hot reload). */
export function securityHeaders(options: { production: boolean }): RequestHandler {
  return (_req, res, next) => {
    res.removeHeader("X-Powered-By");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    if (options.production) {
      res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
      res.setHeader("Strict-Transport-Security", HSTS);
    }
    next();
  };
}
