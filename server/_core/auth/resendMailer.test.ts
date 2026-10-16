import { describe, expect, it, vi } from "vitest";
import { createResendMailer, resendEndpointFromEnv } from "./resendMailer";

const mail = { to: "engineer@example.test", subject: "code", text: "123456", html: "<p>123456</p>" };

describe("resend mailer", () => {
  it("posts the message with the bearer key and the configured sender", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await createResendMailer({ apiKey: "key-for-tests", from: "PROJECT OS <login@mail.example.test>", fetchImpl: fetchImpl as never }).send(mail);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer key-for-tests");
    expect(JSON.parse(String(init.body))).toEqual({ from: "PROJECT OS <login@mail.example.test>", to: ["engineer@example.test"], subject: "code", text: "123456", html: "<p>123456</p>" });
  });

  it("fails on a rejected message without echoing the response, the key or the recipient", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"message":"engineer@example.test is suppressed"}', { status: 422 }));
    const error = await createResendMailer({ apiKey: "key-for-tests", from: "x", fetchImpl: fetchImpl as never }).send(mail).catch(e => e as Error);
    expect((error as Error).message).toBe("Resend rejected the message (422)");
    expect(String(error)).not.toContain("key-for-tests");
    expect(String(error)).not.toContain("engineer@example.test");
  });

  it("sends to the fake provider only when RESEND_API_URL is a loopback http address", () => {
    expect(resendEndpointFromEnv(undefined)).toBe("https://api.resend.com/emails");
    expect(resendEndpointFromEnv("http://127.0.0.1:4010/emails")).toBe("http://127.0.0.1:4010/emails");
    expect(resendEndpointFromEnv("http://localhost:4010/emails")).toBe("http://localhost:4010/emails");
    // anything that could carry the key or a code off this machine is ignored
    expect(resendEndpointFromEnv("https://127.0.0.1/emails")).toBe("https://api.resend.com/emails");
    expect(resendEndpointFromEnv("http://mail.example.test/emails")).toBe("https://api.resend.com/emails");
    expect(resendEndpointFromEnv("http://127.0.0.1.example.test/emails")).toBe("https://api.resend.com/emails");
    expect(resendEndpointFromEnv("not a url")).toBe("https://api.resend.com/emails");
  });

  it("posts to the loopback fake when the endpoint is overridden, and still never to a foreign host", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const previous = process.env.RESEND_API_URL;
    process.env.RESEND_API_URL = "http://127.0.0.1:4010/emails";
    try {
      await createResendMailer({ apiKey: "key-for-tests", from: "x", fetchImpl: fetchImpl as never }).send(mail);
      process.env.RESEND_API_URL = "http://attacker.example.test/emails";
      await createResendMailer({ apiKey: "key-for-tests", from: "x", fetchImpl: fetchImpl as never }).send(mail);
    } finally {
      if (previous === undefined) delete process.env.RESEND_API_URL; else process.env.RESEND_API_URL = previous;
    }
    expect(fetchImpl.mock.calls.map(call => (call as unknown as [string])[0])).toEqual(["http://127.0.0.1:4010/emails", "https://api.resend.com/emails"]);
  });
});
