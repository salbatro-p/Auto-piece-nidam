import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Pool } from 'pg';
import { createApp } from '../apps/api/src/app.js';
import { totp } from '../apps/api/src/auth.js';
import { databaseConnectionErrors } from '../apps/api/src/db.js';

// Run only against the retained, explicitly marked synthetic 100k/1m load fixture.
// This never starts, stops, seeds, clears or migrates the working Business database.
if (process.env.DEMO_MODE !== 'true') throw new Error('Isolated demo mode required');
const url = new URL(process.env.DATABASE_URL!);
const database = process.env.BENCHMARK_DATABASE ?? '';
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^autoparts_load_\d+$/.test(database))
  throw new Error('A local, explicitly named synthetic load database is required');
url.pathname = '/' + database;
const pool = new Pool({
  connectionString: url.href, max: 30, min: 8,
  connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
});
const rounds = 30, intervalMs = 10000, requestsPerRound = 100;
const report: any = {
  startedAt: new Date().toISOString(), database, result: 'RUNNING',
  environment: { node: process.version, platform: process.platform,
    transport: 'Fastify injection with real PostgreSQL; no TCP/WAN/device timing' },
  profile: { rounds, intervalMs, requestsPerRound, durationTargetMs: rounds * intervalMs,
    readRequestsPerRound: 90, writeRequestsPerRound: 10, distinctReceiptsPerRound: 5,
    poolMax: 30, poolMin: 8, memoryGuardMiB: 512 },
  bursts: [], statuses: {},
  limits: [
    'Five-minute burst soak, not a multi-hour soak or hosted availability measurement.',
    'Synthetic local load fixture only; no company transactions or production pool.',
    'Measures recovery from queued demand, not PostgreSQL connection exhaustion by other services.',
  ],
};
const path = 'docs/evidence/pool-soak.json';
await mkdir('docs/evidence', { recursive: true });
const save = () => writeFile(path, JSON.stringify(report, null, 2) + '\n');
let app: Awaited<ReturnType<typeof createApp>> | undefined;
let sampler: ReturnType<typeof setInterval> | undefined;
const loop = monitorEventLoopDelay({ resolution: 20 });
const latency: number[] = [], receiptIds = new Set<string>();
let maxWaiting = 0, maxConnections = 0, peakRss = 0;
const connectionsBefore = databaseConnectionErrors;
try {
  assert.ok((await pool.query(
    `SELECT 1 FROM business_documents WHERE data @> '{"syntheticLoadFixture":true}'::jsonb LIMIT 1`,
  )).rowCount, 'Synthetic fixture marker missing');
  report.fixtures = (await pool.query(`SELECT
    (SELECT count(*)::int FROM products) products,
    (SELECT count(*)::int FROM fitments) fitments,
    (SELECT count(*)::int FROM vehicles) vehicles`)).rows[0];
  assert.equal(report.fixtures.products, 100000);
  assert.equal(report.fixtures.fitments, 1000000);
  const product = (await pool.query("SELECT id FROM products WHERE sku='SYN-000003'")).rows[0].id;
  const warehouse = (await pool.query("SELECT id FROM warehouses WHERE code='CAS'")).rows[0].id;
  const vehicle = (await pool.query("SELECT id FROM vehicles WHERE external_id='SYN-2'")).rows[0].id;
  const stock = async () => (await pool.query(
    'SELECT on_hand FROM inventory_balances WHERE product_id=$1 AND warehouse_id=$2',
    [product, warehouse],
  )).rows[0].on_hand;
  report.stockBefore = await stock();
  app = await createApp(pool);
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: {
    email: 'owner@demo.local', password: process.env.DEMO_PASSWORD,
    totp: totp(process.env.DEMO_TOTP_SECRET!),
  } });
  assert.equal(login.statusCode, 200, 'Synthetic owner login must succeed');
  const headers = {
    cookie: String(login.headers['set-cookie']).split(';')[0]!,
    'x-csrf-token': login.json().csrfToken,
  };
  const start = performance.now();
  report.rssBeforeMiB = process.memoryUsage().rss / 1048576;
  loop.enable();
  sampler = setInterval(() => {
    maxWaiting = Math.max(maxWaiting, pool.waitingCount);
    maxConnections = Math.max(maxConnections, pool.totalCount);
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 20);
  async function request(options: any, index: number) {
    const began = performance.now();
    const response = await app!.inject({ ...options,
      remoteAddress: '127.0.3.' + (1 + index % 20),
      headers: { ...headers, ...(options.headers ?? {}) },
    });
    latency.push(performance.now() - began);
    report.statuses[response.statusCode] = (report.statuses[response.statusCode] ?? 0) + 1;
    return response;
  }
  for (let round = 0; round < rounds; round++) {
    const delay = start + round * intervalMs - performance.now();
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    const began = performance.now();
    const reads = Array.from({ length: 90 }, (_, i) => request({
      method: 'GET', url: i < 60 ? '/api/products/' + product : i < 80
        ? '/api/products?q=SYN-' + String(1 + (round * 97 + i) % 99994).padStart(6, '0')
        : '/api/products?vehicleId=' + vehicle,
    }, i));
    const writes = Array.from({ length: 5 }, (_, i) => {
      const key = randomUUID();
      const options = { method: 'POST', url: '/api/inventory/receipts',
        headers: { 'idempotency-key': key },
        payload: { productId: product, warehouseId: warehouse, quantity: 1,
          unit: 'PCS', condition: 'SELLABLE', reference: 'SYN-SOAK-' + key },
      };
      return Promise.all([request(options, 90 + i * 2), request(options, 91 + i * 2)])
        .then(([first, repeated]) => {
          assert.equal(first.statusCode, 200, 'Receipt must commit under pool pressure');
          assert.equal(repeated.statusCode, 200, 'Identical simultaneous retry must succeed');
          assert.deepEqual(first.json(), repeated.json(), 'Retry must return the original receipt');
          receiptIds.add(first.json().id);
        });
    });
    const settled = await Promise.allSettled([...reads, ...writes]);
    const failure = settled.find(r => r.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    assert.deepEqual(Object.keys(report.statuses), ['200'], 'All read/write requests must succeed');
    assert.equal(pool.waitingCount, 0, 'Connection queue must drain after each burst');
    assert.ok(pool.totalCount <= 30, 'Pool must stay bounded');
    report.bursts.push({ round: round + 1, requests: requestsPerRound,
      durationMs: +(performance.now() - began).toFixed(2),
      connections: pool.totalCount, waitingAfter: pool.waitingCount,
      rssMiB: +(process.memoryUsage().rss / 1048576).toFixed(2),
    });
    await save();
    if ((round + 1) % 6 === 0)
      console.log(JSON.stringify({ completedRounds: round + 1, maxWaiting, maxConnections,
        peakRssMiB: +(peakRss / 1048576).toFixed(2), receipts: receiptIds.size }));
  }
  const remaining = start + rounds * intervalMs - performance.now();
  if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  report.durationMs = +(performance.now() - start).toFixed(2);
  report.stockAfter = await stock();
  report.expectedStockIncrease = rounds * 5;
  report.distinctReceipts = receiptIds.size;
  report.postedReceiptMovements = Number((await pool.query(
    'SELECT count(*)::int AS count FROM stock_movements WHERE document_id=ANY($1::uuid[])',
    [[...receiptIds]],
  )).rows[0].count);
  assert.equal(receiptIds.size, rounds * 5);
  assert.equal(report.postedReceiptMovements, rounds * 5);
  assert.equal(report.stockAfter - report.stockBefore, rounds * 5, 'Every repeated receipt applies once');
  const reconciliation = await app.inject({ url: '/api/inventory/reconciliation', headers });
  const bins = await app.inject({ url: '/api/bins/reconciliation', headers });
  assert.equal(reconciliation.statusCode, 200);
  assert.equal(bins.statusCode, 200);
  report.reconciliation = reconciliation.json();
  report.binReconciliation = bins.json();
  assert.equal(report.reconciliation.balanced, true);
  assert.equal(report.binReconciliation.balanced, true);
  assert.equal(maxConnections, 30, 'The configured pool limit must actually be exercised');
  assert.ok(maxWaiting > 0, 'Queued pool demand must be observed');
  assert.ok(peakRss / 1048576 < 512, 'Test-process RSS must remain under the stated guard');
  assert.equal(databaseConnectionErrors - connectionsBefore, 0, 'No unexpected database disconnects');
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL';
  report.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  if (sampler) clearInterval(sampler);
  loop.disable();
  latency.sort((a, b) => a - b);
  const quantile = (q: number) => latency.length ? +latency[Math.ceil(latency.length * q) - 1].toFixed(2) : null;
  report.requests = latency.length;
  report.latencyMs = { p50: quantile(.5), p95: quantile(.95), p99: quantile(.99), max: latency.at(-1) ?? null };
  report.pool = { maxConnections, maxWaiting, waitingAtEnd: pool.waitingCount };
  report.memory = { peakRssMiB: +(peakRss / 1048576).toFixed(2), finalRssMiB: +(process.memoryUsage().rss / 1048576).toFixed(2) };
  report.eventLoopP99Ms = +(loop.percentile(99) / 1e6).toFixed(2);
  report.databaseConnectionErrors = databaseConnectionErrors - connectionsBefore;
  report.finishedAt = new Date().toISOString();
  await save();
  await app?.close();
  await pool.end();
  console.log(JSON.stringify({ result: report.result, requests: report.requests,
    pool: report.pool, memory: report.memory, failure: report.failure }));
}
