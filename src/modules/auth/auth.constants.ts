export const ACCESS_TOKEN_TTL = '15m';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export const REFRESH_TOKEN_TTL_DAYS = 7;
export const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;

// Lifetime of the email confirmation link — 24 hours (email delivery can be delayed).
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

// How long an unverified, empty email/password account is kept before the cleanup job deletes it.
// Longer than the link TTL so the user still has a window to confirm (or resend) after it expires.
export const UNVERIFIED_ACCOUNT_TTL_MS = 72 * 60 * 60 * 1000;
