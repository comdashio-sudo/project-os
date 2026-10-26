// The gate in front of every notification e-mail the application sends (work order 20, owner's decisions of 2026-10-25; docs/TASLEEM_AUDIT.md 2.2, 2.3, 2.4).
// Sign-in codes leave through Supabase Auth's SMTP, outside this application, but the SMTP account's daily quota is ONE quota shared with them: if notifications used all of it, nobody
// could sign in. So the notifications are held to a daily budget that leaves a fixed reserve for sign-in codes, anything over the budget WAITS for tomorrow (it is never dropped),
// the urgent kinds go first, a burst is stopped and paused, and an address on a reserved domain (.test, .invalid, .local, example.com ...) is never mailed in production.
export type MailGateConfig = {
  /** Mails the SMTP account may send in a UTC day (its plan's limit). */
  dailyLimit: number;
  /** The part of it kept for sign-in codes: notifications may use only dailyLimit - loginReserve. */
  loginReserve: number;
  /** More than this many sent within a minute is a runaway, not a workload. */
  perMinute: number;
  /** After a runaway nothing is sent for this long. */
  pauseMs: number;
  /** Refuse reserved domains (production). Tests and demos use *.example.test addresses on purpose, so it is off outside production. */
  blockReservedDomains: boolean;
};

const positiveInt = (value: string | undefined) => { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : undefined; };

export function mailGateConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MailGateConfig {
  const dailyLimit = positiveInt(env.EMAIL_DAILY_LIMIT) ?? 100;
  const requestedReserve = Number(env.EMAIL_LOGIN_RESERVE);
  const loginReserve = Number.isInteger(requestedReserve) && requestedReserve >= 0 ? Math.min(requestedReserve, dailyLimit - 1) : Math.min(40, dailyLimit - 1);
  const override = (env.EMAIL_BLOCK_RESERVED_DOMAINS ?? "").trim().toLowerCase();
  return { dailyLimit, loginReserve, perMinute: positiveInt(env.EMAIL_BURST_PER_MINUTE) ?? 20, pauseMs: 15 * 60_000, blockReservedDomains: override === "true" ? true : override === "false" ? false : env.NODE_ENV === "production" };
}

/** What notifications may still send today. */
export const notificationAllowance = (config: MailGateConfig, sentToday: number) => Math.max(0, config.dailyLimit - config.loginReserve - sentToday);

export const startOfUtcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

const RESERVED_SUFFIXES = [".test", ".invalid", ".local", ".localhost", ".example", ".internal"];
const RESERVED_DOMAINS = ["example.com", "example.org", "example.net"];
/** A domain that can never receive mail (RFC 2606 / 6761 names and the documentation domains). A mail to one bounces and damages the sender's reputation. */
export function isReservedMailDomain(address: string): boolean {
  const trimmed = address.trim().toLowerCase();
  if (!trimmed.includes("@")) return true; // not an address at all
  const domain = trimmed.split("@").pop() ?? "";
  if (!domain) return true;
  return RESERVED_SUFFIXES.some(suffix => domain.endsWith(suffix)) || RESERVED_DOMAINS.some(reserved => domain === reserved || domain.endsWith(`.${reserved}`));
}

/** When the last runaway ends: the end of the pause that follows the latest minute in which `perMinute` or more mails were sent. Null when no pause is running. */
export function pauseEnd(sentAt: Date[], now: Date, config: MailGateConfig): Date | null {
  const times = sentAt.map(date => date.getTime()).sort((a, b) => a - b);
  let latestBurstEnd: number | null = null;
  for (let right = config.perMinute - 1; right < times.length; right += 1) {
    if (times[right] - times[right - (config.perMinute - 1)] < 60_000) latestBurstEnd = times[right];
  }
  if (latestBurstEnd === null) return null;
  const end = latestBurstEnd + config.pauseMs;
  return end > now.getTime() ? new Date(end) : null;
}
