import type { Request, Response } from "express";
import { isAuthorizedScheduledRequest } from "./scheduledLicenseExpiry";
import { getDb } from "./db";
import { runEmailNotificationCycle } from "./emailNotifications";
import { enqueueStalledUnitDigests } from "./stalledUnitsDigest";
import { logError } from "./_core/logger";

// The platform scheduler (an hourly Vercel Cron, see scripts/build-vercel.mjs) calls this with `Authorization: Bearer <CRON_SECRET>`.
// With e-mail notifications off (EMAIL_NOTIFICATIONS_ENABLED not true, or no sender configured) it does nothing and says so.
type Dependencies = { cronSecret: () => string | undefined; run: () => Promise<unknown> };

export function createScheduledEmailNotificationsHandler(dependencies: Dependencies) {
  return async function scheduledEmailNotificationsHandler(req: Request, res: Response) {
    if (!isAuthorizedScheduledRequest(req.headers?.authorization, dependencies.cronSecret())) return res.status(403).json({ code: "PROJECT_OS_SCHEDULED_UNAUTHORIZED" });
    try {
      const result = await dependencies.run();
      return res.status(200).json({ code: "PROJECT_OS_EMAIL_NOTIFICATIONS_CYCLE", result });
    } catch (error) {
      logError("scheduled.email_notifications_failed", error, { requestId: res.locals?.requestId });
      return res.status(500).json({ code: "PROJECT_OS_SCHEDULED_EXECUTION_FAILED" });
    }
  };
}

export const scheduledEmailNotificationsHandler = createScheduledEmailNotificationsHandler({
  cronSecret: () => process.env.CRON_SECRET,
  run: async () => { const db = await getDb(); if (!db) throw new Error("Database connection is not available"); const stalledUnits = await enqueueStalledUnitDigests(db, new Date()); return { stalledUnits, ...(await runEmailNotificationCycle({ db })) }; },
});
