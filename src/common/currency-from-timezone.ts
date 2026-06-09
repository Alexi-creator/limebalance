import { getTimezone } from 'countries-and-timezones';
import { COUNTRY_CURRENCY } from './country-currency';

// Дефолтная валюта по IANA-таймзоне: tz -> страна -> валюта. USD, если не удалось определить.
// Используется только для подсказки дефолта при регистрации (поле редактируется в профиле).
export function currencyFromTimezone(timezone?: string | null): string {
  if (!timezone) return 'USD';
  // countries-and-timezones может вернуть несколько стран для зоны — берём основную (первую).
  const country = getTimezone(timezone)?.countries?.[0];
  if (!country) return 'USD';
  return COUNTRY_CURRENCY[country] ?? 'USD';
}
