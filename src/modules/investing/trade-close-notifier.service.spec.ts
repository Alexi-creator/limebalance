import { Test } from '@nestjs/testing';
import type { Position } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { BotService } from '../../bot/bot.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TradeCloseNotifierService } from './trade-close-notifier.service';

const P2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
  code: 'P2002',
  clientVersion: '0',
});

const makePosition = (over: Partial<Position> = {}): Position =>
  ({
    id: 'pos-1',
    accountId: 'acc-1',
    userId: 'u1',
    source: 'bybit',
    status: 'CLOSED',
    orderId: 'o1',
    symbol: 'BTCUSDT',
    category: 'linear',
    side: 'Sell', // closes a long
    qty: '1' as unknown as Position['qty'],
    avgEntryPrice: '100' as unknown as Position['avgEntryPrice'],
    avgExitPrice: '150' as unknown as Position['avgExitPrice'],
    closedPnl: '50' as unknown as Position['closedPnl'],
    leverage: '2' as unknown as Position['leverage'],
    openedAt: new Date('2026-06-01T00:00:00Z'),
    closedAt: new Date('2026-06-04T00:00:00Z'),
    raw: null,
    createdAt: new Date(),
    ...over,
  }) as Position;

describe('TradeCloseNotifierService', () => {
  let service: TradeCloseNotifierService;
  let prisma: {
    position: { findMany: jest.Mock };
    notification: { create: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let subscriptions: { hasInvestingAccess: jest.Mock };
  let notifications: { isBotPushEnabled: jest.Mock };
  let bot: { pushMessage: jest.Mock };

  beforeEach(async () => {
    prisma = {
      position: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { create: jest.fn().mockResolvedValue({}) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ telegramId: 42n, languageCode: 'en' }),
      },
    };
    subscriptions = { hasInvestingAccess: jest.fn().mockResolvedValue(true) };
    notifications = { isBotPushEnabled: jest.fn().mockResolvedValue(true) };
    bot = { pushMessage: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        TradeCloseNotifierService,
        { provide: PrismaService, useValue: prisma },
        { provide: SubscriptionsService, useValue: subscriptions },
        { provide: NotificationsService, useValue: notifications },
        { provide: BotService, useValue: bot },
      ],
    }).compile();

    service = module.get(TradeCloseNotifierService);
  });

  it('skips users without investing access — no bell entry, no push', async () => {
    subscriptions.hasInvestingAccess.mockResolvedValue(false);
    prisma.position.findMany.mockResolvedValue([makePosition()]);

    await service.notifyNewlyClosed('acc-1', new Date(0));

    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(bot.pushMessage).not.toHaveBeenCalled();
  });

  it('computes ROI against the margin actually committed (notional / leverage)', async () => {
    prisma.position.findMany.mockResolvedValue([makePosition()]);

    await service.notifyNewlyClosed('acc-1', new Date(0));

    // notional = 1 * 100 = 100, margin = 100 / 2 = 50, pnl = 50 → ROI = +100.0%
    expect(bot.pushMessage).toHaveBeenCalledWith(42n, expect.stringContaining('+100.0%'));
    expect(bot.pushMessage.mock.calls[0][1]).toContain('+50.00 USDT');
  });

  it('labels a long correctly from the closing-order side convention (Sell closes a long)', async () => {
    prisma.position.findMany.mockResolvedValue([makePosition({ side: 'Sell' })]);
    await service.notifyNewlyClosed('acc-1', new Date(0));
    expect(bot.pushMessage.mock.calls[0][1]).toContain('Long');
  });

  it('labels a short correctly (Buy closes a short)', async () => {
    prisma.position.findMany.mockResolvedValue([makePosition({ side: 'Buy' })]);
    await service.notifyNewlyClosed('acc-1', new Date(0));
    expect(bot.pushMessage.mock.calls[0][1]).toContain('Short');
  });

  it('skips the push (but not the bell) when the user disabled trade_closed pushes', async () => {
    notifications.isBotPushEnabled.mockResolvedValue(false);
    prisma.position.findMany.mockResolvedValue([makePosition()]);

    await service.notifyNewlyClosed('acc-1', new Date(0));

    expect(prisma.notification.create).toHaveBeenCalled();
    expect(bot.pushMessage).not.toHaveBeenCalled();
  });

  it('does not push twice for the same position (P2002 on the dedupe key)', async () => {
    prisma.notification.create.mockRejectedValue(P2002);
    prisma.position.findMany.mockResolvedValue([makePosition()]);

    await service.notifyNewlyClosed('acc-1', new Date(0));

    expect(bot.pushMessage).not.toHaveBeenCalled();
  });

  it('only considers exchange-synced positions closed after the given time', async () => {
    await service.notifyNewlyClosed('acc-1', new Date('2026-01-01T00:00:00Z'));

    expect(prisma.position.findMany).toHaveBeenCalledWith({
      where: {
        accountId: 'acc-1',
        source: 'bybit',
        status: 'CLOSED',
        closedAt: { gt: new Date('2026-01-01T00:00:00Z') },
      },
    });
  });
});
