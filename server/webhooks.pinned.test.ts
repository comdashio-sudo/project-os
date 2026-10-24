import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postPinned, resolveSafeWebhookTarget } from "./integrations/webhooks";

// Work order 14, item 3: the webhook connects to the address that was CHECKED, not to whatever the name resolves to a moment later (DNS rebinding).
let server: Server; let port = 0;
const seen: Array<{ host: string | undefined; body: string }> = [];

describe("webhook delivery is pinned to the checked address", () => {
  beforeAll(async () => {
    server = createServer((request, response) => { let body = ""; request.on("data", chunk => { body += chunk; }); request.on("end", () => { seen.push({ host: request.headers.host, body }); response.statusCode = 204; response.end(); }); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

  it("connects to the pinned IP even though the host name resolves nowhere, and still sends the original name as Host", async () => {
    // `.invalid` can never be resolved: if the delivery asked DNS it would fail. It succeeds only because the connection goes to the pinned address.
    const url = new URL(`http://rebinding-test.invalid:${port}/hook`);
    const result = await postPinned(url, "127.0.0.1", { headers: { "content-type": "application/json" }, body: '{"a":1}', timeoutMs: 3000 });
    expect(result.status).toBe(204);
    expect(seen.at(-1)).toEqual({ host: `rebinding-test.invalid:${port}`, body: '{"a":1}' });
  });

  it("the unpinned way (a normal request by name) does fail for that name, so the test above proves the pin and not luck", async () => {
    await expect(fetch(`http://rebinding-test.invalid:${port}/hook`, { signal: AbortSignal.timeout(3000) })).rejects.toBeTruthy();
  });

  it("a name that answers with a private address is refused before any connection; a public literal is pinned to itself", async () => {
    const previous = process.env.INTEGRATION_ALLOW_PRIVATE_WEBHOOKS; delete process.env.INTEGRATION_ALLOW_PRIVATE_WEBHOOKS;
    try {
      await expect(resolveSafeWebhookTarget("https://127.0.0.1/hook")).rejects.toThrow("PROJECT_OS_WEBHOOK_URL_PRIVATE");
      await expect(resolveSafeWebhookTarget("https://169.254.169.254/latest")).rejects.toThrow("PROJECT_OS_WEBHOOK_URL_PRIVATE");
      await expect(resolveSafeWebhookTarget("http://93.184.216.34/hook")).rejects.toThrow("PROJECT_OS_WEBHOOK_URL_NOT_HTTPS");
      expect(await resolveSafeWebhookTarget("https://93.184.216.34/hook")).toMatchObject({ address: "93.184.216.34" });
    } finally { if (previous !== undefined) process.env.INTEGRATION_ALLOW_PRIVATE_WEBHOOKS = previous; }
  });
});
