import { createHash, createHmac, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { currencyFromTimezone } from '../../common/currency-from-timezone';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { EMAIL_VERIFICATION_TTL_MS, REFRESH_TOKEN_TTL_DAYS } from './auth.constants';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SetCredentialsDto } from './dto/set-credentials.dto';
import { TelegramAuthDto } from './dto/telegram-auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await hash(dto.password, 10);
    // Currency: an explicit one from the DTO takes priority, otherwise derive from the timezone, otherwise the schema default USD.
    const currency = dto.currency ?? currencyFromTimezone(dto.timezone);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: passwordHash,
        currency,
        ...(dto.timezone ? { timezone: dto.timezone } : {}),
      },
    });

    return this.issueTokens(user.id);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user?.password) throw new UnauthorizedException('Invalid credentials');

    const valid = await compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens(user.id);
  }

  async refresh(refreshToken: string) {
    const record = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!record || record.expiresAt < new Date()) {
      if (record) await this.prisma.refreshToken.delete({ where: { id: record.id } });
      throw new UnauthorizedException('Refresh token expired or invalid');
    }

    await this.prisma.refreshToken.deleteMany({ where: { id: record.id } });
    return this.issueTokens(record.userId);
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }

  async loginWithGoogle(dto: GoogleAuthDto) {
    const { email, googleId } = await this.verifyGoogleToken(dto.credential);
    // timezone — a hint from the browser; applied only when creating a new user.
    const defaults = { currency: currencyFromTimezone(dto.timezone), timezone: dto.timezone };
    const { user } = await this.usersService.findOrCreateByGoogle(googleId, email, defaults);
    return this.issueTokens(user.id);
  }

  async loginWithTelegram(dto: TelegramAuthDto) {
    this.verifyTelegramHash(dto);
    // timezone — an unsigned hint from the browser; applied only on creation.
    const defaults = { currency: currencyFromTimezone(dto.timezone), timezone: dto.timezone };
    const { user } = await this.usersService.findOrCreateByTelegramId(BigInt(dto.id), defaults);
    return this.issueTokens(user.id);
  }

  async linkGoogle(userId: string, dto: GoogleAuthDto) {
    const { email, googleId } = await this.verifyGoogleToken(dto.credential);

    const byGoogleId = await this.usersService.findByGoogleId(googleId);
    if (byGoogleId && byGoogleId.id !== userId) {
      throw new ConflictException('Google account already linked to another account');
    }

    const byEmail = await this.usersService.findByEmail(email);
    if (byEmail && byEmail.id !== userId) {
      throw new ConflictException('Email already linked to another account');
    }

    await this.usersService.setEmail(userId, email);
    await this.usersService.setGoogleId(userId, googleId);
    return { success: true };
  }

  async linkTelegram(userId: string, dto: TelegramAuthDto) {
    this.verifyTelegramHash(dto);
    const existing = await this.usersService.findByTelegramId(BigInt(dto.id));
    if (existing && existing.id !== userId) {
      throw new ConflictException('Telegram account already linked to another user');
    }
    await this.usersService.setTelegramId(userId, BigInt(dto.id));
    return { success: true };
  }

  // Email and password in a single route:
  // - no email yet (e.g. registered via Telegram) → email and password are required together,
  //   but not linked right away: a confirmation link is sent to the email (see confirmEmail);
  // - email already set → it cannot be changed, the password can be changed (optional).
  async setCredentials(userId: string, dto: SetCredentialsDto) {
    const user = await this.usersService.findOne(userId);

    if (user.email) {
      if (dto.email && dto.email !== user.email) {
        throw new ForbiddenException('Email is already set and cannot be changed');
      }
      if (dto.password) {
        const record = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { password: true },
        });
        // If a password is already set — require the current one and verify it.
        if (record?.password) {
          if (!dto.currentPassword) {
            throw new BadRequestException('The current password is required');
          }
          const valid = await compare(dto.currentPassword, record.password);
          if (!valid) {
            throw new UnauthorizedException('Incorrect current password');
          }
        }
        const passwordHash = await hash(dto.password, 10);
        await this.prisma.user.update({
          where: { id: userId },
          data: { password: passwordHash },
        });
      }
      return { success: true };
    }

    // No email yet — set email and password together, both required.
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Both email and password are required');
    }

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already in use');
    }

    // Don't link right away: store the email and the (already hashed) password in a temporary token
    // and email a link. The email appears on the account only after it's followed.
    await this.prisma.emailVerificationToken.deleteMany({ where: { userId } });

    const passwordHash = await hash(dto.password, 10);
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
    await this.prisma.emailVerificationToken.create({
      data: { userId, email: dto.email, password: passwordHash, token, expiresAt },
    });

    await this.mail.sendEmailConfirmation(dto.email, token);
    return { success: true, pendingConfirmation: true };
  }

  // Following the link from the email: pull the pending email+password from the token and write them onto the account.
  async confirmEmail(token: string) {
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { token } });

    if (!record || record.expiresAt < new Date()) {
      if (record) await this.prisma.emailVerificationToken.delete({ where: { id: record.id } });
      throw new BadRequestException('The confirmation link is invalid or expired');
    }

    const user = await this.usersService.findOne(record.userId);
    if (user.email) {
      // Email already linked (e.g. another one was confirmed in the meantime) — the token is no longer needed.
      await this.prisma.emailVerificationToken.delete({ where: { id: record.id } });
      throw new ConflictException('The account already has an email');
    }

    // While the email was awaiting confirmation, this address could have been taken by someone else.
    const existing = await this.usersService.findByEmail(record.email);
    if (existing) {
      await this.prisma.emailVerificationToken.delete({ where: { id: record.id } });
      throw new ConflictException('Email is already in use');
    }

    await this.prisma.user.update({
      where: { id: record.userId },
      data: { email: record.email, password: record.password },
    });
    await this.prisma.emailVerificationToken.delete({ where: { id: record.id } });

    return { success: true };
  }

  // Resend the confirmation link, reusing the email+password already stored in the pending token.
  // Refreshes the token string and its expiry so the previous link is invalidated.
  async resendEmailConfirmation(userId: string) {
    const user = await this.usersService.findOne(userId);
    if (user.email) {
      throw new ConflictException('The account already has an email');
    }

    const record = await this.prisma.emailVerificationToken.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      throw new BadRequestException('No email is awaiting confirmation');
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
    await this.prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { token, expiresAt },
    });

    await this.mail.sendEmailConfirmation(record.email, token);
    return { success: true };
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) return { success: true }; // don't reveal that the email doesn't exist

    await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await this.prisma.passwordResetToken.create({ data: { userId: user.id, token, expiresAt } });

    await this.mail.sendPasswordReset(email, token);
    return { success: true };
  }

  async resetPassword(token: string, password: string) {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { token } });

    if (!record || record.expiresAt < new Date()) {
      if (record) await this.prisma.passwordResetToken.delete({ where: { id: record.id } });
      throw new BadRequestException('Token is invalid or expired');
    }

    const passwordHash = await hash(password, 10);
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { password: passwordHash },
    });
    await this.prisma.passwordResetToken.delete({ where: { id: record.id } });

    return { success: true };
  }

  async issueTokens(userId: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });

    const accessToken = this.jwtService.sign({ sub: userId });

    const token = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

    await this.prisma.refreshToken.create({ data: { userId, token, expiresAt } });

    return { accessToken, refreshToken: token };
  }

  private async verifyGoogleToken(
    credential: string,
  ): Promise<{ email: string; googleId: string }> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      this.logger.error('GOOGLE_CLIENT_ID is not set — Google login disabled');
      throw new UnauthorizedException('Google OAuth not configured');
    }

    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!response.ok) {
      this.logger.warn(`Google tokeninfo request failed: HTTP ${response.status}`);
      throw new UnauthorizedException('Invalid Google token');
    }

    const data = (await response.json()) as {
      aud?: string;
      sub?: string;
      email?: string;
      email_verified?: string;
    };

    if (data.aud !== clientId) {
      this.logger.warn(`Google token audience mismatch: aud=${data.aud} expected=${clientId}`);
      throw new UnauthorizedException('Token audience mismatch');
    }
    if (!data.sub) throw new UnauthorizedException('Invalid Google token');
    if (!data.email || data.email_verified !== 'true') {
      this.logger.warn(`Google email not verified: email=${data.email}`);
      throw new UnauthorizedException('Email not verified');
    }

    return { email: data.email, googleId: data.sub };
  }

  private verifyTelegramHash(dto: TelegramAuthDto) {
    // timezone — our browser-added field, not part of the signed Telegram data: exclude it from the check.
    const { hash: telegramHash, timezone: _tz, ...fields } = dto;
    const botToken = this.config.get<string>('BOT_TOKEN') ?? '';

    const secretKey = createHash('sha256').update(botToken).digest();
    const dataCheckString = Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (telegramHash !== expectedHash)
      throw new UnauthorizedException('Invalid Telegram signature');

    if (Date.now() / 1000 - dto.auth_date > 86400) {
      throw new UnauthorizedException('Telegram auth data expired');
    }
  }
}
