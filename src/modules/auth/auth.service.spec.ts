import { createHash, createHmac } from 'node:crypto';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { TelegramAuthDto } from './dto/telegram-auth.dto';

const BOT_TOKEN = 'test-bot-token';

// Reproduces the Telegram login-widget signature so the happy path can be exercised.
function signTelegram(fields: Omit<TelegramAuthDto, 'hash' | 'timezone'>): TelegramAuthDto {
  const secretKey = createHash('sha256').update(BOT_TOKEN).digest();
  const dataCheckString = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const hashHex = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return { ...fields, hash: hashHex };
}

describe('AuthService', () => {
  let service: AuthService;
  let users: {
    findByEmail: jest.Mock;
    findOrCreateByTelegramId: jest.Mock;
    findOne: jest.Mock;
  };
  let prisma: {
    user: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    refreshToken: { deleteMany: jest.Mock; create: jest.Mock };
    emailVerificationToken: {
      deleteMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let mail: { sendEmailConfirmation: jest.Mock; sendPasswordReset: jest.Mock };

  beforeEach(async () => {
    users = { findByEmail: jest.fn(), findOrCreateByTelegramId: jest.fn(), findOne: jest.fn() };
    prisma = {
      user: { create: jest.fn(), update: jest.fn().mockResolvedValue({}), findUnique: jest.fn() },
      refreshToken: {
        deleteMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      emailVerificationToken: {
        deleteMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    mail = { sendEmailConfirmation: jest.fn(), sendPasswordReset: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('access-token') } },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => (k === 'BOT_TOKEN' ? BOT_TOKEN : undefined) },
        },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('rejects an already-registered email', async () => {
      users.findByEmail.mockResolvedValue({ id: 'u1' });
      await expect(service.register({ email: 'a@b.c', password: 'pw' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('derives the currency from the timezone and issues tokens', async () => {
      users.findByEmail.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u1' });

      const res = await service.register({
        email: 'a@b.c',
        password: 'pw',
        timezone: 'Asia/Bangkok',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'a@b.c',
            currency: 'THB',
            timezone: 'Asia/Bangkok',
          }),
        }),
      );
      // Soft verification: a confirmation email is sent, but the user is still logged in.
      expect(prisma.emailVerificationToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'u1', email: 'a@b.c', password: null }),
      });
      expect(mail.sendEmailConfirmation).toHaveBeenCalledWith('a@b.c', expect.any(String));
      expect(res).toEqual({ accessToken: 'access-token', refreshToken: expect.any(String) });
    });
  });

  describe('login', () => {
    it('rejects an unknown email', async () => {
      users.findByEmail.mockResolvedValue(null);
      await expect(service.login({ email: 'a@b.c', password: 'pw' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a wrong password', async () => {
      users.findByEmail.mockResolvedValue({ id: 'u1', password: await hash('right', 10) });
      await expect(service.login({ email: 'a@b.c', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('issues tokens on correct credentials', async () => {
      users.findByEmail.mockResolvedValue({ id: 'u1', password: await hash('right', 10) });
      const res = await service.login({ email: 'a@b.c', password: 'right' });
      expect(res).toEqual({ accessToken: 'access-token', refreshToken: expect.any(String) });
    });
  });

  describe('loginWithTelegram', () => {
    const now = () => Math.floor(Date.now() / 1000);

    it('accepts a correctly signed payload', async () => {
      users.findOrCreateByTelegramId.mockResolvedValue({ user: { id: 'u1' }, isNew: true });
      const dto = signTelegram({ id: 42, auth_date: now(), first_name: 'Ilia' });

      const res = await service.loginWithTelegram(dto);

      expect(users.findOrCreateByTelegramId).toHaveBeenCalledWith(42n, expect.any(Object));
      expect(res).toEqual({ accessToken: 'access-token', refreshToken: expect.any(String) });
    });

    it('rejects a tampered signature', async () => {
      const dto = { id: 42, auth_date: now(), hash: 'deadbeef' } as TelegramAuthDto;
      await expect(service.loginWithTelegram(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects expired auth data even if correctly signed', async () => {
      const dto = signTelegram({ id: 42, auth_date: now() - 90_000 }); // > 24h old
      await expect(service.loginWithTelegram(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('setCredentials (no email yet)', () => {
    it('stores a verification token and emails a link instead of linking the email right away', async () => {
      users.findOne.mockResolvedValue({ id: 'u1', email: null });
      users.findByEmail.mockResolvedValue(null);

      const res = await service.setCredentials('u1', { email: 'new@b.c', password: 'password1' });

      // email is NOT written to the user yet — only a pending token is created
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.emailVerificationToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          email: 'new@b.c',
          token: expect.any(String),
        }),
      });
      expect(mail.sendEmailConfirmation).toHaveBeenCalledWith('new@b.c', expect.any(String));
      expect(res).toEqual({ success: true, pendingConfirmation: true });
    });

    it('rejects when the email is already in use and sends nothing', async () => {
      users.findOne.mockResolvedValue({ id: 'u1', email: null });
      users.findByEmail.mockResolvedValue({ id: 'u2' });

      await expect(
        service.setCredentials('u1', { email: 'taken@b.c', password: 'password1' }),
      ).rejects.toThrow(ConflictException);
      expect(mail.sendEmailConfirmation).not.toHaveBeenCalled();
      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmEmail', () => {
    const validRecord = {
      id: 't1',
      userId: 'u1',
      email: 'new@b.c',
      password: 'hashed-pw',
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('writes the pending email+password onto the account and consumes the token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(validRecord);
      users.findOne.mockResolvedValue({ id: 'u1', email: null });
      users.findByEmail.mockResolvedValue(null);

      const res = await service.confirmEmail('tok');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { email: 'new@b.c', password: 'hashed-pw', emailVerified: true },
      });
      expect(prisma.emailVerificationToken.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
      expect(res).toEqual({ success: true });
    });

    it('marks the email verified for the registration flow (email already on the account)', async () => {
      // Registration flow: the email matches what's already on the user, password is null in the token.
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        ...validRecord,
        password: null,
      });
      users.findOne.mockResolvedValue({ id: 'u1', email: 'new@b.c' });

      const res = await service.confirmEmail('tok');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { emailVerified: true },
      });
      expect(prisma.emailVerificationToken.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
      expect(res).toEqual({ success: true });
    });

    it('rejects an unknown token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(null);
      await expect(service.confirmEmail('nope')).rejects.toThrow(BadRequestException);
    });

    it('rejects and deletes an expired token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        ...validRecord,
        expiresAt: new Date(Date.now() - 60_000),
      });
      await expect(service.confirmEmail('tok')).rejects.toThrow(BadRequestException);
      expect(prisma.emailVerificationToken.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when the account already has an email', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(validRecord);
      users.findOne.mockResolvedValue({ id: 'u1', email: 'existing@b.c' });
      await expect(service.confirmEmail('tok')).rejects.toThrow(ConflictException);
      expect(prisma.emailVerificationToken.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when the email was taken by someone else in the meantime', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(validRecord);
      users.findOne.mockResolvedValue({ id: 'u1', email: null });
      users.findByEmail.mockResolvedValue({ id: 'u2' });
      await expect(service.confirmEmail('tok')).rejects.toThrow(ConflictException);
      expect(prisma.emailVerificationToken.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('resendEmailConfirmation', () => {
    it('refreshes the token and re-sends the email to the pending address', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: null, emailVerified: false });
      prisma.emailVerificationToken.findFirst.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        email: 'new@b.c',
      });

      const res = await service.resendEmailConfirmation('u1');

      expect(prisma.emailVerificationToken.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: expect.objectContaining({ token: expect.any(String), expiresAt: expect.any(Date) }),
      });
      expect(mail.sendEmailConfirmation).toHaveBeenCalledWith('new@b.c', expect.any(String));
      expect(res).toEqual({ success: true });
    });

    it('rejects when the email is already confirmed', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'a@b.c', emailVerified: true });
      await expect(service.resendEmailConfirmation('u1')).rejects.toThrow(ConflictException);
      expect(mail.sendEmailConfirmation).not.toHaveBeenCalled();
    });

    it('resends for an unverified registration (email on the account, not yet confirmed)', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'a@b.c', emailVerified: false });
      prisma.emailVerificationToken.findFirst.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        email: 'a@b.c',
      });

      const res = await service.resendEmailConfirmation('u1');

      expect(mail.sendEmailConfirmation).toHaveBeenCalledWith('a@b.c', expect.any(String));
      expect(res).toEqual({ success: true });
    });

    it('rejects when there is nothing awaiting confirmation', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: null, emailVerified: false });
      prisma.emailVerificationToken.findFirst.mockResolvedValue(null);
      await expect(service.resendEmailConfirmation('u1')).rejects.toThrow(BadRequestException);
      expect(mail.sendEmailConfirmation).not.toHaveBeenCalled();
    });
  });
});
