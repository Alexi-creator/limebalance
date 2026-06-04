/**
 * Returns a Date whose UTC components equal the current wall-clock time in `timeZone`.
 *
 * The app stores dates as naive local wall-clock (column is `timestamp without time zone`,
 * Prisma persists the Date's UTC parts). The frontend sends naive local datetimes; for the
 * Telegram bot — which runs on the backend in UTC — we reconstruct the user's local wall-clock
 * here so bot-created records match the same convention and never shift.
 */
export function localWallClockNow(timeZone: string): Date {
  const now = new Date();
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(now);
  } catch {
    return now; // invalid timezone → fall back to UTC now
  }

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const hour = get('hour') % 24; // some runtimes emit "24" for midnight
  return new Date(
    Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second')),
  );
}
