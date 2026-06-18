import { CurrencyService } from './currency.service';

// rates[X] = units of X per 1 USD.
const RATES = { EUR: 0.9, THB: 35 };

// The fx spread is read from env at construction time, so build instances with an explicit spread.
const makeService = (spread?: string) => {
  const prev = process.env.FX_SPREAD;
  if (spread === undefined) delete process.env.FX_SPREAD;
  else process.env.FX_SPREAD = spread;
  const service = new CurrencyService();
  if (prev === undefined) delete process.env.FX_SPREAD;
  else process.env.FX_SPREAD = prev;
  return service;
};

describe('CurrencyService', () => {
  describe('convertWithRates', () => {
    const service = makeService('0');

    it('returns the amount unchanged for the same currency', () => {
      expect(service.convertWithRates(RATES, 100, 'EUR', 'EUR')).toBe(100);
    });

    it('converts to and from the USD base', () => {
      expect(service.convertWithRates(RATES, 100, 'USD', 'EUR')).toBe(90);
      expect(service.convertWithRates(RATES, 90, 'EUR', 'USD')).toBe(100);
    });

    it('converts between two non-base currencies via USD', () => {
      // 35 THB = 1 USD = 0.9 EUR
      expect(service.convertWithRates(RATES, 35, 'THB', 'EUR')).toBeCloseTo(0.9);
    });

    it('returns null for an unknown currency', () => {
      expect(service.convertWithRates(RATES, 1, 'XXX', 'USD')).toBeNull();
      expect(service.convertWithRates(RATES, 1, 'USD', 'XXX')).toBeNull();
    });
  });

  describe('convert', () => {
    it('short-circuits same-currency without fetching rates', async () => {
      const service = makeService('0');
      const spy = jest.spyOn(service, 'getRates');
      await expect(service.convert(100, 'USD', 'USD')).resolves.toBe(100);
      expect(spy).not.toHaveBeenCalled();
    });

    it('uses the fetched rates for a real conversion', async () => {
      const service = makeService('0');
      jest.spyOn(service, 'getRates').mockResolvedValue(RATES);
      await expect(service.convert(100, 'USD', 'EUR')).resolves.toBe(90);
    });

    it('returns null when rates are unavailable', async () => {
      const service = makeService('0');
      jest.spyOn(service, 'getRates').mockResolvedValue(null);
      await expect(service.convert(100, 'USD', 'EUR')).resolves.toBeNull();
    });
  });

  describe('sumUsd', () => {
    const service = makeService('0');

    it('returns 0 for no rows (without needing rates)', () => {
      expect(service.sumUsd([], null)).toBe(0);
    });

    it('uses the amountUsd snapshot when present, else the current rate', () => {
      const rows = [
        { amount: 100, currency: 'USD', amountUsd: 100 },
        { amount: 90, currency: 'EUR', amountUsd: null }, // no snapshot → convert 90 EUR = 100 USD
      ];
      expect(service.sumUsd(rows, RATES)).toBe(200);
    });

    it('returns null when a snapshotless row needs unavailable rates', () => {
      const rows = [{ amount: 90, currency: 'EUR', amountUsd: null }];
      expect(service.sumUsd(rows, null)).toBeNull();
    });
  });

  describe('usdToBase', () => {
    const service = makeService('0');

    it('converts USD into the base currency and rounds to 2 decimals', () => {
      expect(service.usdToBase(100, 'EUR', RATES)).toBe(90);
    });

    it('returns null without rates', () => {
      expect(service.usdToBase(100, 'EUR', null)).toBeNull();
    });
  });

  describe('approxTotalInBase', () => {
    it('takes base-currency rows as-is, no rates needed', () => {
      const service = makeService('0');
      const rows = [{ amount: 50, currency: 'EUR', amountUsd: null }];
      expect(service.approxTotalInBase(rows, 'EUR', null, 'expense')).toBe(50);
    });

    it('converts cross-currency rows via the USD snapshot', () => {
      const service = makeService('0');
      const rows = [{ amount: 90, currency: 'EUR', amountUsd: 95 }];
      // snapshot 95 USD, base USD → 95
      expect(service.approxTotalInBase(rows, 'USD', RATES, 'none')).toBe(95);
    });

    it('applies the spread directionally on cross-currency rows', () => {
      const service = makeService('0.1'); // 10% spread for an obvious assertion
      const rows = [{ amount: 90, currency: 'EUR', amountUsd: 100 }];
      // expense costs more: 100 * 1.1
      expect(service.approxTotalInBase(rows, 'USD', RATES, 'expense')).toBe(110);
      // income received less: 100 * 0.9
      expect(service.approxTotalInBase(rows, 'USD', RATES, 'income')).toBe(90);
    });

    it('does NOT apply the spread to base-currency rows', () => {
      const service = makeService('0.1');
      const rows = [{ amount: 50, currency: 'USD', amountUsd: null }];
      expect(service.approxTotalInBase(rows, 'USD', RATES, 'expense')).toBe(50);
    });

    it('returns null when a cross-currency row without a snapshot needs missing rates', () => {
      const service = makeService('0');
      const rows = [{ amount: 90, currency: 'EUR', amountUsd: null }];
      expect(service.approxTotalInBase(rows, 'USD', null, 'expense')).toBeNull();
    });
  });
});
