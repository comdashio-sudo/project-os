import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { createScheduledProfitabilitySnapshotsHandler } from "./scheduledProfitabilitySnapshots";

const SECRET = "synthetic-cron-secret-0123456789";
const periodAt = new Date("2026-10-01T00:00:00.000Z");

function run(authorization: string | undefined, secret: string | undefined, capture = vi.fn(async () => ({ periodAt, captured: 2, skipped: 1, failed: 0 }))) {
  const handler = createScheduledProfitabilitySnapshotsHandler({ cronSecret: () => secret, capture });
  const res = { statusCode: 0, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
  return handler({ headers: { authorization } } as Request, res as unknown as Response).then(() => ({ res, capture }));
}

describe("scheduled profitability snapshots endpoint", () => {
  it("refuses without the cron secret and never runs", async () => {
    for (const [authorization, secret] of [[undefined, SECRET], ["Bearer wrong-secret-0123456789ab", SECRET], [`Bearer ${SECRET}`, undefined], [`Bearer short`, "short"]] as const) {
      const { res, capture } = await run(authorization, secret);
      expect(res.statusCode).toBe(403);
      expect(capture).not.toHaveBeenCalled();
    }
  });

  it("runs the capture with the right secret and reports counts only", async () => {
    const { res, capture } = await run(`Bearer ${SECRET}`, SECRET);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ code: "PROJECT_OS_PROFITABILITY_SNAPSHOTS_CAPTURED", result: { periodAt: periodAt.toISOString(), captured: 2, skipped: 1, failed: 0 } });
  });

  it("hides the failure reason from the caller", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { res } = await run(`Bearer ${SECRET}`, SECRET, vi.fn(async () => { throw new Error("db password leaked here"); }));
    spy.mockRestore();
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("leaked");
  });
});
