import type { Request, Response } from "express";
import { logError } from "./_core/logger";
import { sweepImportJobs } from "./importJobs";
import { isAuthorizedScheduledRequest } from "./scheduledLicenseExpiry";

// The periodic sweep behind direct-upload imports (Vercel Cron, see scripts/build-vercel.mjs): it revives a job whose function was killed at its time limit,
// fails one that has used up its attempts, and removes uploads nobody registered within a day. Same secret rule as the other scheduled endpoints.
type Dependencies = { cronSecret: () => string | undefined; sweepImportJobs: typeof sweepImportJobs };

export function createScheduledImportJobsHandler(dependencies: Dependencies) {
  return async function scheduledImportJobsHandler(req: Request, res: Response) {
    if (!isAuthorizedScheduledRequest(req.headers?.authorization, dependencies.cronSecret())) return res.status(403).json({ code: "PROJECT_OS_SCHEDULED_UNAUTHORIZED" });
    try {
      return res.status(200).json({ code: "PROJECT_OS_IMPORT_JOBS_SWEPT", result: await dependencies.sweepImportJobs() });
    } catch (error) {
      logError("scheduled.import_jobs_failed", error, { requestId: res.locals?.requestId });
      return res.status(500).json({ code: "PROJECT_OS_SCHEDULED_EXECUTION_FAILED" });
    }
  };
}

export const scheduledImportJobsHandler = createScheduledImportJobsHandler({ cronSecret: () => process.env.CRON_SECRET, sweepImportJobs });
