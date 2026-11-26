import { afterEach, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { captureLogs } from "./_core/logger";
import { appRouter } from "./routers";

// Q-56 (7): the browser's «this page could not be shown» code reaches the server's log, so a person's report finds its line. Writes nothing else.
const lines: string[] = []; const restore = captureLogs(line => { if (line.includes('"client.render_failed"')) lines.push(line); });
afterEach(() => { lines.length = 0; });
const user = { id: 7, openId: "diag-user", name: "Diag", email: "diag@diag.example.test", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() };
const signedIn = appRouter.createCaller({ user } as unknown as TrpcContext);
const anonymous = appRouter.createCaller({ user: null } as unknown as TrpcContext);
const input = { code: "R-7KQ2M", errorName: "TypeError", route: "/projects/56aa7000-0000-4000-8000-000000000001/x/baseline", chunk: true };

describe("diagnostics.renderFailed", () => {
  it("POSITIVE: logs one line with the code, the error's name, the path and whether it was a removed code file", async () => {
    expect(await signedIn.diagnostics.renderFailed(input)).toEqual({ logged: true });
    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0]);
    expect(line).toMatchObject({ level: "warn", event: "client.render_failed", code: "R-7KQ2M", errorName: "TypeError", route: input.route, chunk: true, userId: 7 });
  });
  it("NEGATIVE: a message or any other field is refused, not logged", async () => {
    await expect(signedIn.diagnostics.renderFailed({ ...input, message: "someone@x.example.test" } as never)).rejects.toThrow();
    await expect(signedIn.diagnostics.renderFailed({ ...input, errorName: "Type Error: leaked text" })).rejects.toThrow();
    await expect(signedIn.diagnostics.renderFailed({ ...input, code: "anything goes" })).rejects.toThrow();
    expect(lines).toHaveLength(0);
  });
  it("NEGATIVE: someone not signed in cannot write to the log", async () => {
    await expect(anonymous.diagnostics.renderFailed(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(lines).toHaveLength(0);
  });
  it("the path's query never reaches the log", async () => {
    await signedIn.diagnostics.renderFailed({ ...input, route: "/projects/t/p/import?token=abc" });
    expect(JSON.parse(lines[0]).route).toBe("/projects/t/p/import");
  });
});
process.on("exit", restore);
