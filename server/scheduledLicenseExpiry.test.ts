import { describe, expect, it, vi } from "vitest";
import { createScheduledLicenseExpiryHandler, isAuthorizedScheduledRequest } from "./scheduledLicenseExpiry";

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
const SECRET = "test-only-cron-secret-0123456789";
const request = (authorization?: string) => ({ headers: authorization ? { authorization } : {} }) as never;

describe("scheduled license expiry authorization", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedScheduledRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isAuthorizedScheduledRequest(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorizedScheduledRequest(SECRET, SECRET)).toBe(false);
    expect(isAuthorizedScheduledRequest(undefined, SECRET)).toBe(false);
    expect(isAuthorizedScheduledRequest("Bearer ", SECRET)).toBe(false);
  });

  it("is closed when the secret is unset or too short", () => {
    expect(isAuthorizedScheduledRequest("Bearer anything", undefined)).toBe(false);
    expect(isAuthorizedScheduledRequest("Bearer ", "")).toBe(false);
    expect(isAuthorizedScheduledRequest("Bearer short", "short")).toBe(false);
  });
});

describe("scheduled license expiry handler", () => {
  it("rejects a request without the secret before it evaluates anything", async () => {
    const res = response(); const evaluateTenantLicenseLifecycle = vi.fn();
    const handler = createScheduledLicenseExpiryHandler({ cronSecret: () => SECRET, evaluateTenantLicenseLifecycle });
    await handler(request(), res as never);
    await handler(request("Bearer wrong-secret-value-000000"), res as never);
    expect(evaluateTenantLicenseLifecycle).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ code: "PROJECT_OS_SCHEDULED_UNAUTHORIZED" });
  });

  it("refuses every request when no secret is configured", async () => {
    const res = response(); const evaluateTenantLicenseLifecycle = vi.fn();
    const handler = createScheduledLicenseExpiryHandler({ cronSecret: () => undefined, evaluateTenantLicenseLifecycle });
    await handler(request(`Bearer ${SECRET}`), res as never);
    expect(evaluateTenantLicenseLifecycle).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("evaluates tenant licenses for the authorized scheduler", async () => {
    const res = response(); const evaluatedAt = new Date("2026-08-19T02:00:00.000Z");
    const handler = createScheduledLicenseExpiryHandler({ cronSecret: () => SECRET, evaluateTenantLicenseLifecycle: vi.fn().mockResolvedValue({ evaluatedAt, transitioned: 1, transitions: [{ id: "license-1", status: "expired" }] }) });
    await handler(request(`Bearer ${SECRET}`), res as never);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ code: "PROJECT_OS_LICENSE_LIFECYCLE_EVALUATED", result: { evaluatedAt: "2026-08-19T02:00:00.000Z", transitioned: 1, transitions: [{ id: "license-1", status: "expired" }] } });
  });

  it("reports an execution failure without leaking the error", async () => {
    const res = response();
    const handler = createScheduledLicenseExpiryHandler({ cronSecret: () => SECRET, evaluateTenantLicenseLifecycle: vi.fn().mockRejectedValue(new Error("boom with internals")) });
    await handler(request(`Bearer ${SECRET}`), res as never);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ code: "PROJECT_OS_SCHEDULED_EXECUTION_FAILED" });
  });
});
