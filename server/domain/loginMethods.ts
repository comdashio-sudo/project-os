/** Login methods that only start a session after the person proved they own the email address (G-107): a one-time code sent to it, or Google's verified-email claim. */
export const VERIFIED_LOGIN_METHODS: readonly string[] = ["email", "google"];
