import { ForbiddenException } from '@nestjs/common';

/**
 * Thrown when an action would exceed the user's plan limits (categories or monthly transactions).
 * A subclass of ForbiddenException so the HTTP API still answers 403, while the Telegram bot can
 * detect it (instanceof) and reply with an upgrade prompt instead of failing silently.
 */
export class PlanLimitExceededException extends ForbiddenException {}
