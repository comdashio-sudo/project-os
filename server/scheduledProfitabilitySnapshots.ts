import type { Request, Response } from "express";
import { captureScheduledProfitabilitySnapshots } from "./db";
import { isAuthorizedScheduledRequest } from "./scheduledLicenseExpiry";
import { logError } from "./_core/logger";

// Called by the same daily Render cron job as the license check. It is safe to
// call every day: a project that already has this month's profit snapshot is
// skipped, so a missed day is made up the next day and a repeat is a no-op.
type Dependencies = {
  cronSecret: () => string | undefined;
  capture: typeof captureScheduledProfitabilitySnapshots;
};

export function createScheduledProfitabilitySnapshotsHandler(dependencies: Dependencies) {
  return async function scheduledProfitabilitySnapshotsHandler(req: Request, res: Response) {
    if (!isAuthorizedScheduledRequest(req.headers?.authorization, dependencies.cronSecret())) {
      return res.status(403).json({ code: "PROJECT_OS_SCHEDULED_UNAUTHORIZED" });
    }
    try {
      const result = await dependencies.capture();
      return res.status(200).json({ code: "PROJECT_OS_PROFITABILITY_SNAPSHOTS_CAPTURED", result: { ...result, periodAt: result.periodAt.toISOString() } });
    } catch (error) {
      logError("scheduled.profitability_snapshots_failed", error, { requestId: res.locals?.requestId });
      return res.status(500).json({ code: "PROJECT_OS_SCHEDULED_EXECUTION_FAILED" });
    }
  };
}

export const scheduledProfitabilitySnapshotsHandler = createScheduledProfitabilitySnapshotsHandler({
  cronSecret: () => process.env.CRON_SECRET,
  capture: captureScheduledProfitabilitySnapshots,
});
