export const ACCESS_TOKEN_TTL = '15m';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export const REFRESH_TOKEN_TTL_DAYS = 7;
export const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;

// Lifetime of the email confirmation link — 24 hours (email delivery can be delayed).
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
