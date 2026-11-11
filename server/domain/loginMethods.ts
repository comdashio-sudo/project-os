/**
 * Login methods that only start a session after the person proved they own the email address (G-107): a one-time code sent to it, or Google's verified-email claim,
 * or (D-82) a password, which the identity provider accepts only for a CONFIRMED address (email_confirmed_at, checked in supabaseAuth.ts) and which is itself set
 * only with a code mailed to that address (/api/auth/password/set).
 */
export const VERIFIED_LOGIN_METHODS: readonly string[] = ["email", "google", "password"];
