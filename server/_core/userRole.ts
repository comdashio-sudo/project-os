import { ENV } from "./env";
import { openIdForEmail } from "./auth/emailCode";

/** The role an account has by default: the owner's address is the platform administrator, everyone else a user. Used when an account is written and when it is checked. */
export const defaultRoleFor = (openId: string): "admin" | "user" => (ENV.ownerEmail && openId === openIdForEmail(ENV.ownerEmail) ? "admin" : "user");

/** How stale `lastSignedIn` may get before an authenticated request writes it again. Without this every request of a signed-in person wrote the users row. */
export const LAST_SEEN_REFRESH_MS = 60_000;

/** True when the account row already says what a write would say, so the request needs no write: role as it would be assigned, last-seen less than a minute old. */
export const accountIsCurrent = (user: { openId: string; role: string; lastSignedIn: Date }, now = Date.now()) =>
  user.role === defaultRoleFor(user.openId) && now - user.lastSignedIn.getTime() < LAST_SEEN_REFRESH_MS;
