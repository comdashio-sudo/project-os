// Outgoing mail for notifications (never for sign-in: Supabase Auth sends its own sign-in code).
// One SMTP account, the same one the Supabase project is pointed at, so the owner configures a single sender.
import nodemailer, { type Transporter } from "nodemailer";

export type OutgoingMail = { to: string; subject: string; text: string; html: string };
export interface Mailer {
  send(mail: OutgoingMail): Promise<void>;
}

export type SmtpSettings = { host: string; port: number; user: string; password: string; from: string };

/** SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM; null while any is missing. */
export function smtpSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpSettings | null {
  const host = env.SMTP_HOST ?? "";
  const port = Number(env.SMTP_PORT ?? "");
  const user = env.SMTP_USER ?? "";
  const password = env.SMTP_PASSWORD ?? "";
  const from = env.EMAIL_FROM ?? "";
  if (!host || !Number.isInteger(port) || port <= 0 || !user || !password || !from) return null;
  return { host, port, user, password, from };
}

export type SmtpMailerOptions = SmtpSettings & { transport?: Pick<Transporter, "sendMail"> };

// The error never carries the server's reply or the credentials: both can name the recipient or the account.
export function createSmtpMailer(options: SmtpMailerOptions): Mailer {
  const transport = options.transport ?? nodemailer.createTransport({ host: options.host, port: options.port, secure: options.port === 465, auth: { user: options.user, pass: options.password } });
  return {
    async send(mail: OutgoingMail) {
      try {
        await transport.sendMail({ from: options.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
      } catch {
        throw new Error("The mail server rejected the message");
      }
    },
  };
}

// Q-16: whether the platform can actually send mail (invitations, the daily digests, the stalled-units digest), said by variable NAME only — never a value.
// All seven are needed: the five SMTP ones, the switch, and the address the links in a mail point to.
export const MAIL_VARIABLES = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM", "EMAIL_NOTIFICATIONS_ENABLED", "APP_BASE_URL"] as const;
export function mailSetup(env: NodeJS.ProcessEnv = process.env): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM", "APP_BASE_URL"] as const) if (!(env[name] ?? "").trim()) missing.push(name);
  const port = Number(env.SMTP_PORT ?? "");
  if (!Number.isInteger(port) || port <= 0) missing.push("SMTP_PORT");
  if (env.EMAIL_NOTIFICATIONS_ENABLED !== "true") missing.push("EMAIL_NOTIFICATIONS_ENABLED");
  const ordered = MAIL_VARIABLES.filter(name => missing.includes(name));
  return { configured: ordered.length === 0, missing: ordered };
}
