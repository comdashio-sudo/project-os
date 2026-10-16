import type { Mailer, OutgoingMail } from "./emailCode";

const DEFAULT_ENDPOINT = "https://api.resend.com/emails";

/**
 * RESEND_API_URL lets a local rehearsal point the sender at a fake provider on this machine, so a
 * sign-in code can be read without a real mailbox. It is honoured ONLY for a loopback address: a
 * mistaken or injected value can never send codes (or the API key) to another host.
 */
export function resendEndpointFromEnv(value: string | undefined = process.env.RESEND_API_URL): string {
  if (!value) return DEFAULT_ENDPOINT;
  try {
    const url = new URL(value);
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    return loopback && url.protocol === "http:" ? url.toString() : DEFAULT_ENDPOINT;
  } catch {
    return DEFAULT_ENDPOINT;
  }
}

export type ResendMailerOptions = { apiKey: string; from: string; fetchImpl?: typeof fetch; endpoint?: string };

// Sends through Resend's HTTP API. The error never carries the response body or
// the key: both can name the recipient or the account.
export function createResendMailer(options: ResendMailerOptions): Mailer {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? resendEndpointFromEnv();
  return {
    async send(mail: OutgoingMail) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: options.from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      });
      if (!response.ok) throw new Error(`Resend rejected the message (${response.status})`);
    },
  };
}
