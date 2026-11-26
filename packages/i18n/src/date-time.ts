import casablanca from './data/casablanca.json' with { type: 'json' };

// Browser, Node and PostgreSQL timezone databases can contain different Morocco rules.
// Use the bundled IANA transitions for the wall clock, and Intl only for localized presentation.
// Shifted milliseconds are private to formatting; stored instants always remain their original UTC.
const formatters = new Map<string, Intl.DateTimeFormat>();
export const businessTimeZone = casablanca.zone;
export const businessTimeZoneDataVersion = casablanca.tzdbVersion;

function wallClockAt(instant: number): number {
  let low = 0, high = casablanca.untilEpochMs.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const boundary = casablanca.untilEpochMs[middle];
    if (boundary !== null && instant >= boundary) low = middle + 1;
    else high = middle;
  }
  return instant - Math.round(casablanca.utcOffsetMinutes[low] * 60000);
}

function instantOf(value: string | Date): number {
  const instant = new Date(value).getTime();
  if (!Number.isFinite(instant)) throw new RangeError('Invalid time value');
  return instant;
}

const offsets = [...new Set(casablanca.utcOffsetMinutes)].map(minutes => Math.round(minutes * 60000));
function localMidnightToUtc(midnight: number): number {
  // Prefer the first occurrence if a historical local midnight is repeated.
  const matches = offsets.map(offset => midnight + offset)
    .filter(candidate => wallClockAt(candidate) === midnight);
  if (matches.length) return Math.min(...matches);
  // Historical forward transitions can skip midnight; the day starts at the transition.
  for (const boundary of casablanca.untilEpochMs) {
    if (boundary !== null && wallClockAt(boundary - 1) < midnight && wallClockAt(boundary) > midnight)
      return boundary;
  }
  throw new RangeError('Business day boundary is unavailable');
}

/** Authoritative UTC interval for the Moroccan business date; never assumes a 24-hour day. */
export function businessDayBounds(value: string | Date = new Date()): { start: string; end: string } {
  const wallClock = new Date(wallClockAt(instantOf(value)));
  const midnight = Date.UTC(wallClock.getUTCFullYear(), wallClock.getUTCMonth(), wallClock.getUTCDate());
  return {
    start: new Date(localMidnightToUtc(midnight)).toISOString(),
    end: new Date(localMidnightToUtc(midnight + 86400000)).toISOString(),
  };
}

export function formatBusinessDateTime(value: string | Date, locale: string): string {
  const wallClock = wallClockAt(instantOf(value));
  let formatter = formatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC', calendar: 'gregory',
    });
    formatters.set(locale, formatter);
  }
  return formatter.format(new Date(wallClock));
}
