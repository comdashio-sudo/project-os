export const COOKIE_NAME = "app_session_id";
// A session is a signed token that names a row in auth_sessions; the row decides whether it still counts, so logging out
// ends it in the server. Thirty days is the longest a session can live either way. (The previous lifetime was one year.)
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
