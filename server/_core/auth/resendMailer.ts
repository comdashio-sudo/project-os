import type { Mailer, OutgoingMail } from "./emailCode";

export type ResendMailerOptions = { apiKey: string; from: string; fetchImpl?: typeof fetch; endpoint?: string };

// Sends through Resend's HTTP API. The error never carries the response body or
// the key: both can name the recipient or the account.
export function createResendMailer(options: ResendMailerOptions): Mailer {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? "https://api.resend.com/emails";
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
