import { test } from 'node:test';
import assert from 'node:assert/strict';
import moment from 'moment-timezone';
import { dateTime, numberLocale, locales } from '../packages/i18n/src/index.js';
import { businessDayBounds, businessTimeZoneDataVersion } from '../packages/i18n/src/date-time.js';
import data from '../packages/i18n/src/data/casablanca.json';
import { mkdir, writeFile } from 'node:fs/promises';

test('Business dates use pinned IANA rules across every Morocco transition and all three languages', () => {
  assert.equal(businessTimeZoneDataVersion, moment.tz.dataVersion);
  const probes = data.untilEpochMs.filter((v): v is number => v !== null)
    .flatMap(boundary => [boundary - 1, boundary, boundary + 1]);
  probes.push(Date.parse('2026-11-11T23:30:00Z'), Date.parse('2030-01-01T00:00:00Z'));
  const zone = moment.tz.zone('Africa/Casablanca')!;
  for (const instant of probes) for (const locale of locales) {
    const wallClock = instant - Math.round(zone.utcOffset(instant) * 60000);
    const expected = new Intl.DateTimeFormat(numberLocale(locale), {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC', calendar: 'gregory',
    }).format(new Date(wallClock));
    assert.equal(dateTime(new Date(instant), locale), expected, `${locale}: ${new Date(instant).toISOString()}`);
  }
  assert.match(dateTime('2026-11-11T23:30:00Z', 'en'), /11 Nov 2026, 23:30/);
  assert.match(dateTime('2026-09-19T23:30:00Z', 'en'), /20 Sept 2026, 00:30/);
  assert.throws(() => dateTime('invalid', 'en'), RangeError);
});

test('Moroccan business-day ranges include Ramadan and September 2026 transitions without fixed offsets', async () => {
  const cases = [
    ['2026-02-15T12:00:00Z', '2026-02-14T23:00:00.000Z', '2026-02-16T00:00:00.000Z'],
    ['2026-03-22T12:00:00Z', '2026-03-22T00:00:00.000Z', '2026-03-22T23:00:00.000Z'],
    ['2026-09-20T12:00:00Z', '2026-09-19T23:00:00.000Z', '2026-09-21T00:00:00.000Z'],
    ['2026-11-11T23:30:00Z', '2026-11-11T00:00:00.000Z', '2026-11-12T00:00:00.000Z'],
  ];
  for (const [instant, start, end] of cases) {
    assert.deepEqual(businessDayBounds(instant), { start, end });
    assert.equal(businessDayBounds(start).start, start);
    assert.equal(businessDayBounds(new Date(Date.parse(end) - 1)).start, start);
    assert.equal(businessDayBounds(end).start, end);
  }
  // Exercise historical skipped/repeated midnights as well as the current dates.
  for (const boundary of data.untilEpochMs) {
    if (boundary === null || boundary < Date.parse('1970-01-01T00:00:00Z')) continue;
    for (const instant of [boundary - 1, boundary, boundary + 86400000]) {
      const expected = moment.utc(instant).tz('Africa/Casablanca').startOf('day');
      assert.deepEqual(businessDayBounds(new Date(instant)), {
        start: expected.toISOString(), end: expected.clone().add(1, 'day').startOf('day').toISOString(),
      });
    }
  }
  await mkdir('docs/evidence', { recursive: true });
  await writeFile('docs/evidence/business-timezone.json', JSON.stringify({
    date: new Date().toISOString(), result: 'PASS', zone: data.zone,
    pinnedTzdb: data.tzdbVersion, nativeNodeTzdb: process.versions.tz,
    transitionsCompared: data.untilEpochMs.length - 1, locales: [...locales],
    testedBusinessDays: cases.map(([instant, start, end]) => ({ instant, start, end })),
    novemberProbe: Object.fromEntries(locales.map(locale => [locale, dateTime('2026-11-11T23:30:00Z', locale)])),
    scope: 'Pinned IANA transition boundaries and day intervals; receipt DOM checks are in browser evidence.',
  }, null, 2) + '\n');
});
