import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { StateService } from './state.service';

describe('StateService', () => {
  let service: StateService;
  let prisma: { userState: { findUnique: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      userState: { findUnique: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [StateService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(StateService);
  });

  describe('getStep', () => {
    it('returns the stored step', async () => {
      prisma.userState.findUnique.mockResolvedValue({ step: 'addexpense:waiting_amount' });
      await expect(service.getStep('u1')).resolves.toBe('addexpense:waiting_amount');
    });

    it('falls back to idle when there is no state', async () => {
      prisma.userState.findUnique.mockResolvedValue(null);
      await expect(service.getStep('u1')).resolves.toBe('idle');
    });
  });

  describe('set', () => {
    it('upserts the state, keyed by userId', async () => {
      await service.set('u1', { step: 'addincome:waiting_amount', amount: 10 });
      expect(prisma.userState.upsert).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        create: { userId: 'u1', step: 'addincome:waiting_amount', amount: 10 },
        update: { step: 'addincome:waiting_amount', amount: 10 },
      });
    });
  });

  describe('reset', () => {
    it('deletes the state row', async () => {
      await service.reset('u1');
      expect(prisma.userState.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    });
  });
});
