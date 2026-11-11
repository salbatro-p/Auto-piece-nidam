import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import moment from 'moment-timezone';

// Build-time data extraction only: neither Moment nor the worldwide tzdb enters the app bundle.
const require = createRequire(import.meta.url);
const packagePath = require.resolve('moment-timezone/package.json');
const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
const zone = moment.tz.zone('Africa/Casablanca');
assert.ok(zone);
assert.equal(zone.untils.length, zone.offsets.length);
assert.equal(zone.untils.at(-1), Infinity);
for (let i = 1; i < zone.untils.length; i++) assert.ok(zone.untils[i] > zone.untils[i - 1]);
const data = {
  zone: zone.name, tzdbVersion: moment.tz.dataVersion,
  sourcePackage: 'moment-timezone@' + pkg.version,
  source: 'https://github.com/moment/moment-timezone/blob/' + pkg.version + '/data/packed/latest.json',
  // Each offset is valid strictly before the matching UTC boundary; null means no later transition.
  untilEpochMs: zone.untils.map(value => Number.isFinite(value) ? value : null),
  utcOffsetMinutes: zone.offsets,
};
const dir = 'packages/i18n/src/data';
await mkdir(dir, { recursive: true });
await writeFile(dir + '/casablanca.json', JSON.stringify(data, null, 2) + '\n');
await writeFile(dir + '/TZDATA_LICENSE.txt', await readFile(require.resolve('moment-timezone/LICENSE'), 'utf8'));
console.log(JSON.stringify({ zone: data.zone, tzdbVersion: data.tzdbVersion, transitions: data.untilEpochMs.length - 1 }));
