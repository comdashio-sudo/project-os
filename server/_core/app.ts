import { integrationApiRouter } from "../integrations/api";
import { ENV } from "./env";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { randomUUID } from "node:crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { appRouter } from "../routers";
import { scheduledEmailNotificationsHandler } from "../scheduledEmailNotifications";
import { tenantExportHandler } from "../tenantExportRoute";
import { registerDatabaseStorageRoutes } from "../dbStorage";
import { partialS3Setup } from "../storage";
import { scheduledDailyHandler } from "../scheduledDaily";
import { scheduledImportJobsHandler } from "../scheduledImportJobs";
import { scheduledLicenseExpiryHandler } from "../scheduledLicenseExpiry";
import { scheduledProfitabilitySnapshotsHandler } from "../scheduledProfitabilitySnapshots";
import { apiRateLimit, apiRateLimitFromEnvironment } from "./apiRateLimit";
import { registerDefaultAuthRoutes } from "./auth";
import { pendingMigrations, schemaReadiness } from "./schemaReady";
import { createContext } from "./context";
import { asSystem } from "./requestContext";
import { errorPageHtml, errorPageStatus, type ErrorPageKind } from "./errorPages";
import { logError, safePath } from "./logger";
import { securityHeaders } from "./securityHeaders";

export type AppOptions = {
  production: boolean;
  /** Per source address, per minute, across /api. */
  apiRequestsPerMinute?: number;
  now?: () => number;
  /** Sign-in routes; the default wires the real ones (tests pass their own). */
  registerAuth?: (app: Express) => void;
  /** Extra routes mounted before the error handler (the e2e tests add a route that throws). */
  extraRoutes?: (app: Express) => void;
};

const requestIdOf = (res: Response): string | undefined => res.locals.requestId;

const wantsJson = (req: Request) => req.path.startsWith("/api/") || (req.headers.accept ?? "").includes("application/json");

function failureKind(status: number): ErrorPageKind {
  if (status === 413) return "too_large";
  if (status === 404) return "not_found";
  if (status >= 400 && status < 500) return "bad_request";
  return status === 503 ? "unavailable" : "server";
}

/**
 * Everything the server does except choosing a port and serving the client (index.ts does that). Kept apart so the tests exercise the real
 * chain: headers, request ids, the API ceiling, sign-in, scheduled jobs, tRPC and the error handling.
 * Call `finish(app)` after the client is mounted: the error handler must be last.
 */
export function createApp(options: AppOptions) {
  const app = express();
  // Behind the host's proxy (Vercel): one hop, so req.ip is the client address.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(securityHeaders({ production: options.production, storageEndpoint: ENV.storageS3Endpoint }));
  app.use((req, res, next) => {
    const id = randomUUID();
    res.locals.requestId = id;
    res.setHeader("X-Request-Id", id);
    next();
  });
  // Liveness probe for the host. Public, no data.
  // Still 200 whatever the database says (the host must not pull a working process out of rotation), but it SAYS when the schema is behind the code, which is what turned a release into a
  // broken sign-in on 2026-10-26: "ok" or "ok; schema behind: <migrations still to apply>". The database answer is cached half a minute and bounded to four seconds.
  app.get("/healthz", async (_req, res) => {
    const readiness = await Promise.race([schemaReadiness(), new Promise<null>(resolve => setTimeout(() => resolve(null), 4000))]);
    const storageMissing = partialS3Setup();
    const note = (readiness === null ? "; schema unknown" : readiness.ready ? "" : `; schema behind: ${pendingMigrations(readiness).join(", ")}`) + (storageMissing.length ? `; storage partly configured, missing: ${storageMissing.join(", ")}` : "");
    res.set("Cache-Control", "no-store").status(200).type("text/plain").send(`ok${note}`);
  });
  // Readiness: 200 when the database has what this release's code names, 503 with the migrations still to apply. The post-deploy check reads it (a warning, not a rollback: the code tolerates it).
  app.get("/api/readyz", async (_req, res) => {
    const readiness = await schemaReadiness();
    // D-79: a partial S3 setup (1 to 4 of the 5 variables) is not ready either; the names are said, never a value
    const storageMissing = partialS3Setup();
    const ready = readiness.ready && storageMissing.length === 0;
    res.set("Cache-Control", "no-store").status(ready ? 200 : 503).json({ ready, pendingMigrations: pendingMigrations(readiness), ...(storageMissing.length ? { storagePartlyConfigured: storageMissing } : {}) });
  });
  app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.use(apiRateLimit({ perMinute: options.apiRequestsPerMinute ?? apiRateLimitFromEnvironment(), now: options.now }));
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  (options.registerAuth ?? registerDefaultAuthRoutes)(app);
  app.get("/api/tenant-export/:tenantId", tenantExportHandler);
  registerDatabaseStorageRoutes(app); // D-79: signed links into the database storage (answer 403 to any token this server did not sign)
  // Scheduled jobs: Vercel Cron calls with GET and `Authorization: Bearer $CRON_SECRET`; an operator (or any other scheduler) may POST the same header.
  // Each handler refuses anything without the secret, and with CRON_SECRET unset it refuses everything.
  for (const [path, reason, handler] of [
    ["/api/scheduled/licenseExpiry", "licence expiry job", scheduledLicenseExpiryHandler],
    ["/api/scheduled/profitabilitySnapshots", "profitability snapshot job", scheduledProfitabilitySnapshotsHandler],
    ["/api/scheduled/emailNotifications", "e-mail notification job", scheduledEmailNotificationsHandler],
    ["/api/scheduled/importJobs", "import job sweep", scheduledImportJobsHandler],
    ["/api/scheduled/daily", "daily jobs (free plan)", scheduledDailyHandler],
  ] as const) {
    app.get(path, asSystem(reason), handler);
    app.post(path, asSystem(reason), handler);
  }
  // The documented integration API (company API keys): its own authentication and limits, not the signed-in user's session.
  app.use("/api/v1", integrationApiRouter());
  options.extraRoutes?.(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      // A procedure that failed unexpectedly was invisible before: nothing was logged. Expected refusals (no permission, not found...) stay quiet.
      onError({ error, path, type, req }) {
        if (error.code !== "INTERNAL_SERVER_ERROR") return;
        logError("trpc.internal_error", error.cause ?? error, { path: path ?? "-", type, requestId: (req as Request & { res?: Response }).res?.locals.requestId });
      },
    })
  );
  // An address under /api that nothing handles is a 404 in JSON, never the page's HTML.
  app.use("/api", (_req, res) => res.status(404).json({ code: "PROJECT_OS_NOT_FOUND" }));

  function finish(target: Express = app) {
    target.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
      if (res.headersSent) return next(error);
      const raw = (error as { status?: unknown; statusCode?: unknown })?.status ?? (error as { statusCode?: unknown })?.statusCode;
      const status = typeof raw === "number" && raw >= 400 && raw <= 599 ? raw : 500;
      if (status >= 500) logError("http.unhandled_error", error, { path: safePath(req.originalUrl), method: req.method, status, requestId: requestIdOf(res) });
      res.setHeader("Cache-Control", "no-store");
      if (wantsJson(req)) {
        const code = status === 413 ? "PROJECT_OS_REQUEST_TOO_LARGE" : status >= 500 ? "PROJECT_OS_SERVER_ERROR" : "PROJECT_OS_REQUEST_FAILED";
        return res.status(status).json({ code, requestId: requestIdOf(res) });
      }
      return res.status(errorPageStatus(failureKind(status))).type("html").send(errorPageHtml(failureKind(status), requestIdOf(res)));
    });
    return target;
  }

  return { app, finish };
}
