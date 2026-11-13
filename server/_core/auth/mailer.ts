// Outgoing mail for notifications (never for sign-in: Supabase Auth sends its own sign-in code).
// One SMTP account, the same one the Supabase project is pointed at, so the owner configures a single sender.
import nodemailer, { type Transporter } from "nodemailer";
import { logWarn } from "../logger";

export type OutgoingMail = { to: string; subject: string; text: string; html: string };
export interface Mailer {
  send(mail: OutgoingMail): Promise<void>;
}

export type SmtpSettings = { host: string; port: number; user: string; password: string; from: string; replyTo?: string };

/** SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM; null while any is missing. EMAIL_REPLY_TO (optional, D-22): where a reply goes,
 *  for a sender address that nobody reads. */
export function smtpSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpSettings | null {
  const host = env.SMTP_HOST ?? "";
  const port = Number(env.SMTP_PORT ?? "");
  const user = env.SMTP_USER ?? "";
  const password = env.SMTP_PASSWORD ?? "";
  const from = env.EMAIL_FROM ?? "";
  if (!host || !Number.isInteger(port) || port <= 0 || !user || !password || !from) return null;
  const replyTo = (env.EMAIL_REPLY_TO ?? "").trim();
  return { host, port, user, password, from, ...(replyTo ? { replyTo } : {}) };
}

export type SmtpMailerOptions = SmtpSettings & { transport?: Pick<Transporter, "sendMail"> };

// The error never carries the server's reply or the credentials: both can name the recipient or the account.
export function createSmtpMailer(options: SmtpMailerOptions): Mailer {
  const transport = options.transport ?? nodemailer.createTransport({ host: options.host, port: options.port, secure: options.port === 465, auth: { user: options.user, pass: options.password } });
  return {
    async send(mail: OutgoingMail) {
      try {
        await transport.sendMail({ from: options.from, ...(options.replyTo ? { replyTo: options.replyTo } : {}), to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
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

// D-22: the links in a mail point at APP_BASE_URL and the mail comes from EMAIL_FROM. When the two are on different domains a mail looks forged to the
// person (and to some spam filters) — a «sign in» link to one domain in a mail from another. Said once at start, by variable NAME, never a value.
const TWO_PART_SUFFIXES = new Set(["com.sa", "net.sa", "org.sa", "edu.sa", "gov.sa", "co.uk", "org.uk", "com.au", "co.jp", "com.eg", "com.pk", "com.ae"]);
/** The registrable part of a host name (example.com, example.com.sa), lower-case; null for an IP address or nothing. */
export function registrableDomain(host: string): string | null {
  const name = host.trim().toLowerCase().replace(/\.$/, "");
  if (!name || /^[\d.]+$/.test(name) || name.includes(":")) return null;
  const labels = name.split(".").filter(Boolean);
  if (labels.length < 2) return name;
  const lastTwo = labels.slice(-2).join(".");
  return TWO_PART_SUFFIXES.has(lastTwo) && labels.length >= 3 ? labels.slice(-3).join(".") : lastTwo;
}
/** Whether the links' domain and the sender's domain differ; null when either is not set or cannot be read (nothing to compare). */
export function mailLinkDomainMismatch(env: NodeJS.ProcessEnv = process.env): boolean | null {
  let linkHost = "";
  try { linkHost = new URL((env.APP_BASE_URL ?? "").trim()).hostname; } catch { return null; }
  const sender = (env.EMAIL_FROM ?? "").trim().match(/@([^>\s]+)>?\s*$/)?.[1] ?? "";
  const links = registrableDomain(linkHost);
  const mail = registrableDomain(sender);
  if (!links || !mail) return null;
  return links !== mail;
}
export function warnOnMailLinkDomainMismatch(env: NodeJS.ProcessEnv = process.env): boolean {
  const mismatch = mailLinkDomainMismatch(env) === true;
  if (mismatch) logWarn("mail.link_domain_mismatch", { detail: "APP_BASE_URL and EMAIL_FROM are on different domains; mails will link to one domain from another" });
  return mismatch;
}
