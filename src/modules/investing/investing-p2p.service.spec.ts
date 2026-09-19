import type { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { BybitApiError, BybitClient } from './bybit.client';
import { encryptSecret } from './crypto.util';
import { InvestingP2pService, P2P_UNAVAILABLE } from './investing-p2p.service';

const KEY = 'a'.repeat(64);

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  side: 0,
  tokenId: 'USDT',
  amount: '50000',
  currencyId: 'RUB',
  price: '92.5',
  quantity: '540.54',
  fee: '0',
  targetNickName: 'CryptoSeller',
  status: 50,
  createDate: '1758000000000',
  ...over,
});

describe('InvestingP2pService', () => {
  let service: InvestingP2pService;
  let prisma: {
    exchangeAccount: { findFirst: jest.Mock };
    investingVenue: { findUnique: jest.Mock };
    investingTransfer: { findMany: jest.Mock };
  };
  let bybit: { getP2pOrders: jest.Mock };

  beforeEach(async () => {
    prisma = {
      exchangeAccount: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'acc1',
          apiKey: encryptSecret('key', KEY),
          apiSecret: encryptSecret('secret', KEY),
        }),
      },
      investingVenue: { findUnique: jest.fn().mockResolvedValue({ id: 'v1' }) },
      investingTransfer: { findMany: jest.fn().mockResolvedValue([]) },
    };
    bybit = { getP2pOrders: jest.fn().mockResolvedValue({ count: 1, items: [order()] }) };

    const module = await Test.createTestingModule({
      providers: [
        InvestingP2pService,
        { provide: PrismaService, useValue: prisma },
        { provide: BybitClient, useValue: bybit },
        { provide: ConfigService, useValue: { get: () => KEY } },
      ],
    }).compile();

    service = module.get(InvestingP2pService);
  });

  it('reads the orders with the decrypted key and shapes them for the table', async () => {
    const res = await service.list('u1', 'acc1', 2, 20);

    expect(bybit.getP2pOrders).toHaveBeenCalledWith(
      { apiKey: 'key', apiSecret: 'secret' },
      { page: 2, size: 20 },
    );
    expect(res).toEqual({
      venueId: 'v1',
      total: 1,
      items: [
        {
          id: 'o1',
          side: 'BUY',
          asset: 'USDT',
          quantity: 540.54,
          fiatAmount: 50000,
          fiatCurrency: 'RUB',
          price: 92.5,
          fee: 0,
          counterparty: 'CryptoSeller',
          status: 'DONE',
          createdAt: new Date(1758000000000),
          transferId: null,
        },
      ],
    });
  });

  it('folds Bybit statuses into the four that matter', async () => {
    bybit.getP2pOrders.mockResolvedValue({
      count: 4,
      items: [
        order({ id: 'a', status: 40, side: 1 }),
        order({ id: 'b', status: 80 }),
        order({ id: 'c', status: 30 }),
        order({ id: 'd', status: 20 }),
      ],
    });

    const { items } = await service.list('u1', 'acc1');

    expect(items.map((i) => i.status)).toEqual(['CANCELLED', 'CANCELLED', 'DISPUTE', 'ACTIVE']);
    expect(items[0].side).toBe('SELL');
  });

  it('marks the orders already recorded as a transfer', async () => {
    prisma.investingTransfer.findMany.mockResolvedValue([{ id: 't7', externalId: 'p2p:o1' }]);

    const { items } = await service.list('u1', 'acc1');

    expect(items[0].transferId).toBe('t7');
    expect(prisma.investingTransfer.findMany.mock.calls[0][0].where).toEqual({
      venueId: 'v1',
      externalId: { in: ['p2p:o1'] },
    });
  });

  it('keeps the page size within what Bybit accepts', async () => {
    await service.list('u1', 'acc1', 0, 500);

    expect(bybit.getP2pOrders.mock.calls[0][1]).toEqual({ page: 1, size: 50 });
  });

  it('turns a refusal from Bybit into a code the tab can explain', async () => {
    bybit.getP2pOrders.mockRejectedValue(new BybitApiError(10005, 'Permission denied'));

    const err = (await service.list('u1', 'acc1').catch((e) => e)) as BadRequestException;

    expect(err.getStatus()).toBe(400);
    expect(err.getResponse()).toMatchObject({ code: P2P_UNAVAILABLE, retCode: 10005 });
  });

  it("refuses someone else's account", async () => {
    prisma.exchangeAccount.findFirst.mockResolvedValue(null);

    await expect(service.list('u1', 'acc2')).rejects.toThrow(/not found/);
    expect(bybit.getP2pOrders).not.toHaveBeenCalled();
  });
});
