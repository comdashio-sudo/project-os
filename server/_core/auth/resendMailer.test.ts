import { describe, expect, it, vi } from "vitest";
import { createResendMailer } from "./resendMailer";

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
});
