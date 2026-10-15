import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { evaluateTenantLicenseLifecycle } from "./db";

// The platform scheduler (a Render cron job, see render.yaml) calls this
// endpoint with `Authorization: Bearer <CRON_SECRET>`. With CRON_SECRET unset
// the endpoint refuses every request, so a deployment that forgot the secret is
// closed, not open.
type ScheduledLicenseExpiryDependencies = {
  cronSecret: () => string | undefined;
  evaluateTenantLicenseLifecycle: typeof evaluateTenantLicenseLifecycle;
};

const digest = (value: string) => createHash("sha256").update(value).digest();

export function isAuthorizedScheduledRequest(authorization: string | undefined, secret: string | undefined): boolean {
  if (!secret || secret.length < 16) return false;
  const match = /^Bearer (.+)$/.exec(authorization ?? "");
  if (!match) return false;
  return timingSafeEqual(digest(match[1]), digest(secret));
}

export function createScheduledLicenseExpiryHandler(dependencies: ScheduledLicenseExpiryDependencies) {
  return async function scheduledLicenseExpiryHandler(req: Request, res: Response) {
    if (!isAuthorizedScheduledRequest(req.headers?.authorization, dependencies.cronSecret())) {
      return res.status(403).json({ code: "PROJECT_OS_SCHEDULED_UNAUTHORIZED" });
    }
    try {
      const result = await dependencies.evaluateTenantLicenseLifecycle();
      return res.status(200).json({ code: "PROJECT_OS_LICENSE_LIFECYCLE_EVALUATED", result: { ...result, evaluatedAt: result.evaluatedAt.toISOString() } });
    } catch (error) {
      console.error("[Scheduled license expiry] Evaluation failed", error);
      return res.status(500).json({ code: "PROJECT_OS_SCHEDULED_EXECUTION_FAILED" });
    }
  };
}

export const scheduledLicenseExpiryHandler = createScheduledLicenseExpiryHandler({
  cronSecret: () => process.env.CRON_SECRET,
  evaluateTenantLicenseLifecycle,
});
