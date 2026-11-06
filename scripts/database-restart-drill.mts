import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from '../apps/api/src/migrate.js';
import { seed } from '../apps/api/src/seed.js';
import { createApp } from '../apps/api/src/app.js';
if (process.env.DEMO_MODE !== 'true') throw new Error('Isolated synthetic demo required');
const pgBin = process.env.POSTGRES_BIN ?? 'D:/PostgreSQL/New folder/bin',
  run = promisify(execFile),
  stamp = Date.now();
const parent = resolve(process.env.DRILL_DATA_ROOT ?? 'D:/dipoo/AutoPartsMorocco-local-20261104'),
  data = join(parent, 'restart-' + stamp);
if (!data.startsWith(parent + requireSeparator())) throw new Error('Invalid drill directory');
function requireSeparator() {
  return process.platform === 'win32' ? '\\' : '/';
}
await mkdir(data, { recursive: true });
await mkdir('.local', { recursive: true });
const original = new URL(process.env.DATABASE_URL!);
if (!['127.0.0.1', 'localhost'].includes(original.hostname)) throw new Error('Local database required');
const password = decodeURIComponent(original.password),
  pwfile = resolve('.local', 'restart-pw-' + stamp);
await writeFile(pwfile, password, { mode: 0o600 });
const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const env = { ...process.env, PGPASSWORD: password };
const report: any = {
  date: new Date().toISOString(),
  environment:
    'Separate temporary local PostgreSQL cluster; no restart of the demo or other company databases',
  dataDirectory: data,
  port,
  phases: [],
};
await run(
  join(pgBin, 'initdb.exe'),
  [
    '-D',
    data,
    '-U',
    'autoparts',
    '--encoding=UTF8',
    '--no-locale',
    '--auth=scram-sha-256',
    '--pwfile=' + pwfile,
  ],
  { windowsHide: true },
);
await unlink(pwfile);
async function control(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(join(pgBin, 'pg_ctl.exe'), args, { windowsHide: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Test database control failed: ' + code)),
    );
  });
}
async function start() {
  await control([
    '-D',
    data,
    '-l',
    join(parent, 'restart-' + stamp + '.log'),
    '-o',
    `-h 127.0.0.1 -p ${port}`,
    '-w',
    'start',
  ]);
}
async function stop(mode = 'fast') {
  await control(['-D', data, '-m', mode, '-w', 'stop']);
}
await start();
const url = new URL(original);
url.port = String(port);
url.pathname = '/postgres';
const pool = new Pool({ connectionString: url.href, max: 15 });
pool.on('error', () => {});
let app: Awaited<ReturnType<typeof createApp>> | undefined;
try {
  await migrate(pool);
  await seed(pool);
  app = await createApp(pool);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'warehouse@demo.local', password: process.env.DEMO_PASSWORD },
  });
  assert.equal(login.statusCode, 200);
  const headers = {
    cookie: String(login.headers['set-cookie']).split(';')[0]!,
    'x-csrf-token': login.json().csrfToken,
    'idempotency-key': randomUUID(),
  };
  const p =
    (await pool.query("SELECT id FROM products WHERE sku='AP-OIL-001'")).rows[0] ??
    (await pool.query('SELECT id FROM products ORDER BY sku LIMIT 1')).rows[0];
  const warehouse = (await pool.query("SELECT id FROM warehouses WHERE code='CAS'")).rows[0].id;
  const before = (
    await pool.query('SELECT on_hand FROM inventory_balances WHERE product_id=$1 AND warehouse_id=$2', [
      p.id,
      warehouse,
    ])
  ).rows[0].on_hand;
  await pool.query(
    'CREATE FUNCTION pause_drill() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(45); RETURN NEW; END $$',
  );
  await pool.query(
    'CREATE TRIGGER pause_stock_write BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION pause_drill()',
  );
  const reference = 'RESTART-' + randomUUID(),
    body = { productId: p.id, warehouseId: warehouse, quantity: 10, unit: 'PCS', reference };
  const inFlight = app.inject({ method: 'POST', url: '/api/inventory/receipts', headers, payload: body });
  let sleeping = false;
  for (let i = 0; i < 100; i++) {
    sleeping = !!(
      await pool.query(
        "SELECT 1 FROM pg_stat_activity WHERE wait_event='PgSleep' AND query LIKE 'INSERT INTO stock_movements%' LIMIT 1",
      )
    ).rowCount;
    if (sleeping) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(sleeping, true, 'The request must be inside the ledger insert before the forced stop');
  report.phases.push('Confirmed live request paused after balance update, before ledger insertion');
  const downAt = performance.now();
  await stop('immediate');
  const interrupted = await inFlight;
  assert.ok(interrupted.statusCode >= 500);
  report.interruptedHttpStatus = interrupted.statusCode;
  await start();
  report.recoveryMs = performance.now() - downAt;
  report.phases.push('Immediate database stop and crash recovery completed');
  await pool.query('DROP TRIGGER pause_stock_write ON stock_movements');
  assert.equal(
    (
      await pool.query('SELECT on_hand FROM inventory_balances WHERE product_id=$1 AND warehouse_id=$2', [
        p.id,
        warehouse,
      ])
    ).rows[0].on_hand,
    before,
  );
  assert.equal(
    (await pool.query('SELECT count(*) FROM business_documents WHERE reference=$1', [reference])).rows[0]
      .count,
    '0',
  );
  const retries = await Promise.all(
    Array.from({ length: 10 }, () =>
      app!.inject({ method: 'POST', url: '/api/inventory/receipts', headers, payload: body }),
    ),
  );
  for (const retry of retries) assert.equal(retry.statusCode, 200, retry.body);
  assert.equal(new Set(retries.map((r) => r.json().id)).size, 1);
  const after = (
    await pool.query('SELECT on_hand FROM inventory_balances WHERE product_id=$1 AND warehouse_id=$2', [
      p.id,
      warehouse,
    ])
  ).rows[0].on_hand;
  assert.equal(after, before + 10);
  assert.equal(
    (await pool.query('SELECT count(*) FROM business_documents WHERE reference=$1', [reference])).rows[0]
      .count,
    '1',
  );
  const ledger = Number(
    (
      await pool.query(
        'SELECT sum(on_hand_delta) FROM stock_movements WHERE product_id=$1 AND warehouse_id=$2',
        [p.id, warehouse],
      )
    ).rows[0].sum,
  );
  assert.equal(after, ledger);
  report.phases.push(
    'All uncommitted changes rolled back; ten identical retries created one receipt and one +10 stock effect',
  );
  report.quantityBefore = before;
  report.quantityAfter = after;
  report.ledger = ledger;
  report.result = 'PASS';
  await writeFile('docs/evidence/database-restart.json', JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      result: report.result,
      recoveryMs: report.recoveryMs,
      stockEffect: after - before,
      retryCount: 10,
    }),
  );
} finally {
  await app?.close();
  await pool.end();
  await stop().catch(() => {});
}
