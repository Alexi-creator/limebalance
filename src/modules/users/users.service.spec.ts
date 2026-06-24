import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    emailVerificationToken: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      emailVerificationToken: { findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(UsersService);
  });

  describe('findOne', () => {
    it('throws NotFoundException for an unknown id', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOrCreateByTelegramId', () => {
    it('returns the existing user without creating', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      await expect(service.findOrCreateByTelegramId(42n)).resolves.toEqual({
        user: { id: 'u1' },
        isNew: false,
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates a new user and applies only the provided defaults', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u2' });

      const res = await service.findOrCreateByTelegramId(42n, { currency: 'EUR' });

      expect(prisma.user.create).toHaveBeenCalledWith({
        // timezone omitted (empty) so it doesn't overwrite the schema default
        data: {
          telegramId: 42n,
          currency: 'EUR',
          subscription: { create: { plan: { connect: { name: 'free' } } } },
        },
      });
      expect(res).toEqual({ user: { id: 'u2' }, isNew: true });
    });
  });

  describe('findOrCreateByGoogle', () => {
    it('returns the user already linked by googleId', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'g1' }); // byGoogleId
      const res = await service.findOrCreateByGoogle('gid', 'a@b.c');
      expect(res).toEqual({ user: { id: 'g1' }, isNew: false });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('links googleId to an existing account found by email', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // byGoogleId
        .mockResolvedValueOnce({ id: 'e1' }); // byEmail
      prisma.user.update.mockResolvedValue({ id: 'e1', googleId: 'gid' });

      const res = await service.findOrCreateByGoogle('gid', 'a@b.c');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { googleId: 'gid' },
      });
      expect(res).toEqual({ user: { id: 'e1', googleId: 'gid' }, isNew: false });
    });

    it('creates a fresh user when neither googleId nor email matches', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'n1' });

      const res = await service.findOrCreateByGoogle('gid', 'a@b.c', { timezone: 'Asia/Bangkok' });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'a@b.c',
          googleId: 'gid',
          timezone: 'Asia/Bangkok',
          subscription: { create: { plan: { connect: { name: 'free' } } } },
        },
      });
      expect(res.isNew).toBe(true);
    });
  });

  describe('getTimezone', () => {
    it('falls back to UTC when the user has none', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getTimezone('u1')).resolves.toBe('UTC');
    });
  });

  describe('findMe', () => {
    it('strips the password, stringifies telegramId and exposes hasPassword', async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: 'a@b.c',
        name: 'Ilia',
        telegramId: 123n,
        password: 'secret-hash',
        currency: 'EUR',
        timezone: 'Asia/Bangkok',
        subscription: null,
      });

      const me = await service.findMe('u1');

      expect(me).toEqual({
        email: 'a@b.c',
        name: 'Ilia',
        telegramId: '123',
        currency: 'EUR',
        timezone: 'Asia/Bangkok',
        subscription: null,
        hasPassword: true,
        pendingEmail: null,
      });
      expect(me).not.toHaveProperty('password');
    });

    it('reports hasPassword=false and telegramId=null when absent', async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: 'a@b.c',
        name: null,
        telegramId: null,
        password: null,
        currency: 'USD',
        timezone: 'UTC',
        subscription: null,
      });

      const me = await service.findMe('u1');
      expect(me.hasPassword).toBe(false);
      expect(me.telegramId).toBeNull();
    });

    it('exposes pendingEmail from an unconfirmed verification token when no email is set', async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: null,
        name: 'Ilia',
        telegramId: 123n,
        password: null,
        currency: 'USD',
        timezone: 'UTC',
        subscription: null,
      });
      prisma.emailVerificationToken.findFirst.mockResolvedValue({ email: 'pending@b.c' });

      const me = await service.findMe('u1');

      expect(me.email).toBeNull();
      expect(me.pendingEmail).toBe('pending@b.c');
    });

    it('does not look up a pending email when one is already set', async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: 'a@b.c',
        name: 'Ilia',
        telegramId: null,
        password: 'hash',
        currency: 'USD',
        timezone: 'UTC',
        subscription: null,
      });

      const me = await service.findMe('u1');

      expect(me.pendingEmail).toBeNull();
      expect(prisma.emailVerificationToken.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user is gone', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findMe('u1')).rejects.toThrow(NotFoundException);
    });
  });
});
