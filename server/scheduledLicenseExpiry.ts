import type { Request, Response } from "express";
import { evaluateTenantLicenseLifecycle, getScheduledJobByTaskUid } from "./db";
import { sdk } from "./_core/sdk";

type ScheduledLicenseExpiryDependencies = {
  authenticateRequest: (req: Request) => Promise<{ isCron?: boolean; taskUid?: string }>;
  getScheduledJobByTaskUid: typeof getScheduledJobByTaskUid;
  evaluateTenantLicenseLifecycle: typeof evaluateTenantLicenseLifecycle;
};

export function createScheduledLicenseExpiryHandler(dependencies: ScheduledLicenseExpiryDependencies) {
  return async function scheduledLicenseExpiryHandler(req: Request, res: Response) {
    try {
      const user = await dependencies.authenticateRequest(req);
    if (user.isCron !== true || !user.taskUid) {
      return res.status(403).json({ code: "PROJECT_OS_SCHEDULED_UNAUTHORIZED" });
    }
      const job = await dependencies.getScheduledJobByTaskUid(user.taskUid);
    if (!job || job.purpose !== "license_lifecycle") {
      return res.status(403).json({ code: "PROJECT_OS_SCHEDULED_TASK_UNREGISTERED" });
    }
      const result = await dependencies.evaluateTenantLicenseLifecycle();
    return res.status(200).json({ code: "PROJECT_OS_LICENSE_LIFECYCLE_EVALUATED", result: { ...result, evaluatedAt: result.evaluatedAt.toISOString() } });
    } catch (error) {
      console.error("[Scheduled license expiry] Evaluation failed", error);
      return res.status(500).json({ code: "PROJECT_OS_SCHEDULED_EXECUTION_FAILED" });
    }
  }
}

export const scheduledLicenseExpiryHandler = createScheduledLicenseExpiryHandler({
  authenticateRequest: req => sdk.authenticateRequest(req as unknown as Request),
  getScheduledJobByTaskUid,
  evaluateTenantLicenseLifecycle,
});
