import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { seed } from '../src/seed.js';
import { totp } from '../src/auth.js';
import { expireReservations } from '../src/inventory.js';
import { processOutbox } from '../src/worker.js';
import { processImportChunk } from '../src/imports.js';
import { ORG_ID, transaction, hash } from '../src/db.js';

type Session = { cookie: string; csrf: string; id: string };
let app: FastifyInstance, pool: Pool, maintenance: Pool;
let owner: Session, sales: Session, warehouse: Session, curator: Session, auditor: Session;
let counter: string, depot: string, sourceId: string;
const databaseName = `autoparts_test_${Date.now()}_${process.pid}`;
const observations: { id: string; status: string; durationMs: number }[] = [];
const started = new Date().toISOString();
const localUrl = new URL(process.env.DATABASE_URL!);
const evidencePath = 'docs/evidence/api-integration.json';

async function login(role: string, extra: Record<string, unknown> = {}): Promise<Session> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: `${role}@demo.local`, password: process.env.DEMO_PASSWORD, ...extra },
  });
  assert.equal(res.statusCode, 200, res.body);
  return {
    cookie: String(res.headers['set-cookie']).split(';')[0]!,
    csrf: res.json().csrfToken,
    id: res.json().user.id,
  };
}
function request(
  session: Session,
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: Record<string, any>,
  key = randomUUID(),
) {
  return app.inject({
    method,
    url,
    headers: { cookie: session.cookie, 'x-csrf-token': session.csrf, 'idempotency-key': key },
    ...(payload !== undefined ? { payload } : {}),
  });
}
async function product(stock = 0, extras: Record<string, unknown> = {}) {
  const data = {
    sku: `TEST-${randomUUID()}`,
    names: { en: 'Synthetic test part', fr: 'Pièce de test', ar: 'قطعة اختبار' },
    descriptions: { en: 'Synthetic only', fr: 'Exemple uniquement', ar: 'للاختبار فقط' },
    brand: 'SYNTHETIC',
    oem: 'TEST 82-00 A',
    barcode: '0012345678905',
    category: 'filters',
    packSize: 10,
    priceMinor: 12550,
    costMinor: 8000,
    status: 'ACTIVE_INTERNAL',
    sourceId,
    ...extras,
  };
  const res = await request(owner, 'POST', '/api/products', data);
  assert.equal(res.statusCode, 200, res.body);
  const id = res.json().id as string;
  if (stock) {
    const received = await request(owner, 'POST', '/api/inventory/receipts', {
      productId: id,
      warehouseId: counter,
      quantity: stock,
      unit: 'PCS',
      reference: `RCPT-${randomUUID()}`,
    });
    assert.equal(received.statusCode, 200, received.body);
  }
  return { id, data };
}
async function balance(id: string, warehouseId = counter) {
  return (
    (
      await pool.query(
        'SELECT on_hand,reserved,quarantine,damaged FROM inventory_balances WHERE product_id=$1 AND warehouse_id=$2',
        [id, warehouseId],
      )
    ).rows[0] ?? { on_hand: 0, reserved: 0, quarantine: 0, damaged: 0 }
  );
}
async function measured(id: string, run: () => Promise<void>) {
  const start = performance.now();
  try {
    await run();
    observations.push({ id, status: 'PASS', durationMs: performance.now() - start });
  } catch (error) {
    observations.push({ id, status: 'FAIL', durationMs: performance.now() - start });
    throw error;
  }
}

before(async () => {
  if (process.env.DEMO_MODE !== 'true' || !['localhost', '127.0.0.1'].includes(localUrl.hostname))
    throw new Error('Tests require explicitly enabled isolated local demo database');
  const adminUrl = new URL(localUrl);
  adminUrl.pathname = '/postgres';
  maintenance = new Pool({ connectionString: adminUrl.toString() });
  assert.match(databaseName, /^autoparts_test_\d+_\d+$/);
  await maintenance.query(`CREATE DATABASE "${databaseName}"`);
  const testUrl = new URL(localUrl);
  testUrl.pathname = `/${databaseName}`;
  pool = new Pool({ connectionString: testUrl.toString(), max: 30 });
  await migrate(pool);
  await seed(pool);
  app = await createApp(pool);
  owner = await login('owner', { totp: totp(process.env.DEMO_TOTP_SECRET!) });
  sales = await login('sales');
  warehouse = await login('warehouse');
  curator = await login('curator');
  auditor = await login('auditor');
  const locations = (await request(owner, 'GET', '/api/warehouses')).json().items;
  counter = locations.find((x: any) => x.code === 'CAS').id;
  depot = locations.find((x: any) => x.code === 'DEP').id;
  sourceId = (await request(owner, 'GET', '/api/sources')).json().items[0].id;
});
after(async () => {
  if (app) await app.close();
  if (pool) await pool.end();
  if (maintenance) {
    await maintenance.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await maintenance.end();
  }
  await mkdir('docs/evidence', { recursive: true });
  await writeFile(
    evidencePath,
    JSON.stringify(
      {
        started,
        finished: new Date().toISOString(),
        environment: {
          node: process.version,
          platform: process.platform,
          database: 'isolated PostgreSQL database; synthetic fixtures; API injection with real transactions',
        },
        tests: observations,
        passed: observations.filter((x) => x.status === 'PASS').length,
        failed: observations.filter((x) => x.status === 'FAIL').length,
      },
      null,
      2,
    ),
  );
});

test('INV-01: one of 100 simultaneous last-unit reservations wins', () =>
  measured('INV-01', async () => {
    const p = await product(1);
    const responses = await Promise.all(
      Array.from({ length: 100 }, () =>
        request(sales, 'POST', '/api/inventory/reservations', {
          warehouseId: counter,
          lines: [{ productId: p.id, quantity: 1 }],
        }),
      ),
    );
    assert.equal(responses.filter((r) => r.statusCode === 200).length, 1);
    assert.equal(
      responses.filter((r) => r.statusCode === 409 && r.json().code === 'INSUFFICIENT_STOCK').length,
      99,
    );
    assert.deepEqual(await balance(p.id), { on_hand: 1, reserved: 1, quarantine: 0, damaged: 0 });
  }));
test('INV-02: ten receipt retries and ten sale retries commit once', () =>
  measured('INV-02', async () => {
    const p = await product();
    const key = randomUUID();
    const body = {
      productId: p.id,
      warehouseId: counter,
      quantity: 10,
      unit: 'PCS',
      reference: `REPLAY-${randomUUID()}`,
    };
    const receipts = await Promise.all(
      Array.from({ length: 10 }, () => request(owner, 'POST', '/api/inventory/receipts', body, key)),
    );
    assert.ok(receipts.every((x) => x.statusCode === 200));
    assert.equal(new Set(receipts.map((x) => x.json().id)).size, 1);
    assert.equal((await balance(p.id)).on_hand, 10);
    const saleKey = randomUUID(),
      saleBody = { warehouseId: counter, lines: [{ productId: p.id, quantity: 3 }], locale: 'fr' };
    const sold = await Promise.all(
      Array.from({ length: 10 }, () => request(sales, 'POST', '/api/sales', saleBody, saleKey)),
    );
    assert.ok(sold.every((x) => x.statusCode === 200));
    assert.equal(new Set(sold.map((x) => x.json().id)).size, 1);
    assert.equal((await balance(p.id)).on_hand, 7);
    const replay = await request(sales, 'GET', `/api/requests/${saleKey}`);
    assert.equal(replay.json().status, 'COMMITTED');
    assert.equal(replay.json().response.id, sold[0]!.json().id);
    const changed = await request(
      sales,
      'POST',
      '/api/sales',
      { ...saleBody, lines: [{ productId: p.id, quantity: 4 }] },
      saleKey,
    );
    assert.equal(changed.statusCode, 409);
    assert.equal(changed.json().code, 'IDEMPOTENCY_CONFLICT');
  }));
test('INV-03: sale versus transfer of the last unit is serialized', () =>
  measured('INV-03', async () => {
    const p = await product(1);
    const results = await Promise.all([
      request(sales, 'POST', '/api/sales', {
        warehouseId: counter,
        lines: [{ productId: p.id, quantity: 1 }],
        locale: 'ar',
      }),
      request(warehouse, 'POST', '/api/inventory/transfers', {
        productId: p.id,
        fromWarehouseId: counter,
        toWarehouseId: depot,
        quantity: 1,
        reason: 'Synthetic concurrency test',
      }),
    ]);
    assert.equal(results.filter((x) => x.statusCode === 200).length, 1);
    assert.equal(results.filter((x) => x.statusCode === 409).length, 1);
    assert.equal((await balance(p.id)).on_hand, 0);
    const expected = results[1]!.statusCode === 200 ? 1 : 0;
    assert.equal((await balance(p.id, depot)).on_hand, expected);
  }));
test('INV-04: opposite multi-SKU orders lock consistently; failed sale rolls back all lines', () =>
  measured('INV-04', async () => {
    const a = await product(1),
      b = await product(1);
    const lines = [
      { productId: a.id, quantity: 1 },
      { productId: b.id, quantity: 1 },
    ];
    const results = await Promise.all([
      request(sales, 'POST', '/api/sales', { warehouseId: counter, lines, locale: 'en' }),
      request(sales, 'POST', '/api/sales', {
        warehouseId: counter,
        lines: [...lines].reverse(),
        locale: 'en',
      }),
    ]);
    assert.equal(results.filter((x) => x.statusCode === 200).length, 1);
    assert.equal(results.filter((x) => x.statusCode === 409).length, 1);
    assert.equal((await balance(a.id)).on_hand, 0);
    assert.equal((await balance(b.id)).on_hand, 0);
    const c = await product(2),
      d = await product(0);
    const failed = await request(sales, 'POST', '/api/sales', {
      warehouseId: counter,
      lines: [
        { productId: c.id, quantity: 1 },
        { productId: d.id, quantity: 1 },
      ],
      locale: 'en',
    });
    assert.equal(failed.statusCode, 409);
    assert.equal((await balance(c.id)).on_hand, 2);
    assert.equal(
      (await pool.query("SELECT count(*) FROM stock_movements WHERE product_id=$1 AND kind='SALE'", [c.id]))
        .rows[0].count,
      '0',
    );
  }));
test('INV-05: fulfill/release race and expired reservation release have one terminal state', () =>
  measured('INV-05', async () => {
    const p = await product(1),
      lines = [{ productId: p.id, quantity: 1 }];
    const reserve = await request(sales, 'POST', '/api/inventory/reservations', {
      warehouseId: counter,
      lines,
    });
    const id = reserve.json().id;
    const results = await Promise.all([
      request(sales, 'POST', `/api/inventory/reservations/${id}/release`, {}),
      request(sales, 'POST', '/api/sales', { warehouseId: counter, lines, reservationId: id, locale: 'en' }),
    ]);
    assert.ok(results.every((x) => [200, 409].includes(x.statusCode)));
    const state = (await pool.query('SELECT status FROM reservations WHERE id=$1', [id])).rows[0].status;
    const b = await balance(p.id);
    assert.equal(b.reserved, 0);
    assert.equal(b.on_hand, state === 'FULFILLED' ? 0 : 1);
    const p2 = await product(1),
      lines2 = [{ productId: p2.id, quantity: 1 }];
    const r2 = await request(sales, 'POST', '/api/inventory/reservations', {
      warehouseId: counter,
      lines: lines2,
    });
    const id2 = r2.json().id;
    await pool.query("UPDATE reservations SET expires_at=now()-interval '1 second' WHERE id=$1", [id2]);
    await Promise.all([
      expireReservations(pool),
      request(sales, 'POST', `/api/inventory/reservations/${id2}/release`, {}),
      request(sales, 'POST', '/api/sales', {
        warehouseId: counter,
        lines: lines2,
        reservationId: id2,
        locale: 'ar',
      }),
    ]);
    assert.equal((await balance(p2.id)).reserved, 0);
    assert.equal((await balance(p2.id)).on_hand, 1);
  }));
test('INV-06: duplicate return stays quarantined and damaged inspection cannot restore availability', () =>
  measured('INV-06', async () => {
    const p = await product(1);
    const sale = (
      await request(sales, 'POST', '/api/sales', {
        warehouseId: counter,
        lines: [{ productId: p.id, quantity: 1 }],
        locale: 'fr',
      })
    ).json();
    const body = {
        saleId: sale.id,
        productId: p.id,
        warehouseId: counter,
        quantity: 1,
        reason: 'Synthetic damaged return',
      },
      key = randomUUID();
    const replies = await Promise.all(
      Array.from({ length: 10 }, () => request(sales, 'POST', '/api/inventory/returns', body, key)),
    );
    assert.ok(replies.every((x) => x.statusCode === 200));
    assert.deepEqual(await balance(p.id), { on_hand: 0, reserved: 0, quarantine: 1, damaged: 0 });
    const inspectKey = randomUUID(),
      id = replies[0]!.json().id;
    const inspected = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(owner, 'POST', `/api/inventory/returns/${id}/inspect`, { condition: 'DAMAGED' }, inspectKey),
      ),
    );
    assert.ok(inspected.every((x) => x.statusCode === 200));
    assert.deepEqual(await balance(p.id), { on_hand: 0, reserved: 0, quarantine: 0, damaged: 1 });
    assert.equal((await request(sales, 'POST', '/api/inventory/returns', body)).statusCode, 409);
  }));
test('INV-07: carton conversion, duplicate bill and invalid quantity are enforced', () =>
  measured('INV-07', async () => {
    const p = await product();
    const body = {
      productId: p.id,
      warehouseId: counter,
      quantity: 1,
      unit: 'CARTON',
      reference: `BILL-${randomUUID()}`,
    };
    const r = await request(warehouse, 'POST', '/api/inventory/receipts', body);
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().pieces, 10);
    assert.equal((await request(warehouse, 'POST', '/api/inventory/receipts', body)).statusCode, 409);
    assert.equal(
      (
        await request(warehouse, 'POST', '/api/inventory/receipts', {
          ...body,
          quantity: 0.5,
          reference: 'fractional',
        })
      ).statusCode,
      400,
    );
    assert.equal((await balance(p.id)).on_hand, 10);
  }));
test('INV-08: client balance tampering and append-only ledger edits are rejected', () =>
  measured('INV-08', async () => {
    const p = await product(2);
    const r = await request(owner, 'POST', '/api/inventory/receipts', {
      productId: p.id,
      warehouseId: counter,
      quantity: 1,
      unit: 'PCS',
      reference: 'tamper',
      new_stock: 999,
    });
    assert.equal(r.statusCode, 400);
    assert.equal((await balance(p.id)).on_hand, 2);
    await assert.rejects(
      pool.query('UPDATE stock_movements SET on_hand_delta=999 WHERE product_id=$1', [p.id]),
      /IMMUTABLE_RECORD/,
    );
    await assert.rejects(
      pool.query('DELETE FROM stock_movements WHERE product_id=$1', [p.id]),
      /IMMUTABLE_RECORD/,
    );
  }));
test('Counts require different approver and reject stale balances', () =>
  measured('COUNT-CONTROLS', async () => {
    const p = await product(3);
    const own = await request(owner, 'POST', '/api/inventory/counts', {
      productId: p.id,
      warehouseId: counter,
      counted: 4,
      reason: 'Physical count test',
    });
    const self = await request(owner, 'POST', `/api/inventory/counts/${own.json().id}/approve`, {});
    assert.equal(self.statusCode, 403);
    const count = await request(warehouse, 'POST', '/api/inventory/counts', {
      productId: p.id,
      warehouseId: counter,
      counted: 4,
      reason: 'Physical count test',
    });
    assert.equal(
      (await request(owner, 'POST', `/api/inventory/counts/${count.json().id}/approve`, {})).statusCode,
      200,
    );
    assert.equal((await balance(p.id)).on_hand, 4);
    const stale = await request(warehouse, 'POST', '/api/inventory/counts', {
      productId: p.id,
      warehouseId: counter,
      counted: 4,
      reason: 'Stale physical test',
    });
    await request(sales, 'POST', '/api/sales', {
      warehouseId: counter,
      lines: [{ productId: p.id, quantity: 1 }],
      locale: 'en',
    });
    const reject = await request(owner, 'POST', `/api/inventory/counts/${stale.json().id}/approve`, {});
    assert.equal(reject.statusCode, 409);
    assert.equal(reject.json().code, 'COUNT_STALE');
  }));
test('SEC-01: costs, privileged routes, branch and tenant boundaries are server enforced', () =>
  measured('SEC-01', async () => {
    const p = await product(1);
    const response = await request(sales, 'GET', `/api/products/${p.id}`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().costMinor, undefined);
    assert.ok(response.json().stock.every((x: any) => x.warehouseId === counter));
    for (const path of [
      '/api/suppliers',
      '/api/staff',
      '/api/audit',
      '/api/reports/stock.csv',
      '/api/openapi.json',
    ])
      assert.equal((await request(sales, 'GET', path)).statusCode, 403, path);
    assert.equal((await request(sales, 'GET', `/api/products?warehouseId=${depot}`)).statusCode, 403);
    assert.equal(
      (
        await request(sales, 'POST', '/api/sales', {
          warehouseId: depot,
          lines: [{ productId: p.id, quantity: 1 }],
          locale: 'en',
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await request(warehouse, 'POST', `/api/products/${p.id}/update`, {
          ...p.data,
          version: 1,
          priceMinor: 1,
        })
      ).statusCode,
      403,
    );
    assert.equal((await app.inject({ method: 'GET', url: '/api/products' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url: '/api/shop/products' })).statusCode, 401);
    const foreignOrg = randomUUID();
    await pool.query('INSERT INTO organizations(id,name) VALUES($1,$2)', [
      foreignOrg,
      'Other isolated tenant',
    ]);
    const foreignProduct = (
      await pool.query(
        "INSERT INTO products(org_id,sku,names,brand,category,price_minor,cost_minor,search_text) VALUES($1,'FOREIGN','{}','Synthetic','test',0,0,'foreign') RETURNING id",
        [foreignOrg],
      )
    ).rows[0].id;
    assert.equal((await request(owner, 'GET', `/api/products/${foreignProduct}`)).statusCode, 404);
    assert.equal(
      (
        await request(owner, 'POST', '/api/inventory/receipts', {
          productId: foreignProduct,
          warehouseId: counter,
          quantity: 1,
          unit: 'PCS',
          reference: 'cross-tenant',
        })
      ).statusCode,
      404,
    );
  }));
test('SEC-02: CSRF, SQL injection, brute force, malformed image and public endpoints are defended', () =>
  measured('SEC-02', async () => {
    const p = await product();
    const body = { productId: p.id, warehouseId: counter, quantity: 1, unit: 'PCS', reference: 'csrf-test' };
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/inventory/receipts',
          headers: { cookie: owner.cookie, 'idempotency-key': randomUUID() },
          payload: body,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/me/locale',
          headers: { cookie: owner.cookie, 'x-csrf-token': owner.csrf, origin: 'https://evil.invalid' },
          payload: { locale: 'ar' },
        })
      ).statusCode,
      403,
    );
    const search = await request(
      sales,
      'GET',
      `/api/products?q=${encodeURIComponent("'; DROP TABLE products; --")}`,
    );
    assert.equal(search.statusCode, 200);
    assert.equal(search.json().total, 0);
    for (let i = 0; i < 10; i++)
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { email: 'nobody@demo.local', password: 'incorrect' },
          })
        ).statusCode,
        401,
      );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'nobody@demo.local', password: 'incorrect' },
        })
      ).statusCode,
      429,
    );
    const bad = await request(owner, 'POST', `/api/products/${p.id}/media`, {
      data: Buffer.from('<script>alert(1)</script>').toString('base64'),
      mime: 'image/png',
      rights: 'Synthetic owned test',
    });
    assert.equal(bad.statusCode, 400);
    const fake = await request(owner, 'POST', `/api/products/${p.id}/media`, {
      data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]).toString('base64'),
      mime: 'image/png',
      rights: 'Synthetic owned test',
    });
    assert.equal(fake.statusCode, 400);
    const config = await app.inject({ url: '/api/config' });
    assert.equal(config.statusCode, 200);
    assert.deepEqual(Object.keys(config.json()), ['defaultLocale']);
  }));
test('MFA: sensitive-role OTP required, replay rejected, session revoked', () =>
  measured('MFA-SESSION', async () => {
    const absent = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'manager@demo.local', password: process.env.DEMO_PASSWORD },
    });
    assert.equal(absent.json().code, 'MFA_REQUIRED');
    const manager = await login('manager', { totp: totp(process.env.DEMO_TOTP_SECRET!) });
    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'manager@demo.local',
        password: process.env.DEMO_PASSWORD,
        totp: totp(process.env.DEMO_TOTP_SECRET!),
      },
    });
    assert.equal(replay.json().code, 'MFA_INVALID');
    assert.equal((await request(owner, 'POST', `/api/staff/${manager.id}/revoke`, {})).statusCode, 200);
    assert.equal((await request(manager, 'GET', '/api/me')).statusCode, 401);
    const temp = await login('buyer');
    await pool.query("UPDATE sessions SET last_seen=now()-interval '6 minutes' WHERE token_hash=$1", [
      hash(temp.cookie.split('=')[1]!),
    ]);
    assert.equal((await request(temp, 'GET', '/api/me')).statusCode, 401);
  }));
test('DATA-01 subset: previews reject duplicate/existing/formula rows; idempotent import and safe revert', () =>
  measured('DATA-01-SMALL', async () => {
    const p = await product();
    const row = { ...p.data, sku: `IMPORT-${randomUUID()}` };
    const invalid = await request(owner, 'POST', '/api/imports/preview', {
      sourceId,
      rows: [row, row, { ...row, sku: p.data.sku }, { ...row, sku: '=HYPERLINK("evil")' }],
    });
    assert.equal(invalid.statusCode, 200);
    const report = invalid.json();
    assert.equal(report.valid, false);
    for (const code of ['DUPLICATE_SKU', 'SKU_EXISTS', 'FORMULA_REJECTED'])
      assert.ok(report.errors.some((x: any) => x.code === code));
    assert.equal((await request(owner, 'POST', `/api/imports/${report.id}/commit`, {})).statusCode, 409);
    const valid = await request(owner, 'POST', '/api/imports/preview', { sourceId, rows: [row] });
    assert.equal(valid.json().valid, true);
    const key = randomUUID();
    const commits = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(owner, 'POST', `/api/imports/${valid.json().id}/commit`, {}, key),
      ),
    );
    assert.ok(commits.every((x) => x.statusCode === 200));
    assert.equal(
      (await pool.query('SELECT count(*) FROM products WHERE sku=$1', [row.sku])).rows[0].count,
      '1',
    );
    const imported = (await pool.query('SELECT id FROM products WHERE sku=$1', [row.sku])).rows[0].id;
    assert.equal(
      (
        await request(owner, 'POST', `/api/products/${imported}/update`, {
          ...row,
          version: 1,
          priceMinor: 13000,
        })
      ).statusCode,
      200,
    );
    const revert = await request(owner, 'POST', `/api/imports/${valid.json().id}/revert`, {});
    assert.equal(revert.statusCode, 409);
    assert.equal(revert.json().code, 'IMPORT_HAS_CHANGES');
  }));
test('DATA-02: variants remain separate and unreviewed fitment is never confirmed', () =>
  measured('DATA-02', async () => {
    const p = await product();
    const vehicle = {
      make: 'Synthetic',
      model: 'Same model',
      generation: 'G1',
      market: 'MA',
      yearFrom: 2020,
      yearTo: 2024,
      engine: 'ENGINE-A',
      fuel: 'DIESEL',
      transmission: 'MANUAL',
      body: 'VAN',
      sourceId,
      externalId: randomUUID(),
    };
    const a = await request(owner, 'POST', '/api/vehicles', vehicle),
      b = await request(owner, 'POST', '/api/vehicles', {
        ...vehicle,
        engine: 'ENGINE-B',
        externalId: randomUUID(),
      });
    assert.equal(a.statusCode, 200, a.body);
    assert.equal(b.statusCode, 200, b.body);
    assert.notEqual(a.json().id, b.json().id);
    assert.equal(
      (
        await request(owner, 'POST', '/api/fitments', {
          productId: p.id,
          vehicleId: a.json().id,
          status: 'VERIFIED',
          evidence: 'maybe',
          sourceId,
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await request(owner, 'POST', '/api/fitments', {
          productId: p.id,
          vehicleId: a.json().id,
          status: 'SOURCE_CLAIMED',
          evidence: 'Synthetic unreviewed claim only',
          sourceId,
        })
      ).statusCode,
      200,
    );
    const found = await request(sales, 'GET', `/api/products?vehicleId=${a.json().id}`);
    assert.equal(found.json().total, 0);
  }));
test('I18N: locale preference is per user; stock and receipt arithmetic do not change', () =>
  measured('I18N-API', async () => {
    const before = (await request(owner, 'GET', '/api/me')).json().user.locale;
    assert.equal((await request(sales, 'PATCH', '/api/me/locale', { locale: 'ar' })).statusCode, 200);
    assert.equal((await request(owner, 'GET', '/api/me')).json().user.locale, before);
    const second = await login('sales');
    assert.equal((await request(second, 'GET', '/api/me')).json().user.locale, 'ar');
    const p = await product(3);
    let expectedTotal = 0;
    for (const locale of ['ar', 'fr', 'en']) {
      const sale = await request(sales, 'POST', '/api/sales', {
        warehouseId: counter,
        lines: [{ productId: p.id, quantity: 1 }],
        locale,
      });
      assert.equal(sale.statusCode, 200);
      assert.equal(sale.json().totalMinor, 12550);
      expectedTotal += sale.json().totalMinor;
      const receipt = await request(sales, 'GET', `/api/sales/${sale.json().id}`);
      assert.equal(receipt.json().locale, locale);
      assert.equal(receipt.json().lines[0].sku, p.data.sku);
    }
    assert.equal(expectedTotal, 37650);
    assert.equal((await balance(p.id)).on_hand, 0);
    for (const locale of ['ar', 'fr', 'en']) {
      const report = await request(auditor, 'GET', `/api/reports/stock.csv?locale=${locale}`);
      assert.equal(report.statusCode, 200);
      assert.ok(report.body.includes(p.data.sku));
    }
  }));
test('REL-01 bounded failure: thrown transaction rolls back; REL-03 outbox replay is deduplicated', () =>
  measured('REL-01-ROLLBACK-REL-03', async () => {
    const count = Number((await pool.query('SELECT count(*) FROM suppliers')).rows[0].count);
    await assert.rejects(
      transaction(pool, async (c) => {
        await c.query("INSERT INTO suppliers(org_id,name) VALUES($1,'Injected failure')", [ORG_ID]);
        throw new Error('Injected connection-independent failure');
      }),
    );
    assert.equal(Number((await pool.query('SELECT count(*) FROM suppliers')).rows[0].count), count);
    for (let i = 0; i < 10; i++) await processOutbox(pool);
    const duplicates = (
      await pool.query(
        'SELECT event_id,consumer,count(*) FROM event_deliveries GROUP BY event_id,consumer HAVING count(*)>1',
      )
    ).rows;
    assert.equal(duplicates.length, 0);
  }));
test('Final reconciliation: every balance equals immutable ledger in every condition', () =>
  measured('LEDGER-RECONCILIATION', async () => {
    const result = await request(owner, 'GET', '/api/inventory/reconciliation');
    assert.equal(result.statusCode, 200, result.body);
    assert.deepEqual(result.json(), { balanced: true, items: [] });
    assert.equal(
      (
        await pool.query(
          'SELECT count(*) FROM inventory_balances WHERE on_hand<0 OR reserved<0 OR reserved>on_hand OR quarantine<0 OR damaged<0',
        )
      ).rows[0].count,
      '0',
    );
  }));

test('DATA-01 / REL-02 staged import validates errors, resumes checkpoints, protects partial products and respects source revocation', () =>
  measured('DATA-01-REL-02-IMPORT', async () => {
    const base = (await product()).data;
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      ...base,
      sku: `BULK-${randomUUID()}-${i}`,
      status: 'ACTIVE_INTERNAL',
    }));
    const started = await request(owner, 'POST', '/api/bulk-imports', {
      sourceId,
      total: 1000,
      fileHash: hash(JSON.stringify(rows)),
    });
    assert.equal(started.statusCode, 200, started.body);
    const id = started.json().id;
    const key = randomUUID();
    const chunk = { offset: 0, rows };
    assert.equal(
      (await request(owner, 'POST', `/api/bulk-imports/${id}/chunks`, chunk, key)).statusCode,
      200,
    );
    assert.equal(
      (await request(owner, 'POST', `/api/bulk-imports/${id}/chunks`, chunk, key)).json().uploaded,
      1000,
    );
    assert.equal((await request(owner, 'POST', `/api/bulk-imports/${id}/validate`, {})).json().valid, true);
    assert.equal((await request(sales, 'POST', `/api/bulk-imports/${id}/commit`, {})).statusCode, 403);
    assert.equal((await request(owner, 'POST', `/api/bulk-imports/${id}/commit`, {})).statusCode, 200);
    assert.equal((await processImportChunk(pool)).processed, 500);
    assert.equal(
      (await pool.query('SELECT processed FROM bulk_import_jobs WHERE id=$1', [id])).rows[0].processed,
      500,
    );
    const half = (
      await pool.query(
        'SELECT p.* FROM products p JOIN bulk_import_rows r ON r.product_id=p.id WHERE r.job_id=$1 LIMIT 1',
        [id],
      )
    ).rows[0];
    assert.equal(half.status, 'DRAFT');
    await assert.rejects(
      pool.query("UPDATE products SET names='{}' WHERE id=$1", [half.id]),
      /IMPORT_IN_PROGRESS/,
    );
    await pool.query('UPDATE sources SET can_store=false WHERE id=$1', [sourceId]);
    assert.equal((await processImportChunk(pool)).paused, true);
    assert.equal((await request(owner, 'POST', `/api/bulk-imports/${id}/commit`, {})).statusCode, 409);
    assert.equal((await request(sales, 'GET', `/api/products/${half.id}`)).statusCode, 200);
    await pool.query('UPDATE sources SET can_store=true WHERE id=$1', [sourceId]);
    await request(owner, 'POST', `/api/bulk-imports/${id}/commit`, {});
    // A new worker invocation has no memory of the first half; the durable cursor is authoritative.
    assert.equal((await processImportChunk(pool)).done, true);
    assert.equal(
      (await pool.query('SELECT count(DISTINCT product_id) FROM bulk_import_rows WHERE job_id=$1', [id]))
        .rows[0].count,
      '1000',
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM products p JOIN bulk_import_rows r ON r.product_id=p.id WHERE r.job_id=$1 AND p.status='ACTIVE_INTERNAL'",
          [id],
        )
      ).rows[0].count,
      '1000',
    );
    assert.equal((await request(owner, 'POST', `/api/bulk-imports/${id}/revert`, {})).statusCode, 200);
    const invalid = [
      { ...base, sku: 'BAD-FORMULA', names: { en: '=CMD()', fr: '', ar: '' } },
      { ...base, sku: 'BAD-DUPLICATE' },
      { ...base, sku: 'BAD-DUPLICATE' },
      { ...base, sku: 'BAD-FIELD', vin: 'INVALID' },
    ];
    const bad = (
      await request(owner, 'POST', '/api/bulk-imports', {
        sourceId,
        total: 4,
        fileHash: hash(JSON.stringify(invalid)),
      })
    ).json().id;
    await request(owner, 'POST', `/api/bulk-imports/${bad}/chunks`, { offset: 0, rows: invalid });
    const validation = (await request(owner, 'POST', `/api/bulk-imports/${bad}/validate`, {})).json();
    assert.equal(validation.valid, false);
    assert.equal(validation.errorCount, 3);
    assert.equal((await request(owner, 'POST', `/api/bulk-imports/${bad}/commit`, {})).statusCode, 409);
  }));

test('Bins conserve physical stock under concurrent sale, transfer, retries and damage',()=>measured('INV-BINS',async()=>{
 const p=await product(10);
 const first=(await request(owner,'GET',`/api/bins?warehouseId=${counter}&productId=${p.id}`)).json().items.find((b:any)=>b.isDefault);
 const second=await request(owner,'POST','/api/bins',{warehouseId:counter,code:'A-'+randomUUID().slice(0,8)});assert.equal(second.statusCode,200,second.body);const target=second.json().id;
 const body={productId:p.id,warehouseId:counter,fromBinId:first.id,toBinId:target,quantity:10,condition:'SELLABLE',reason:'Synthetic storage relocation'};
 const results=await Promise.all([request(owner,'POST','/api/inventory/bin-transfers',body),request(sales,'POST','/api/sales',{warehouseId:counter,lines:[{productId:p.id,quantity:1}],locale:'ar'})]);assert.equal(results[1]!.statusCode,200,results[1]!.body);assert.ok([200,409].includes(results[0]!.statusCode));assert.equal((await balance(p.id)).on_hand,9);
 const bad=await request(owner,'POST','/api/inventory/bin-transfers',{...body,quantity:999});assert.equal(bad.statusCode,409);
 assert.equal((await request(sales,'POST','/api/bins',{warehouseId:counter,code:'DENIED'})).statusCode,403);
 const key=randomUUID(),receipt={productId:p.id,warehouseId:counter,binId:target,quantity:2,unit:'PCS',condition:'DAMAGED',reference:'DAMAGED-'+randomUUID()};
 await request(owner,'POST','/api/inventory/receipts',receipt,key);await request(owner,'POST','/api/inventory/receipts',receipt,key);
 const targetBalance=(await request(owner,'GET',`/api/bins?warehouseId=${counter}&productId=${p.id}`)).json().items.find((b:any)=>b.id===target);assert.equal(targetBalance.damaged,2);assert.equal((await balance(p.id)).damaged,2);
 assert.equal((await request(owner,'GET','/api/bins/reconciliation')).json().balanced,true);
 assert.equal((await request(owner,'GET','/api/inventory/reconciliation')).json().balanced,true);
 await assert.rejects(pool.query('UPDATE bin_movements SET damaged_delta=999 WHERE product_id=$1',[p.id]),/IMMUTABLE_RECORD/);
}));

test('Translation approval records exact content and becomes invalid when content changes',()=>measured('I18N-CONTENT-REVIEW',async()=>{
 const p=await product();const body={locale:'ar',version:1,note:'Synthetic test reviewer inspected this exact Arabic description.'};
 assert.equal((await request(sales,'POST',`/api/products/${p.id}/translations/review`,body)).statusCode,403);
 const review=await request(owner,'POST',`/api/products/${p.id}/translations/review`,body);assert.equal(review.statusCode,200,review.body);
 const read=(await request(owner,'GET',`/api/products/${p.id}`)).json();assert.equal(read.translationStatus.ar,'APPROVED');
 assert.equal((await request(owner,'POST',`/api/products/${p.id}/translations/review`,body)).statusCode,409);
 assert.equal((await request(owner,'POST',`/api/products/${p.id}/update`,{...p.data,version:2,names:{...p.data.names,ar:'وصف تجريبي جديد'}})).statusCode,200);
 assert.equal((await request(owner,'GET',`/api/products/${p.id}`)).json().translationStatus.ar,'REVIEW_REQUIRED');
 const rows=(await pool.query('SELECT * FROM translation_reviews WHERE product_id=$1',[p.id])).rows;assert.equal(rows.length,1);assert.equal(rows[0].reviewer_id,owner.id);assert.equal(rows[0].content_hash.length,64);
 await assert.rejects(pool.query("UPDATE translation_reviews SET note='tampered' WHERE product_id=$1",[p.id]),/IMMUTABLE_RECORD/);
}));

test('Quotes do not reserve stock; exact tax snapshots survive locale changes and stale cart totals cannot sell',()=>measured('QUOTES-TAX',async()=>{
 const p=await product(5,{priceMinor:25});const pricing=(await request(owner,'GET','/api/pricing')).json();
 assert.equal((await request(sales,'POST','/api/settings/tax',{rateBps:2000,inclusive:false,configured:true,version:pricing.version})).statusCode,403);
 assert.equal((await request(owner,'POST','/api/settings/tax',{rateBps:2000,inclusive:false,configured:true,version:pricing.version})).statusCode,200);
 const key=randomUUID(),body={warehouseId:counter,locale:'fr',lines:[{productId:p.id,quantity:3}]};const quote=await request(sales,'POST','/api/quotes',body,key);assert.equal(quote.statusCode,200,quote.body);assert.equal(quote.json().totalMinor,90);assert.equal(quote.json().taxMinor,15);assert.equal((await request(sales,'POST','/api/quotes',body,key)).json().id,quote.json().id);assert.equal((await balance(p.id)).reserved,0);assert.equal((await balance(p.id)).on_hand,5);
 assert.equal((await request(sales,'POST',`/api/quotes/${quote.json().id}/cancel`,{})).statusCode,200);
 assert.equal((await request(sales,'POST','/api/sales',{...body,expectedTotalMinor:75})).json().code,'PRICE_CHANGED');assert.equal((await balance(p.id)).on_hand,5);
 const sale=await request(sales,'POST','/api/sales',{...body,locale:'ar',expectedTotalMinor:90});assert.equal(sale.statusCode,200,sale.body);assert.equal(sale.json().subtotalMinor,75);assert.equal(sale.json().totalMinor,90);assert.equal((await balance(p.id)).on_hand,2);
 const tax=(await request(owner,'GET','/api/pricing')).json();await request(owner,'POST','/api/settings/tax',{rateBps:0,inclusive:false,configured:false,version:tax.version});
 const receipt=(await request(sales,'GET',`/api/sales/${sale.json().id}`)).json();assert.equal(receipt.taxMinor,15);assert.equal(receipt.taxRateBps,2000);assert.equal(receipt.totalMinor,90);
}));

test('Invitations are one-use, require privileged MFA and disabling access revokes current and future sessions',()=>measured('SEC-ONBOARDING',async()=>{
 const email=`invited-${randomUUID()}@demo.local`,inv=await request(owner,'POST','/api/staff/invitations',{email,name:'Synthetic invited manager',role:'manager',warehouseIds:[counter]});assert.equal(inv.statusCode,200);
 const token=inv.json().token;const info=await app.inject({method:'POST',url:'/api/auth/invitation-info',payload:{token}});assert.equal(info.json().email,email);
 const body={token,password:process.env.DEMO_PASSWORD!,locale:'ar'};assert.equal((await app.inject({method:'POST',url:'/api/auth/accept-invitation',payload:body})).json().code,'MFA_REQUIRED');
 const accepted=await app.inject({method:'POST',url:'/api/auth/accept-invitation',payload:{...body,mfaSecret:process.env.DEMO_TOTP_SECRET!,totp:totp(process.env.DEMO_TOTP_SECRET!)}});assert.equal(accepted.statusCode,200,accepted.body);
 assert.equal((await app.inject({method:'POST',url:'/api/auth/accept-invitation',payload:body})).json().code,'INVITATION_INVALID');
 const signed=await app.inject({method:'POST',url:'/api/auth/login',payload:{email,password:process.env.DEMO_PASSWORD!,totp:totp(process.env.DEMO_TOTP_SECRET!)}});assert.equal(signed.statusCode,200);assert.equal(signed.json().user.locale,'ar');
 const member={cookie:String(signed.headers['set-cookie']).split(';')[0]!,csrf:signed.json().csrfToken,id:signed.json().user.id};assert.equal((await request(owner,'POST',`/api/staff/${member.id}/access`,{active:false})).statusCode,200);assert.equal((await request(member,'GET','/api/me')).statusCode,401);assert.equal((await app.inject({method:'POST',url:'/api/auth/login',payload:{email,password:process.env.DEMO_PASSWORD!}})).statusCode,401);
}));
