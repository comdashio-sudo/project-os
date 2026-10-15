export const COOKIE_NAME = "app_session_id";
// A session is a stateless signed token, so it cannot be revoked server-side:
// keep it short. (The previous lifetime was one year.)
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
