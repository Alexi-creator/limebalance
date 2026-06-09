import { currencyFromTimezone } from './currency-from-timezone';

describe('currencyFromTimezone', () => {
  it('выводит валюту страны таймзоны', () => {
    expect(currencyFromTimezone('Asia/Bangkok')).toBe('THB');
    expect(currencyFromTimezone('Europe/Moscow')).toBe('RUB');
    expect(currencyFromTimezone('America/New_York')).toBe('USD');
    expect(currencyFromTimezone('Europe/Berlin')).toBe('EUR');
    expect(currencyFromTimezone('Asia/Tokyo')).toBe('JPY');
  });

  it('USD-фолбэк для пустой/неизвестной таймзоны', () => {
    expect(currencyFromTimezone()).toBe('USD');
    expect(currencyFromTimezone(undefined)).toBe('USD');
    expect(currencyFromTimezone(null)).toBe('USD');
    expect(currencyFromTimezone('')).toBe('USD');
    expect(currencyFromTimezone('Not/AZone')).toBe('USD');
  });
});
