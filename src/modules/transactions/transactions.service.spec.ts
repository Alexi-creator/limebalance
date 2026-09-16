import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { FxRatesService } from '../currency/fx-rates.service';
import { ExchangesService } from '../exchanges/exchanges.service';
import { GoalsService } from '../goals/goals.service';
import { InvestingTransfersService } from '../investing/investing-transfers.service';
import { TransactionsService } from './transactions.service';

// rates[X] = units of X per 1 USD.
const RATES = { EUR: 0.9, THB: 32 };

// The date every page row in these tests carries, and the stand-in resolver built for its span.
const DAY = new Date('2026-06-15T00:00:00Z');
const RATE_AT = () => 1;

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    $queryRaw: jest.Mock;
    income: { groupBy: jest.Mock };
    expense: { groupBy: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let fx: { resolverFor: jest.Mock };
  let currency: {
    getRates: jest.Mock;
    historicalTotalInBase: jest.Mock;
    usdToBase: jest.Mock;
    convertWithRates: jest.Mock;
  };
  let goals: { reservedRows: jest.Mock };
  let exchanges: { movementsByCurrency: jest.Mock };
  let investingTransfers: { transferRows: jest.Mock; totalValueUsd: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
      income: { groupBy: jest.fn() },
      expense: { groupBy: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ currency: 'USD' }) },
    };
    fx = { resolverFor: jest.fn().mockResolvedValue(RATE_AT) };
    currency = {
      getRates: jest.fn().mockResolvedValue(RATES),
      historicalTotalInBase: jest.fn(),
      usdToBase: jest.fn(),
      // The real pure implementation: the balance is arithmetic, and mocking it away is exactly
      // what let the old rounding bug hide.
      convertWithRates: jest.fn((rates, amount, from, to) =>
        from === to
          ? amount
          : (amount / (from === 'USD' ? 1 : rates[from])) * (to === 'USD' ? 1 : rates[to]),
      ),
    };
    goals = { reservedRows: jest.fn().mockResolvedValue([]) };
    exchanges = { movementsByCurrency: jest.fn().mockResolvedValue([]) };
    investingTransfers = {
      transferRows: jest.fn().mockResolvedValue([]),
      totalValueUsd: jest.fn().mockResolvedValue(0),
    };

    const module = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CurrencyService, useValue: currency },
        { provide: FxRatesService, useValue: fx },
        { provide: GoalsService, useValue: goals },
        { provide: ExchangesService, useValue: exchanges },
        { provide: InvestingTransfersService, useValue: investingTransfers },
      ],
    }).compile();

    service = module.get(TransactionsService);
  });

  describe('findAll', () => {
    it('paginates and summarizes income/expense/net over the current page (items)', async () => {
      // Raw queries, in call order: items, count.
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { id: 'i1', type: 'income', currency: 'USD', amount: 200, amountUsd: 200, date: DAY },
          { id: 'e1', type: 'expense', currency: 'USD', amount: 50, amountUsd: 50, date: DAY },
        ])
        .mockResolvedValueOnce([{ count: 12n }]);
      // historicalTotalInBase order: income first, then expense.
      currency.historicalTotalInBase.mockReturnValueOnce(200).mockReturnValueOnce(50);

      const res = await service.findAll('u1', { page: 2, limit: 5 });

      expect(res.total).toBe(12);
      expect(res.page).toBe(2);
      expect(res.limit).toBe(5);
      expect(res.totalPages).toBe(3); // ceil(12 / 5)
      expect(res.summary).toEqual({ baseCurrency: 'USD', income: 200, expense: 50, net: 150 });
      // The summary is derived from the page rows, split by type.
      expect(currency.historicalTotalInBase).toHaveBeenNthCalledWith(
        1,
        [{ id: 'i1', type: 'income', currency: 'USD', amount: 200, amountUsd: 200, date: DAY }],
        'USD',
        RATE_AT,
      );
      expect(currency.historicalTotalInBase).toHaveBeenNthCalledWith(
        2,
        [{ id: 'e1', type: 'expense', currency: 'USD', amount: 50, amountUsd: 50, date: DAY }],
        'USD',
        RATE_AT,
      );
      // amountUsd is internal and must not leak into the response items.
      expect(res.items).toEqual([
        { id: 'i1', type: 'income', currency: 'USD', amount: 200, date: DAY },
        { id: 'e1', type: 'expense', currency: 'USD', amount: 50, date: DAY },
      ]);
    });

    it('reports net=null when a total could not be computed (rates unavailable)', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0n }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      currency.historicalTotalInBase.mockReturnValueOnce(null).mockReturnValueOnce(50);

      const res = await service.findAll('u1', {});

      expect(res.summary.net).toBeNull();
      expect(res.page).toBe(1);
      expect(res.limit).toBe(20);
    });
  });

  describe('getBalance', () => {
    const groups = (rows: [string, number][]) =>
      rows.map(([currency, amount]) => ({ currency, _sum: { amount } }));

    it('sums each currency exactly and converts only what is held in another one', async () => {
      prisma.income.groupBy.mockResolvedValue(
        groups([
          ['THB', 1_000_000],
          ['USD', 500],
        ]),
      );
      prisma.expense.groupBy.mockResolvedValue(groups([['THB', 950_000]]));
      prisma.user.findUnique.mockResolvedValue({ currency: 'THB' });

      const res = await service.getBalance('u1');

      // THB rows are summed as THB, never routed through USD and back.
      expect(res.byCurrency).toEqual([
        { currency: 'THB', amount: 50_000 },
        { currency: 'USD', amount: 500 },
      ]);
      // 50 000 THB exactly + 500 USD at 32.
      expect(res.balance).toBe(66_000);
      expect(res.isApproximate).toBe(true);
    });

    it('is exact and rate-independent for a single-currency ledger', async () => {
      // The regression this rewrite exists for: with everything in THB, the old code converted
      // each row to USD at its own historical rate and the net back at today's rate, so a rate
      // move turned +5 000 THB into a different number entirely.
      prisma.income.groupBy.mockResolvedValue(groups([['THB', 1_000_000]]));
      prisma.expense.groupBy.mockResolvedValue(groups([['THB', 995_000]]));
      prisma.user.findUnique.mockResolvedValue({ currency: 'THB' });
      currency.getRates.mockResolvedValue(null); // rates API down — must not matter

      const res = await service.getBalance('u1');

      expect(res.balance).toBe(5_000);
      expect(res.byCurrency).toEqual([{ currency: 'THB', amount: 5_000 }]);
      expect(res.isApproximate).toBe(false);
      // Nothing needed converting, so nothing was converted.
      expect(currency.convertWithRates).not.toHaveBeenCalled();
    });

    it('never applies a conversion spread to money that was never converted', async () => {
      prisma.income.groupBy.mockResolvedValue(groups([['THB', 300_000]]));
      prisma.expense.groupBy.mockResolvedValue(groups([['THB', 250_000]]));
      prisma.user.findUnique.mockResolvedValue({ currency: 'THB' });

      const res = await service.getBalance('u1');

      // 50 000 exactly — not 50 000 minus 2% of the 550 000 turnover.
      expect(res.balance).toBe(50_000);
    });

    it('cancels an expense against an income in the same non-base currency', async () => {
      // The suspicion this test exists for: that spending in a currency other than the base one
      // never reaches the balance. It does — the two rows meet inside their own bucket, and a
      // bucket that nets to zero leaves byCurrency entirely.
      prisma.income.groupBy.mockResolvedValue(
        groups([
          ['THB', 15_516],
          ['RUB', 12_840],
        ]),
      );
      prisma.expense.groupBy.mockResolvedValue(groups([['RUB', 12_840]]));
      prisma.user.findUnique.mockResolvedValue({ currency: 'THB' });
      currency.getRates.mockResolvedValue({ ...RATES, RUB: 80 });

      const res = await service.getBalance('u1');

      expect(res.byCurrency).toEqual([{ currency: 'THB', amount: 15_516 }]);
      expect(res.balance).toBe(15_516);
    });

    it('leaves only what income in a foreign currency outlived its expenses and exchanges', async () => {
      // Real figures from a user whose RUB balance would not go away: the leftover is what the
      // exchanges did not carry off, not an expense that failed to land.
      prisma.income.groupBy.mockResolvedValue(
        groups([
          ['THB', 15_516],
          ['RUB', 1_494_884],
        ]),
      );
      prisma.expense.groupBy.mockResolvedValue(groups([['RUB', 51_740]]));
      prisma.user.findUnique.mockResolvedValue({ currency: 'THB' });
      currency.getRates.mockResolvedValue({ ...RATES, RUB: 80 });
      exchanges.movementsByCurrency.mockResolvedValue([{ currency: 'RUB', amount: -1_430_304 }]);

      const res = await service.getBalance('u1');

      expect(res.byCurrency).toEqual([
        { currency: 'THB', amount: 15_516 },
        { currency: 'RUB', amount: 12_840 },
      ]);
    });

    it('subtracts goal reserves from the free balance of their own currency', async () => {
      prisma.income.groupBy.mockResolvedValue(groups([['THB', 100_000]]));
      prisma.expense.groupBy.mockResolvedValue(groups([['THB', 20_000]]));
      prisma.user.findUnique.mockResolvedValue({ currency: 'THB' });
      goals.reservedRows.mockResolvedValue([{ currency: 'THB', amount: 30_000, amountUsd: null }]);

      const res = await service.getBalance('u1');

      expect(res.balance).toBe(50_000);
      expect(res.byCurrency).toEqual([{ currency: 'THB', amount: 50_000 }]);
      expect(res.inGoals).toBe(30_000);
    });

    it('takes money sent to an exchange out of the free balance, at what was sent', async () => {
      prisma.income.groupBy.mockResolvedValue(groups([['THB', 100_000]]));
      prisma.expense.groupBy.mockResolvedValue(groups([['THB', 20_000]]));
      prisma.user.findUnique.mockResolvedValue({ currency: 'THB' });
      investingTransfers.transferRows.mockResolvedValue([{ currency: 'THB', amount: 30_000 }]);
      investingTransfers.totalValueUsd.mockResolvedValue(1_000);

      const res = await service.getBalance('u1');

      expect(res.balance).toBe(50_000);
      // Reported at what the venues are worth today (1 000 USD at 32 THB), not at what was sent.
      expect(res.inExchanges).toBe(32_000);
    });

    it('reports what the venues are worth, not what was put in', async () => {
      prisma.income.groupBy.mockResolvedValue(groups([['USD', 5_000]]));
      prisma.expense.groupBy.mockResolvedValue(groups([['USD', 0]]));
      prisma.user.findUnique.mockResolvedValue({ currency: 'USD' });
      investingTransfers.transferRows.mockResolvedValue([{ currency: 'USD', amount: 1_000 }]);
      // 1 000 went out, 200 of it was paid to someone else and will never come back.
      investingTransfers.totalValueUsd.mockResolvedValue(800);

      const res = await service.getBalance('u1');

      expect(res.balance).toBe(4_000);
      // Net worth reads 4 800, which is the truth — counting the sent 1 000 would hide the loss.
      expect(res.inExchanges).toBe(800);
    });

    it('hands trading profit back to the balance without booking an income', async () => {
      prisma.income.groupBy.mockResolvedValue(groups([['THB', 100_000]]));
      prisma.expense.groupBy.mockResolvedValue(groups([['THB', 20_000]]));
      prisma.user.findUnique.mockResolvedValue({ currency: 'THB' });
      // Sent 30 000 to the exchange, brought 40 000 back: net sent out is negative.
      investingTransfers.transferRows.mockResolvedValue([{ currency: 'THB', amount: -10_000 }]);

      const res = await service.getBalance('u1');

      // 80 000 net ledger + the 10 000 that came back beyond what was ever sent.
      expect(res.balance).toBe(90_000);
      // Everything was withdrawn, so there is nothing left out there — the gain lives in the
      // balance now, and no income row was ever written for it.
      expect(res.inExchanges).toBe(0);
    });

    it('converts the base-currency total into USD, rather than aggregating twice', async () => {
      prisma.income.groupBy.mockResolvedValue(groups([['EUR', 200]]));
      prisma.expense.groupBy.mockResolvedValue(groups([['EUR', 50]]));
      prisma.user.findUnique.mockResolvedValue({ currency: 'EUR' });

      const res = await service.getBalance('u1');

      expect(res.balance).toBe(150);
      expect(res.balanceUsd).toBe(166.67); // 150 / 0.9
    });

    it('skips conversion entirely when the base currency already is USD', async () => {
      prisma.income.groupBy.mockResolvedValue(groups([['USD', 200]]));
      prisma.expense.groupBy.mockResolvedValue(groups([['USD', 50]]));
      prisma.user.findUnique.mockResolvedValue({ currency: 'USD' });

      const res = await service.getBalance('u1');

      expect(res).toMatchObject({ baseCurrency: 'USD', balance: 150, balanceUsd: 150 });
      expect(currency.convertWithRates).not.toHaveBeenCalled();
    });

    it('reports null instead of a guess when a foreign holding cannot be converted', async () => {
      prisma.income.groupBy.mockResolvedValue(
        groups([
          ['THB', 100_000],
          ['USD', 500],
        ]),
      );
      prisma.expense.groupBy.mockResolvedValue(groups([['THB', 20_000]]));
      prisma.user.findUnique.mockResolvedValue({ currency: 'THB' });
      currency.getRates.mockResolvedValue(null);

      const res = await service.getBalance('u1');

      expect(res.balance).toBeNull();
      expect(res.balanceUsd).toBeNull();
      // The exact per-currency figures still stand — they never needed a rate.
      expect(res.byCurrency).toEqual([
        { currency: 'THB', amount: 80_000 },
        { currency: 'USD', amount: 500 },
      ]);
    });

    it('moves money between currencies on a recorded exchange, with no rate of ours', async () => {
      prisma.income.groupBy.mockResolvedValue(groups([['THB', 100_000]]));
      prisma.expense.groupBy.mockResolvedValue(groups([['THB', 20_000]]));
      prisma.user.findUnique.mockResolvedValue({ currency: 'THB' });
      // Handed over 100 USD, got 3 180 THB at the counter.
      exchanges.movementsByCurrency.mockResolvedValue([
        { currency: 'USD', amount: -100 },
        { currency: 'THB', amount: 3_180 },
      ]);

      const res = await service.getBalance('u1');

      // The USD side is spent down to -100 (money the user no longer holds), THB is up by exactly
      // what was received — not by 100 x today's rate.
      expect(res.byCurrency).toEqual([
        { currency: 'THB', amount: 83_180 },
        { currency: 'USD', amount: -100 },
      ]);
    });

    it('always lists the base currency, even at zero', async () => {
      prisma.income.groupBy.mockResolvedValue([]);
      prisma.expense.groupBy.mockResolvedValue([]);
      prisma.user.findUnique.mockResolvedValue({ currency: 'THB' });

      const res = await service.getBalance('u1');

      expect(res.byCurrency).toEqual([{ currency: 'THB', amount: 0 }]);
      expect(res.balance).toBe(0);
      expect(res.isApproximate).toBe(false);
    });
  });
});
