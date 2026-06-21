import { createHash, createHmac } from 'node:crypto';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
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
  let users: { findByEmail: jest.Mock; findOrCreateByTelegramId: jest.Mock };
  let prisma: {
    user: { create: jest.Mock };
    refreshToken: { deleteMany: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    users = { findByEmail: jest.fn(), findOrCreateByTelegramId: jest.fn() };
    prisma = {
      user: { create: jest.fn() },
      refreshToken: {
        deleteMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };

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
        {
          provide: MailService,
          useValue: { sendEmailConfirmation: jest.fn(), sendPasswordReset: jest.fn() },
        },
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
});
