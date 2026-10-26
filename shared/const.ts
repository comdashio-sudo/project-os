export const COOKIE_NAME = "app_session_id";
// A session is a signed token that names a row in auth_sessions; the row decides whether it still counts, so logging out
// ends it in the server. Thirty days is the longest a session can live either way. (The previous lifetime was one year.)
/** Owner's decision 2026-10-25 (docs/TASLEEM_AUDIT.md 1.28): a session ends 14 days after it began, whatever the activity, and 24 hours after the last request it made. */
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;
export const SESSION_IDLE_MS = 1000 * 60 * 60 * 24;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
