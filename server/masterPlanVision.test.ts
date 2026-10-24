import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// The real switch and the real provider client (server/_core/llm.ts), with fetch replaced by a spy. No database: every refusal tested here
// comes before any read. The reading itself (scope, permission, the model's answer) is in masterPlanVision.database.test.ts.
const fetchMock = vi.fn();
const user = { id: 7, openId: "vision-unit", name: "Vision unit", email: "vision-unit@vision.example.test", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() };
const ids = { tenantId: "11111111-1111-4111-8111-111111111111", projectId: "55555555-5555-4555-8555-555555555555", masterPlanVersionId: "66666666-6666-4666-8666-666666666666", shapeIds: ["22222222-2222-4222-8222-222222222222"] };
const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64")}`;
const ENABLED = { LLM_ENABLED: "true", LLM_API_KEY: "key-for-tests", LLM_BASE_URL: "https://llm.example.test/v1" };

async function callerWith(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ LLM_ENABLED: "", LLM_API_KEY: "", LLM_BASE_URL: "", ...env })) vi.stubEnv(key, value);
  const { appRouter } = await import("./routers");
  return appRouter.createCaller({ user } as unknown as TrpcContext);
}
const suggest = (caller: Awaited<ReturnType<typeof callerWith>>, imageDataUrl: string) => caller.masterPlanVision.suggestShapeCodes({ ...ids, imageDataUrl });

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("drawing reading: the switch", () => {
  it("answers NOT_FOUND and calls no provider when the switch is off by default", { timeout: 60_000 }, async () => {
    const caller = await callerWith({});
    await expect(suggest(caller, PNG)).rejects.toMatchObject({ code: "NOT_FOUND", message: "PROJECT_OS_VISION_NOT_AVAILABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays off unless LLM_ENABLED is exactly 'true', even with the provider configured", { timeout: 60_000 }, async () => {
    for (const value of ["TRUE", "True", "1", "yes", "false", " true", ""]) {
      const caller = await callerWith({ ...ENABLED, LLM_ENABLED: value });
      await expect(suggest(caller, PNG), value).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when the switch is on but the key or the base URL is missing", { timeout: 60_000 }, async () => {
    for (const env of [{ LLM_ENABLED: "true" }, { LLM_ENABLED: "true", LLM_API_KEY: "key-for-tests" }, { LLM_ENABLED: "true", LLM_BASE_URL: "https://llm.example.test/v1" }]) {
      const caller = await callerWith(env);
      await expect(suggest(caller, PNG), JSON.stringify(Object.keys(env))).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("drawing reading: the image, refused before any call", () => {
  it("refuses an image over 3 MB before any provider call or database read", async () => {
    const caller = await callerWith(ENABLED);
    const big = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(3 * 1024 * 1024)]).toString("base64")}`;
    await expect(suggest(caller, big)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE", message: "PROJECT_OS_VISION_IMAGE_TOO_LARGE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a type other than PNG or JPEG, a URL instead of data, and bytes that do not match the label", async () => {
    const caller = await callerWith(ENABLED);
    for (const value of ["data:image/gif;base64,R0lGODlh", "https://files.example.test/drawing.png", "data:image/png;base64,/9j/4AAQ"]) {
      await expect(suggest(caller, value), value).rejects.toMatchObject({ code: "BAD_REQUEST", message: "PROJECT_OS_VISION_IMAGE_INVALID" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a request with an id that is not a uuid, or no shape at all, before any call", async () => {
    const caller = await callerWith(ENABLED);
    await expect(caller.masterPlanVision.suggestShapeCodes({ ...ids, shapeIds: [], imageDataUrl: PNG })).rejects.toThrow();
    await expect(caller.masterPlanVision.suggestShapeCodes({ ...ids, shapeIds: ["not-a-uuid"], imageDataUrl: PNG })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
