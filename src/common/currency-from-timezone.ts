import { getTimezone } from 'countries-and-timezones';
import { COUNTRY_CURRENCY } from './country-currency';

// Default currency from an IANA timezone: tz -> country -> currency. USD if it can't be determined.
// Used only as a default hint at registration time (the field is editable in the profile).
export function currencyFromTimezone(timezone?: string | null): string {
  if (!timezone) return 'USD';
  // countries-and-timezones may return several countries for a zone — take the primary (first) one.
  const country = getTimezone(timezone)?.countries?.[0];
  if (!country) return 'USD';
  return COUNTRY_CURRENCY[country] ?? 'USD';
}
