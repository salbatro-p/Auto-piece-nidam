import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { chromium } from '@playwright/test';
import { login, switchLanguage, checkHeader } from '../tests/e2e/helpers.js';

if (process.env.DEMO_MODE !== 'true') throw new Error('Isolated local demo required');
const url = new URL(process.env.DATABASE_URL!);
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.equal(url.pathname, '/autoparts', 'Check the saved demo, not an invented or replacement database');
const origin = 'http://127.0.0.1:4173';
const report: any = {
  startedAt: new Date().toISOString(), result: 'RUNNING',
  scope: 'Post-interruption local startup/read-only business smoke; does not replace the dated acceptance suites.',
  mutations: 'Synthetic owner authentication and language preference only; no inventory/catalog writes or reseeding.',
  localeChecks: [],
};
const pool = new Pool({ connectionString: url.href, max: 2 });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const health = await fetch('http://127.0.0.1:4310/api/health');
  assert.equal(health.status, 200);
  report.health = await health.json();
  assert.equal(report.health.mode, 'isolated-demo');
  const migrations = (await pool.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
  const expectedMigrations = (await readdir('db/migrations')).filter(name => name.endsWith('.sql')).sort();
  assert.deepEqual(migrations.map(migration => migration.name), expectedMigrations);
  for (const migration of migrations) {
    const sql = await readFile('db/migrations/' + migration.name, 'utf8');
    assert.equal(createHash('sha256').update(sql).digest('hex'), migration.checksum,
      'An applied migration changed: ' + migration.name);
  }
  report.appliedMigrations = migrations.map(row => row.name);
  const backup = JSON.parse(await readFile('docs/evidence/restore-drill.json', 'utf8'));
  report.backupSnapshotDate = backup.date;
  report.retainedRecords = {};
  for (const table of ['products', 'product_media', 'business_documents', 'sales', 'stock_movements', 'bin_movements']) {
    const current = Number((await pool.query('SELECT count(*)::int AS count FROM ' + table)).rows[0].count);
    const backedUp = backup.checksumsBefore[table].rows;
    assert.ok(current >= backedUp, 'Saved records disappeared from ' + table);
    report.retainedRecords[table] = { current, backedUp };
  }
  assert.equal((await fetch(origin + '/api/products')).status, 401);
  report.anonymousBusinessDataDenied = true;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await login(page, 'owner');
  await mkdir('docs/evidence/screenshots', { recursive: true });
  for (const locale of ['fr', 'en', 'ar'] as const) {
    await switchLanguage(page, locale);
    await checkHeader(page);
    await page.screenshot({ path: 'docs/evidence/screenshots/resume-dashboard-' + locale + '.png', fullPage: true });
    report.localeChecks.push({ locale, direction: await page.locator('html').getAttribute('dir'), selectorVisible: true });
  }
  for (const [field, path] of [
    ['reconciliation', '/api/inventory/reconciliation'],
    ['binReconciliation', '/api/bins/reconciliation'],
  ]) {
    const response = await page.request.get(path);
    assert.equal(response.status(), 200);
    report[field] = await response.json();
    assert.equal(report[field].balanced, true);
  }
  assert.deepEqual(pageErrors, []);
  report.browserErrors = pageErrors;
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL';
  report.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await pool.end();
  report.finishedAt = new Date().toISOString();
  await mkdir('docs/evidence', { recursive: true });
  await writeFile('docs/evidence/runtime-resume.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: report.result, localeChecks: report.localeChecks.length,
    retainedRecords: report.retainedRecords, failure: report.failure }));
}
