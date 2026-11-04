import { Pool } from 'pg';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { createApp } from '../apps/api/src/app.js';
if (process.env.DEMO_MODE !== 'true')
  throw new Error('This drill is restricted to synthetic isolated local data');
const url = new URL(process.env.DATABASE_URL!);
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Local database required');
const pgBin = process.env.POSTGRES_BIN ?? 'D:/PostgreSQL/New folder/bin';
const run = promisify(execFile);
const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
const common = ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username)];
const source = new Pool({ connectionString: url.href });
const snapshot = await source.connect();
const tables = [
  'products',
  'product_identifiers',
  'inventory_balances',
  'stock_movements',
  'business_documents',
  'reservations',
  'reservation_lines',
  'sales',
  'sale_lines',
  'returns',
  'stock_counts',
  'audit_events',
  'idempotency',
  'outbox_events',
  'product_media',
];
async function checksums(client: any) {
  const results: Record<string, { rows: number; sha256: string }> = {};
  for (const table of tables) {
    const rows = (
      await client.query('SELECT to_jsonb(t)::text AS data FROM ' + table + ' t ORDER BY to_jsonb(t)::text')
    ).rows;
    results[table] = {
      rows: rows.length,
      sha256: createHash('sha256')
        .update(rows.map((r: any) => r.data).join('\n'))
        .digest('hex'),
    };
  }
  return results;
}
await mkdir('.local/backups', { recursive: true });
await mkdir('docs/evidence', { recursive: true });
const file = resolve('.local/backups/demo-' + Date.now() + '.dump');
const start = performance.now();
await snapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
const snapshotId = (await snapshot.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
const before = await checksums(snapshot);
await run(
  join(pgBin, 'pg_dump.exe'),
  [...common, '-d', url.pathname.slice(1), '-Fc', '--snapshot=' + snapshotId, '-f', file],
  { env, windowsHide: true },
);
await snapshot.query('COMMIT');
snapshot.release();
const backupMs = performance.now() - start;
const restoreName = 'autoparts_restore_' + Date.now();
await source.query('CREATE DATABASE ' + restoreName);
const restoreStart = performance.now();
await run(
  join(pgBin, 'pg_restore.exe'),
  [...common, '-d', restoreName, '--no-owner', '--no-privileges', file],
  { env, windowsHide: true },
);
const restoreMs = performance.now() - restoreStart;
url.pathname = '/' + restoreName;
const restored = new Pool({ connectionString: url.href });
const after = await checksums(restored);
const identical = JSON.stringify(before) === JSON.stringify(after);
const app = await createApp(restored);
const auth = await app.inject({
  method: 'POST',
  url: '/api/auth/login',
  payload: { email: 'sales@demo.local', password: process.env.DEMO_PASSWORD },
});
if (auth.statusCode !== 200) throw new Error('Restored login failed');
const cookie = String(auth.headers['set-cookie']).split(';')[0],
  csrf = auth.json().csrfToken;
const products = (await app.inject({ url: '/api/products', headers: { cookie } })).json().items;
const product = products.find((p: any) => p.stock.some((s: any) => s.available > 1));
if (!product) throw new Error('No synthetic stock available for restored business-flow test');
const stock = product.stock.find((s: any) => s.available > 1);
const key = randomUUID();
const request: any = {
  method: 'POST',
  url: '/api/sales',
  headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': key },
  payload: { warehouseId: stock.warehouseId, lines: [{ productId: product.id, quantity: 1 }], locale: 'ar' },
};
const sale = await app.inject(request),
  replay = await app.inject(request);
const afterProduct = (await app.inject({ url: '/api/products/' + product.id, headers: { cookie } })).json();
const stockAfter = afterProduct.stock.find((s: any) => s.warehouseId === stock.warehouseId);
const flowPass =
  sale.statusCode === 200 &&
  replay.statusCode === 200 &&
  sale.json().id === replay.json().id &&
  stockAfter.onHand === stock.onHand - 1;
const auditAuth = await app.inject({
  method: 'POST',
  url: '/api/auth/login',
  payload: { email: 'auditor@demo.local', password: process.env.DEMO_PASSWORD },
});
const auditCookie = String(auditAuth.headers['set-cookie']).split(';')[0];
const reconciliation = (
  await app.inject({ url: '/api/inventory/reconciliation', headers: { cookie: auditCookie } })
).json();
const report = {
  date: new Date().toISOString(),
  environment: 'Windows native PostgreSQL18.4, isolated synthetic data. New local recovery database.',
  sourceDatabase: new URL(process.env.DATABASE_URL!).pathname.slice(1),
  restoredDatabase: restoreName,
  backupMilliseconds: backupMs,
  restoreMilliseconds: restoreMs,
  backupSha256: createHash('sha256')
    .update(await readFile(file))
    .digest('hex'),
  checksumsBefore: before,
  checksumsAfter: after,
  identicalCriticalTables: identical,
  businessFlow: {
    saleStatus: sale.statusCode,
    replayStatus: replay.statusCode,
    exactlyOneDeduction: flowPass,
  },
  reconciliation,
  pass: identical && flowPass && reconciliation.balanced === true,
  limits: [
    'Local logical snapshot recovery only; remote encrypted storage and WAL/PITR not configured.',
    'This elapsed restore does not establish a hosted RTO or 15-minute RPO.',
    'Production migration rollback and physical failover not rehearsed.',
  ],
};
await writeFile('docs/evidence/restore-drill.json', JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    identicalCriticalTables: identical,
    businessFlowPassed: flowPass,
    balanced: reconciliation.balanced,
    backupMs,
    restoreMs,
    pass: report.pass,
  }),
);
await app.close();
await restored.end();
await source.end();
if (!report.pass) process.exitCode = 1;
