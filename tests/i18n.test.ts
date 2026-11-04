import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import {
  dictionaries,
  translate,
  translationReviewStatus,
  type MessageKey,
} from '../packages/i18n/src/business.js';
import {
  locales,
  direction,
  resolveLocale,
  parseMoney,
  money,
  dateTime,
  contentValue,
} from '../packages/i18n/src/index.js';
test('all AR FR EN messages compile with ICU, key parity and no missing domain errors', async () => {
  const keys = Object.keys(dictionaries.en) as MessageKey[];
  for (const locale of locales) {
    assert.deepEqual(Object.keys(dictionaries[locale]).sort(), [...keys].sort());
    for (const key of keys) {
      assert.ok(dictionaries[locale][key].trim(), key);
      assert.doesNotThrow(
        () => translate(locale, key, { done: 2, total: 3, count: 3, quantity: 1, pack: 10, pieces: 10 }),
        locale + ':' + key,
      );
    }
  }
  const codes = new Set<string>();
  for (const filename of await readdir('apps/api/src')) {
    if (!filename.endsWith('.ts')) continue;
    const text = await readFile('apps/api/src/' + filename, 'utf8');
    for (const match of text.matchAll(/new DomainError\('([A-Z_]+)'/g)) codes.add(match[1]);
  }
  const missing = [...codes].filter((code) => !keys.includes(code as MessageKey));
  assert.deepEqual(missing, []);
  await mkdir('docs/evidence', { recursive: true });
  await writeFile(
    'docs/evidence/translation-coverage.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        keysPerLocale: keys.length,
        technicalCoverage: { ar: 100, fr: 100, en: 100 },
        backendDomainErrorCodes: codes.size,
        missing,
        reviewStatus: translationReviewStatus,
        professionallyApprovedPercent: 0,
      },
      null,
      2,
    ),
  );
});
test('locale resolution and RTL honor explicit preference and supported device language', () => {
  assert.equal(resolveLocale('ar', 'fr-FR'), 'ar');
  assert.equal(resolveLocale(null, 'en-US'), 'en');
  assert.equal(resolveLocale(null, 'de-DE'), 'fr');
  assert.equal(direction('ar'), 'rtl');
  assert.equal(direction('fr'), 'ltr');
  assert.equal(direction('en'), 'ltr');
});
test('Arabic/French/English decimals map to identical exact MAD minor units', () => {
  for (const value of ['1 234,50', '1\u202f234,50', '1234.50', '١٬٢٣٤٫٥٠', '۱۲۳۴٫۵۰'])
    assert.equal(parseMoney(value), 123450);
  for (const value of ['12.345', '-1', 'NaN', '1e3', '1,2,3']) assert.throws(() => parseMoney(value));
  for (const locale of locales) {
    assert.ok(money(123450, locale));
    assert.ok(dateTime('2026-11-04T12:00:00Z', locale));
  }
  assert.equal(parseMoney('0.01') + parseMoney('0.02'), 3);
});
test('Arabic plurals and missing content stay visible without modifying authoritative identifiers', () => {
  assert.equal(translate('ar', 'cartCount', { count: 2 }), 'بندان');
  assert.notEqual(translate('fr', 'cartCount', { count: 1 }), translate('fr', 'cartCount', { count: 3 }));
  const id = 'OEM-82 00 / أ 0012345678905';
  const fallback = contentValue({ en: id }, 'ar');
  assert.equal(fallback.value, id);
  assert.equal(fallback.missing, true);
  assert.equal(fallback.sourceLocale, 'en');
});
