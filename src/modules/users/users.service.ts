import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FREE_SUBSCRIPTION } from '../subscriptions/subscriptions.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Fields safe to expose externally: no password and no BigInt telegramId
const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  currency: true,
  timezone: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

// Defaults applied ONLY when creating a new user (social login / registration).
export type UserDefaults = { currency?: string; timezone?: string };

// Keeps only the provided fields, so empty ones don't overwrite the schema @default.
function pickDefaults(defaults?: UserDefaults): UserDefaults {
  return {
    ...(defaults?.currency ? { currency: defaults.currency } : {}),
    ...(defaults?.timezone ? { timezone: defaults.timezone } : {}),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateUserDto) {
    return this.prisma.user.create({
      data: { ...dto, subscription: FREE_SUBSCRIPTION },
      select: PUBLIC_USER_SELECT,
    });
  }

  findAll() {
    return this.prisma.user.findMany({ select: PUBLIC_USER_SELECT });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: dto, select: PUBLIC_USER_SELECT });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.user.delete({ where: { id }, select: PUBLIC_USER_SELECT });
  }

  findByTelegramId(telegramId: bigint) {
    return this.prisma.user.findUnique({ where: { telegramId } });
  }

  // telegramUsername: undefined = leave as is, string/null = the current @username (users can
  // change or remove it, so it's refreshed whenever the caller has fresh Telegram data).
  // languageCode: same idea for Telegram's `language_code` — kept fresh so proactive pushes (the
  // monthly digest, trade-closed notifications) have a language to render in without a live ctx.
  async findOrCreateByTelegramId(
    telegramId: bigint,
    defaults?: UserDefaults,
    telegramUsername?: string | null,
    languageCode?: string | null,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { telegramId } });
    if (existing) {
      const changes: Prisma.UserUpdateInput = {};
      if (telegramUsername !== undefined && telegramUsername !== existing.telegramUsername) {
        changes.telegramUsername = telegramUsername;
      }
      if (languageCode !== undefined && languageCode !== existing.languageCode) {
        changes.languageCode = languageCode;
      }
      if (Object.keys(changes).length > 0) {
        const user = await this.prisma.user.update({ where: { id: existing.id }, data: changes });
        return { user, isNew: false };
      }
      return { user: existing, isNew: false };
    }
    const user = await this.prisma.user.create({
      data: {
        telegramId,
        ...(telegramUsername !== undefined ? { telegramUsername } : {}),
        ...(languageCode !== undefined ? { languageCode } : {}),
        ...pickDefaults(defaults),
        subscription: FREE_SUBSCRIPTION,
      },
    });
    return { user, isNew: true };
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findOrCreateByEmail(email: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) return { user: existing, isNew: false };
    const user = await this.prisma.user.create({
      data: { email, subscription: FREE_SUBSCRIPTION },
    });
    return { user, isNew: true };
  }

  // Only used when linking a Google account (the email comes from a Google-verified token), so the
  // email is considered confirmed.
  setEmail(userId: string, email: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { email, emailVerified: true },
    });
  }

  findByGoogleId(googleId: string) {
    return this.prisma.user.findUnique({ where: { googleId } });
  }

  async findOrCreateByGoogle(googleId: string, email: string, defaults?: UserDefaults) {
    const byGoogleId = await this.prisma.user.findUnique({ where: { googleId } });
    if (byGoogleId) return { user: byGoogleId, isNew: false };

    // An account with this email already exists (e.g. registered with a password) — link Google.
    // Google verifies the email, so confirm it here too (covers an unverified password signup).
    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      const user = await this.prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId, emailVerified: true },
      });
      return { user, isNew: false };
    }

    // Google sign-up: the email is verified by Google.
    const user = await this.prisma.user.create({
      data: {
        email,
        googleId,
        emailVerified: true,
        ...pickDefaults(defaults),
        subscription: FREE_SUBSCRIPTION,
      },
    });
    return { user, isNew: true };
  }

  setGoogleId(userId: string, googleId: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { googleId } });
  }

  setTelegramId(userId: string, telegramId: bigint, telegramUsername?: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        telegramId,
        ...(telegramUsername !== undefined ? { telegramUsername } : {}),
      },
    });
  }

  async getTimezone(id: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { timezone: true },
    });
    return user?.timezone ?? 'UTC';
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    await this.findOne(id);
    await this.prisma.user.update({ where: { id }, data: dto });
    return this.findMe(id);
  }

  async findMe(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        email: true,
        emailVerified: true,
        name: true,
        role: true,
        telegramId: true,
        password: true,
        currency: true,
        timezone: true,
        subscription: {
          select: {
            plan: true,
            expiresAt: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    // Email awaiting confirmation: set via POST /auth/me/credentials but not yet linked
    // (the user hasn't followed the link). Only relevant while there's no email on the account
    // and the token hasn't expired. Lets the frontend show a "confirm your email" notice.
    const pending = user.email
      ? null
      : await this.prisma.emailVerificationToken.findFirst({
          where: { userId: id, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
          select: { email: true },
        });

    const { password, ...rest } = user;
    return {
      ...rest,
      telegramId: user.telegramId?.toString() ?? null,
      hasPassword: !!password,
      pendingEmail: pending?.email ?? null,
    };
  }
}
