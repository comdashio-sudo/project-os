import type { Request, RequestHandler, Response } from "express";
import { getProjectError } from "@shared/projectErrors";
import { logWarn, safePath } from "./logger";
import { createRateLimiter } from "./auth/rateLimiter";

// tRPC's own JSON-RPC code for TOO_MANY_REQUESTS.
const TRPC_TOO_MANY_REQUESTS = -32029;

/**
 * The body the tRPC client expects for a refused call, so the page shows the Arabic or English message of PROJECT_OS_RATE_LIMITED instead of
 * failing to parse a reply it did not understand. A batched request (`/api/trpc/a,b?batch=1`) gets one error per call, as an array.
 */
export function trpcRateLimitBody(req: Pick<Request, "path" | "query">) {
  const projectError = getProjectError("PROJECT_OS_RATE_LIMITED");
  const paths = decodeURIComponent(req.path.replace(/^\/api\/trpc\/?/, "")).split(",").filter(Boolean);
  const one = (path: string) => ({ error: { json: { message: "PROJECT_OS_RATE_LIMITED", code: TRPC_TOO_MANY_REQUESTS, data: { code: "TOO_MANY_REQUESTS", httpStatus: 429, path, projectError } } } });
  return req.query?.batch ? (paths.length ? paths : [""]).map(one) : one(paths[0] ?? "");
}

function refuse(req: Request, res: Response, retryAfterMs: number) {
  res.setHeader("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
  res.setHeader("Cache-Control", "no-store");
  if (req.path.startsWith("/api/trpc")) return res.status(429).json(trpcRateLimitBody(req));
  return res.status(429).json({ code: "PROJECT_OS_RATE_LIMITED" });
}

/**
 * A ceiling per source address on the whole API. It is deliberately high (a person loading a screen sends a dozen calls): it stops a script,
 * not a busy office. Sign-in has its own, much lower, limits. The scheduled endpoints (called by the platform's cron with a secret) get a small
 * ceiling of their own so the secret cannot be guessed at speed.
 */
export function apiRateLimit(options: { perMinute: number; scheduledPerMinute?: number; now?: () => number }): RequestHandler {
  const general = createRateLimiter({ windowMs: 60_000, max: options.perMinute, now: options.now });
  const scheduled = createRateLimiter({ windowMs: 60_000, max: options.scheduledPerMinute ?? 20, now: options.now });
  return (req, res, next) => {
    if (!req.path.startsWith("/api/")) return next();
    const limiter = req.path.startsWith("/api/scheduled/") ? scheduled : general;
    const verdict = limiter.consume(req.ip ?? "unknown");
    res.setHeader("RateLimit-Remaining", String(verdict.remaining));
    if (verdict.allowed) return next();
    logWarn("api.rate_limited", { path: safePath(req.originalUrl), method: req.method, requestId: res.locals.requestId });
    return refuse(req, res, verdict.retryAfterMs);
  };
}

export const apiRateLimitFromEnvironment = () => {
  const configured = Number(process.env.API_RATE_LIMIT_PER_MINUTE);
  return Number.isInteger(configured) && configured >= 10 ? configured : 600;
};
