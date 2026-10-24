import type { Request, Response } from "express";
import { logError } from "./_core/logger";
import { captureScheduledProfitabilitySnapshots, evaluateTenantLicenseLifecycle, getDb } from "./db";
import { runEmailNotificationCycle } from "./emailNotifications";
import { sweepImportJobs } from "./importJobs";
import { runIntegrationDailyWork } from "./integrations/daily";
import { isAuthorizedScheduledRequest } from "./scheduledLicenseExpiry";

// The ONE cron of the free Vercel plan (Hobby: a cron may run once a day). It runs, in order, what the paid plan schedules separately: the licence
// check, the profit snapshots, the e-mail cycle, the import-job sweep and the integration work (due webhooks, daily pulls). A step that fails does not stop the others; the response names each outcome
// and is 500 when any failed, so the cron log shows it. Its daily database call also keeps a free Supabase project from being paused for inactivity.
type Step = [name: string, run: () => Promise<unknown>];
type Dependencies = { cronSecret: () => string | undefined; steps: () => Step[] };

export function createScheduledDailyHandler(dependencies: Dependencies) {
  return async function scheduledDailyHandler(req: Request, res: Response) {
    if (!isAuthorizedScheduledRequest(req.headers?.authorization, dependencies.cronSecret())) return res.status(403).json({ code: "PROJECT_OS_SCHEDULED_UNAUTHORIZED" });
    const outcome: Record<string, "ok" | "failed"> = {};
    for (const [name, run] of dependencies.steps()) {
      try { await run(); outcome[name] = "ok"; } catch (error) { outcome[name] = "failed"; logError("scheduled.daily_step_failed", error, { step: name, requestId: res.locals?.requestId }); }
    }
    const failed = Object.values(outcome).includes("failed");
    return res.status(failed ? 500 : 200).json({ code: failed ? "PROJECT_OS_SCHEDULED_EXECUTION_FAILED" : "PROJECT_OS_DAILY_JOBS_DONE", result: outcome });
  };
}

export const scheduledDailyHandler = createScheduledDailyHandler({
  cronSecret: () => process.env.CRON_SECRET,
  steps: () => [
    ["licenseExpiry", () => evaluateTenantLicenseLifecycle()],
    ["profitabilitySnapshots", () => captureScheduledProfitabilitySnapshots()],
    ["emailNotifications", async () => { const db = await getDb(); if (!db) throw new Error("Database connection is not available"); return runEmailNotificationCycle({ db }); }],
    ["importJobs", () => sweepImportJobs()],
    ["integrations", () => runIntegrationDailyWork()],
  ],
});
