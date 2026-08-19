import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { createScheduledLicenseExpiryHandler } from "./scheduledLicenseExpiry";

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe("scheduled license expiry handler", () => {
  it("rejects a request that is not an authenticated scheduled task", async () => {
    const res = response();
    const handler = createScheduledLicenseExpiryHandler({ authenticateRequest: vi.fn().mockResolvedValue({ isCron: false }), getScheduledJobByTaskUid: vi.fn(), evaluateTenantLicenseLifecycle: vi.fn() });
    await handler({} as never, res as never);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ code: "PROJECT_OS_SCHEDULED_UNAUTHORIZED" });
  });

  it("maps a rejected cron authentication attempt to a non-retryable forbidden response", async () => {
    const res = response();
    const handler = createScheduledLicenseExpiryHandler({ authenticateRequest: vi.fn().mockRejectedValue(new TRPCError({ code: "FORBIDDEN" })), getScheduledJobByTaskUid: vi.fn(), evaluateTenantLicenseLifecycle: vi.fn() });
    await handler({} as never, res as never);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ code: "PROJECT_OS_SCHEDULED_UNAUTHORIZED" });
  });

  it("rejects an unknown task UID before it evaluates tenant licenses", async () => {
    const res = response(); const evaluateTenantLicenseLifecycle = vi.fn();
    const handler = createScheduledLicenseExpiryHandler({ authenticateRequest: vi.fn().mockResolvedValue({ isCron: true, taskUid: "missing-task" }), getScheduledJobByTaskUid: vi.fn().mockResolvedValue(null), evaluateTenantLicenseLifecycle });
    await handler({} as never, res as never);
    expect(evaluateTenantLicenseLifecycle).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ code: "PROJECT_OS_SCHEDULED_TASK_UNREGISTERED" });
  });

  it("evaluates licenses only for the registered lifecycle task", async () => {
    const res = response(); const evaluatedAt = new Date("2026-08-19T02:00:00.000Z");
    const handler = createScheduledLicenseExpiryHandler({ authenticateRequest: vi.fn().mockResolvedValue({ isCron: true, taskUid: "license-task" }), getScheduledJobByTaskUid: vi.fn().mockResolvedValue({ purpose: "license_lifecycle" }), evaluateTenantLicenseLifecycle: vi.fn().mockResolvedValue({ evaluatedAt, transitioned: 1, transitions: [{ id: "license-1", status: "expired" }] }) });
    await handler({} as never, res as never);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ code: "PROJECT_OS_LICENSE_LIFECYCLE_EVALUATED", result: { evaluatedAt: "2026-08-19T02:00:00.000Z", transitioned: 1, transitions: [{ id: "license-1", status: "expired" }] } });
  });
});
