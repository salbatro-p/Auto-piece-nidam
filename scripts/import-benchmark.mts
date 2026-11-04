import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { migrate } from '../apps/api/src/migrate.js';
import { seed } from '../apps/api/src/seed.js';
import { createApp } from '../apps/api/src/app.js';
import { hash, ORG_ID } from '../apps/api/src/db.js';
import { totp } from '../apps/api/src/auth.js';
if (process.env.DEMO_MODE !== 'true') throw new Error('Demo-only import drill');
const url = new URL(process.env.DATABASE_URL!);
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Local database required');
const admin = new Pool({ connectionString: url.href }),
  database = 'autoparts_import_' + Date.now();
await admin.query('CREATE DATABASE ' + database);
url.pathname = '/' + database;
const pool = new Pool({ connectionString: url.href, max: 15 });
await migrate(pool);
await seed(pool);
const app = await createApp(pool);
const login = await app.inject({
  method: 'POST',
  url: '/api/auth/login',
  payload: {
    email: 'owner@demo.local',
    password: process.env.DEMO_PASSWORD,
    totp: totp(process.env.DEMO_TOTP_SECRET!),
  },
});
assert.equal(login.statusCode, 200, login.body);
const headers = {
  cookie: String(login.headers['set-cookie']).split(';')[0]!,
  'x-csrf-token': login.json().csrfToken,
};
async function post(path: string, data: any) {
  const r = await app.inject({
    method: 'POST',
    url: '/api' + path,
    headers: { ...headers, 'idempotency-key': randomUUID() },
    payload: data,
  });
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
}
const sourceId = (await pool.query('SELECT id FROM sources LIMIT 1')).rows[0].id;
const report: any = {
  date: new Date().toISOString(),
  database,
  fixture: '100000 fictional products; no company data',
  transport: 'Fastify inject with real PostgreSQL and separate worker OS processes',
  count: 100000,
  observations: [],
  workerPeakRssBytes: 0,
  apiPeakRssBytes: 0,
  readLatenciesMs: [],
};
const start = performance.now();
const id = (
  await post('/bulk-imports', { sourceId, total: 100000, fileHash: hash('synthetic-bulk-100k-v1') })
).id;
function fixture(n: number) {
  return {
    sku: `LOAD-IMPORT-${String(n).padStart(6, '0')}`,
    names: { en: 'Synthetic part ' + n, fr: 'Pièce synthétique ' + n, ar: 'قطعة اصطناعية ' + n },
    brand: 'SYNTHETIC',
    category: 'filters',
    packSize: 10,
    priceMinor: 12000,
    costMinor: 8000,
    status: 'ACTIVE_INTERNAL',
  };
}
for (let offset = 0; offset < 100000; offset += 1000) {
  await post(`/bulk-imports/${id}/chunks`, {
    offset,
    rows: Array.from({ length: 1000 }, (_, i) => fixture(offset + i)),
  });
  report.apiPeakRssBytes = Math.max(report.apiPeakRssBytes, process.memoryUsage().rss);
}
assert.equal((await post(`/bulk-imports/${id}/validate`, {})).valid, true);
report.uploadAndValidationMs = performance.now() - start;
await post(`/bulk-imports/${id}/commit`, {});
let reading = false;
const readTimer = setInterval(async () => {
  if (reading) return;
  reading = true;
  try {
    const t = performance.now();
    const r = await app.inject({ method: 'GET', url: '/api/products?q=AP-AIR-003', headers });
    assert.equal(r.statusCode, 200);
    report.readLatenciesMs.push(performance.now() - t);
  } finally {
    reading = false;
  }
}, 250);
function worker(stopAt?: number) {
  return new Promise<void>((resolve, reject) => {
    const child = fork(fileURLToPath(new URL('./import-worker.mts', import.meta.url)), [], {
      env: {
        ...process.env,
        DATABASE_URL: url.href,
        IMPORT_JOB_ID: id,
        ...(stopAt ? { STOP_AT: String(stopAt) } : {}),
      },
      execArgv: ['--import=tsx'],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let expectedKill = false;
    let error = '';
    child.stderr?.on('data', (d) => {
      error += d.toString();
    });
    child.on('error', reject);
    child.on('message', (m: any) => {
      report.workerPeakRssBytes = Math.max(report.workerPeakRssBytes, m.peakRssBytes ?? 0);
      if (m.checkpoint) {
        assert.equal(m.checkpoint, 50000);
        expectedKill = true;
        child.kill('SIGKILL');
      }
      if (m.complete) report.observations.push('Fresh worker completed exactly 100000 rows');
    });
    child.on('exit', (code, signal) => {
      if (expectedKill) {
        report.observations.push({
          event: 'Worker process forcibly terminated after committed 50% checkpoint',
          code,
          signal,
        });
        resolve();
      } else if (code === 0) resolve();
      else reject(new Error('Import worker failed: ' + error.slice(0, 500)));
    });
  });
}
const commitStart = performance.now();
await worker(50000);
assert.equal(
  (await pool.query('SELECT processed FROM bulk_import_jobs WHERE id=$1', [id])).rows[0].processed,
  50000,
);
await worker();
clearInterval(readTimer);
while (reading) await new Promise((r) => setTimeout(r, 25));
report.commitWithRestartMs = performance.now() - commitStart;
const result = (
  await pool.query(
    'SELECT count(*)::integer AS count,count(DISTINCT product_id)::integer AS distinct_count FROM bulk_import_rows WHERE job_id=$1 AND product_id IS NOT NULL',
    [id],
  )
).rows[0];
assert.equal(result.count, 100000);
assert.equal(result.distinct_count, 100000);
assert.equal(
  (
    await pool.query(
      "SELECT count(*) FROM products WHERE sku LIKE 'LOAD-IMPORT-%' AND status='ACTIVE_INTERNAL'",
    )
  ).rows[0].count,
  '100000',
);
const invalid = (
  await post('/bulk-imports', { sourceId, total: 100000, fileHash: hash('synthetic-invalid-100k-v1') })
).id;
for (let offset = 0; offset < 100000; offset += 1000) {
  const rows = Array.from({ length: 1000 }, (_, i) => ({
    ...fixture(offset + i),
    sku: 'VALIDATION-' + (offset + i),
  }));
  if (offset === 0) {
    rows[1] = rows[0]!;
    rows[2]!.names.en = '=MALICIOUS()';
    (rows[3] as any).vin = 'INVALID';
  }
  await post(`/bulk-imports/${invalid}/chunks`, { offset, rows });
  report.apiPeakRssBytes = Math.max(report.apiPeakRssBytes, process.memoryUsage().rss);
}
const invalidPreview = await post(`/bulk-imports/${invalid}/validate`, {});
assert.equal(invalidPreview.errorCount, 3);
assert.equal(invalidPreview.valid, false);
assert.equal(
  (await pool.query("SELECT count(*) FROM products WHERE sku LIKE 'VALIDATION-%'")).rows[0].count,
  '0',
);
const sorted = report.readLatenciesMs.sort((a: number, b: number) => a - b);
report.concurrentRead = {
  requests: sorted.length,
  p95Ms: sorted[Math.floor(sorted.length * 0.95)],
  maxMs: sorted.at(-1),
};
delete report.readLatenciesMs;
report.totalMs = performance.now() - start;
report.result = 'PASS';
report.imported = result;
report.invalidFile = { rows: 100000, rejectedRows: 3, productsCreated: 0 };
report.balanced = (
  await app.inject({ method: 'GET', url: '/api/inventory/reconciliation', headers })
).json().balanced;
assert.equal(report.balanced, true);
await writeFile('docs/evidence/import-resumption.json', JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    result: report.result,
    imported: result,
    commitWithRestartMs: report.commitWithRestartMs,
    workerPeakRssBytes: report.workerPeakRssBytes,
    concurrentRead: report.concurrentRead,
  }),
);
await app.close();
await pool.end();
await admin.end();
