import { describe, expect, it, vi } from "vitest";
import { createScheduledDailyHandler } from "./scheduledDaily";

const SECRET = "cron-secret-0123456789abcdef";
const response = () => { const res: any = { locals: {} }; res.status = vi.fn(() => res); res.json = vi.fn(() => res); return res; };
const request = (authorization?: string) => ({ headers: { authorization } }) as any;

describe("the single daily cron of the free plan", () => {
  it("refuses a caller without the secret and runs nothing", async () => {
    const run = vi.fn(async () => undefined);
    const res = response();
    await createScheduledDailyHandler({ cronSecret: () => SECRET, steps: () => [["a", run]] })(request(), res);
    expect(res.status).toHaveBeenCalledWith(403); expect(run).not.toHaveBeenCalled();
    await createScheduledDailyHandler({ cronSecret: () => undefined, steps: () => [["a", run]] })(request(`Bearer ${SECRET}`), response());
    expect(run).not.toHaveBeenCalled(); // no CRON_SECRET configured: closed
  });

  it("runs every step in order and answers 200 when all succeed", async () => {
    const order: string[] = [];
    const res = response();
    await createScheduledDailyHandler({ cronSecret: () => SECRET, steps: () => [["one", async () => { order.push("one"); }], ["two", async () => { order.push("two"); }]] })(request(`Bearer ${SECRET}`), res);
    expect(order).toEqual(["one", "two"]);
    expect(res.status).toHaveBeenCalledWith(200); expect(res.json).toHaveBeenCalledWith({ code: "PROJECT_OS_DAILY_JOBS_DONE", result: { one: "ok", two: "ok" } });
  });

  it("a failing step does not stop the next one, and the answer is 500 naming it", async () => {
    const after = vi.fn(async () => undefined);
    const res = response();
    await createScheduledDailyHandler({ cronSecret: () => SECRET, steps: () => [["bad", async () => { throw new Error("boom"); }], ["good", after]] })(request(`Bearer ${SECRET}`), res);
    expect(after).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500); expect(res.json).toHaveBeenCalledWith({ code: "PROJECT_OS_SCHEDULED_EXECUTION_FAILED", result: { bad: "failed", good: "ok" } });
  });
});
