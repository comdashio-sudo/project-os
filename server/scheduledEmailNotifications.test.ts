import { describe, expect, it, vi } from "vitest";
import { createScheduledEmailNotificationsHandler } from "./scheduledEmailNotifications";

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
const SECRET = "test-only-cron-secret-0123456789";
const request = (authorization?: string) => ({ headers: authorization ? { authorization } : {} }) as never;

describe("scheduled e-mail notifications handler", () => {
  it("does nothing for a request without the exact secret, and for every request when no secret is configured", async () => {
    const run = vi.fn(); const res = response();
    await createScheduledEmailNotificationsHandler({ cronSecret: () => SECRET, run })(request("Bearer wrong-secret-value-000000"), res as never);
    await createScheduledEmailNotificationsHandler({ cronSecret: () => undefined, run })(request(`Bearer ${SECRET}`), res as never);
    expect(run).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("runs one cycle and returns its summary", async () => {
    const run = vi.fn().mockResolvedValue({ enabled: false }); const res = response();
    await createScheduledEmailNotificationsHandler({ cronSecret: () => SECRET, run })(request(`Bearer ${SECRET}`), res as never);
    expect(run).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ code: "PROJECT_OS_EMAIL_NOTIFICATIONS_CYCLE", result: { enabled: false } });
  });

  it("answers a failed cycle with a code only, never the error's text", async () => {
    const run = vi.fn().mockRejectedValue(new Error("secret detail: recipient@example.test")); const res = response();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await createScheduledEmailNotificationsHandler({ cronSecret: () => SECRET, run })(request(`Bearer ${SECRET}`), res as never);
    spy.mockRestore();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ code: "PROJECT_OS_SCHEDULED_EXECUTION_FAILED" });
  });
});
