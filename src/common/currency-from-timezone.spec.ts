import { currencyFromTimezone } from './currency-from-timezone';

describe('currencyFromTimezone', () => {
  it('derives the currency of the timezone country', () => {
    expect(currencyFromTimezone('Asia/Bangkok')).toBe('THB');
    expect(currencyFromTimezone('Europe/Moscow')).toBe('RUB');
    expect(currencyFromTimezone('America/New_York')).toBe('USD');
    expect(currencyFromTimezone('Europe/Berlin')).toBe('EUR');
    expect(currencyFromTimezone('Asia/Tokyo')).toBe('JPY');
  });

  it('falls back to USD for an empty/unknown timezone', () => {
    expect(currencyFromTimezone()).toBe('USD');
    expect(currencyFromTimezone(undefined)).toBe('USD');
    expect(currencyFromTimezone(null)).toBe('USD');
    expect(currencyFromTimezone('')).toBe('USD');
    expect(currencyFromTimezone('Not/AZone')).toBe('USD');
  });
});
