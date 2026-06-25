import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { UNVERIFIED_ACCOUNT_TTL_MS } from './auth.constants';

/**
 * Removes abandoned email/password signups that never confirmed their address, so squatted emails
 * are freed and the table isn't filled with dead rows.
 *
 * Deliberately conservative: only accounts that are BOTH unverified AND empty (no expenses, incomes,
 * goals or categories) are deleted. An unverified user who actually started using the app keeps
 * their data — they just keep seeing the "confirm your email" prompt. Google/Telegram accounts are
 * never touched (Google is verified on sign-in; Telegram accounts have no email/password).
 */
@Injectable()
export class AccountCleanupService {
  private readonly logger = new Logger(AccountCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  // 4 AM — after the 3 AM DB backup (scripts/backup-db.sh), so deleted accounts are captured in a
  // backup before they're removed.
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeUnverifiedAccounts(): Promise<void> {
    const cutoff = new Date(Date.now() - UNVERIFIED_ACCOUNT_TTL_MS);
    const { count } = await this.prisma.user.deleteMany({
      where: {
        emailVerified: false,
        // An email/password registration specifically — not Telegram (no email/password) and not
        // Google (always verified).
        email: { not: null },
        password: { not: null },
        createdAt: { lt: cutoff },
        // Empty account only: never delete anything a user actually created.
        expenses: { none: {} },
        incomes: { none: {} },
        goals: { none: {} },
        expenseCategories: { none: {} },
        incomeCategories: { none: {} },
      },
    });

    if (count > 0) {
      this.logger.log(`Purged ${count} unverified empty account(s) older than 72h`);
    }
  }
}
