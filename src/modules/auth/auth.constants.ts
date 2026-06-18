export const ACCESS_TOKEN_TTL = '15m';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export const REFRESH_TOKEN_TTL_DAYS = 7;
export const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;

// Срок жизни ссылки подтверждения почты — сутки (доставка письма может задержаться).
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
