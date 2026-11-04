import { Pool } from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem, platform } from 'node:os';
import { randomUUID } from 'node:crypto';
import { migrate } from '../apps/api/src/migrate.js';
import { seed } from '../apps/api/src/seed.js';
import { createApp } from '../apps/api/src/app.js';
import { totp } from '../apps/api/src/auth.js';
if (process.env.DEMO_MODE !== 'true') throw new Error('Isolated demo mode required');
const base = new URL(process.env.DATABASE_URL!);
if (!['127.0.0.1', 'localhost'].includes(base.hostname))
  throw new Error('Benchmark requires local isolated PostgreSQL');
const admin = new Pool({ connectionString: base.href });
const database = 'autoparts_load_' + Date.now();
await admin.query('CREATE DATABASE ' + database);
base.pathname = '/' + database;
const pool = new Pool({ connectionString: base.href, max: 40 });
await mkdir('docs/evidence', { recursive: true });
const report: any = {
  date: new Date().toISOString(),
  database,
  environment: {
    node: process.version,
    platform: platform(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    transport: 'Fastify inject (real PostgreSQL; no TCP or WAN latency)',
    profiles: 'Host machine, unthrottled. Not Android/device measurements.',
  },
  fixtures: { products: 100000, vehicles: 10000, fitments: 1000000, warehouses: 3 },
  scenarios: [],
};
const started = performance.now();
await migrate(pool);
await seed(pool);
await pool.query(
  "CREATE FUNCTION load_uuid(text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT overlay(overlay(md5($1) placing '4' from 13) placing '8' from 17)::uuid $$",
);
const org = '00000000-0000-4000-8000-000000000001';
const owner = (await pool.query("SELECT id FROM staff_users WHERE role='owner'")).rows[0].id;
const source = (await pool.query('SELECT id FROM sources LIMIT 1')).rows[0].id;
const wh = (await pool.query("SELECT id FROM warehouses WHERE code='CAS'")).rows[0].id;
const wh2 = (await pool.query("SELECT id FROM warehouses WHERE code='DEP'")).rows[0].id;
const wh3 = (await pool.query("SELECT id FROM warehouses WHERE code='RAB'")).rows[0].id;
console.log('Seeding 100k synthetic SKUs / 10k variants / 1m synthetic fitment links in ' + database);
await pool.query(
  "INSERT INTO products(id,org_id,sku,names,descriptions,brand,oem,barcode,category,pack_size,price_minor,cost_minor,status,source_id,search_text) SELECT load_uuid('load-product-'||n)::uuid,$1,'SYN-'||lpad(n::text,6,'0'),jsonb_build_object('en','Synthetic part '||n,'fr','Pièce synthétique '||n,'ar','قطعة اصطناعية '||n),'{}','SYNTHETIC','SYN-OE-'||n,'990'||lpad(n::text,10,'0'),'filters',10,8900,4500,'ACTIVE_INTERNAL',$2,'syn'||lpad(n::text,6,'0')||'synoe'||n||'synthetic' FROM generate_series(1,99994) n",
  [org, source],
);
await pool.query(
  "INSERT INTO vehicles(id,org_id,make,model,generation,market,year_from,year_to,engine,fuel,transmission,body,source_id,external_id) SELECT load_uuid('load-vehicle-'||n)::uuid,$1,'SYNTHETIC','Model '||(n%100),'Gen '||(n%10),'SYN',2000,2025,'SYN-ENGINE-'||n,'DIESEL','MANUAL','HATCHBACK',$2,'SYN-'||n FROM generate_series(1,9999) n",
  [org, source],
);
await pool.query(
  "INSERT INTO fitments(product_id,vehicle_id,status,evidence,source_id,qualifiers,reviewed_by,reviewed_at) SELECT p.id,load_uuid('load-vehicle-'||((n*10+j)%9999+1))::uuid,'VERIFIED','Synthetic benchmark relationship only, never real fitment',$1,'Synthetic test fixture only',$2,now() FROM generate_series(1,99994) n CROSS JOIN generate_series(0,9) j JOIN products p ON p.id=load_uuid('load-product-'||n)::uuid",
  [source, owner],
);
await pool.query(
  "INSERT INTO fitments(product_id,vehicle_id,status,evidence,source_id,qualifiers,reviewed_by,reviewed_at) SELECT load_uuid('load-product-'||n)::uuid,load_uuid('load-vehicle-9999')::uuid,'VERIFIED','Synthetic benchmark supplemental link only',$1,'Synthetic only',$2,now() FROM generate_series(1,54) n ON CONFLICT DO NOTHING",
  [source, owner],
);
await pool.query(
  "INSERT INTO inventory_balances(org_id,product_id,warehouse_id,on_hand) SELECT $1,id,CASE WHEN sku LIKE 'SYN-%' AND substring(sku from 5)::integer%3=1 THEN $3::uuid WHEN sku LIKE 'SYN-%' AND substring(sku from 5)::integer%3=2 THEN $4::uuid ELSE $2::uuid END,100 FROM products WHERE sku LIKE 'SYN-%'",
  [org, wh, wh2, wh3],
);
const doc = randomUUID();
await pool.query(
  "INSERT INTO business_documents(id,org_id,kind,actor_id,data) VALUES($1,$2,'OPENING_BALANCE',$3,'{\"syntheticLoadFixture\":true}')",
  [doc, org, owner],
);
await pool.query(
  "INSERT INTO stock_movements(org_id,document_id,product_id,warehouse_id,kind,on_hand_delta,actor_id,request_id) SELECT org_id,$1,product_id,warehouse_id,'OPENING_BALANCE',on_hand,$2,'synthetic-benchmark-seed' FROM inventory_balances WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'SYN-%')",
  [doc, owner],
);
await pool.query('ANALYZE');
report.seedMilliseconds = performance.now() - started;
report.actualCounts = (
  await pool.query(
    'SELECT (SELECT count(*) FROM products)::int products,(SELECT count(*) FROM vehicles)::int vehicles,(SELECT count(*) FROM fitments)::int fitments,(SELECT count(*) FROM warehouses)::int warehouses',
  )
).rows[0];
report.environment.postgresql = (await pool.query('SELECT version()')).rows[0].version;
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
if (login.statusCode !== 200) throw new Error('Benchmark login failed ' + login.body);
const csrf = login.json().csrfToken;
const cookie = String(login.headers['set-cookie']).split(';')[0];
async function scenario(
  name: string,
  rate: number,
  seconds: number,
  target: number,
  request: (i: number) => any,
) {
  const times: number[] = [];
  const statuses: Record<number, number> = {};
  const start = performance.now();
  const tasks = [];
  for (let i = 0; i < rate * seconds; i++) {
    const delay = start + (i * 1000) / rate - performance.now();
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    tasks.push(
      (async () => {
        const t = performance.now();
        const response = await app.inject({
          ...request(i),
          remoteAddress: '127.0.1.' + ((i % 10) + 1),
          headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID() },
        });
        times.push(performance.now() - t);
        statuses[response.statusCode] = (statuses[response.statusCode] ?? 0) + 1;
      })(),
    );
  }
  await Promise.all(tasks);
  times.sort((a, b) => a - b);
  const quantile = (p: number) => +times[Math.ceil(times.length * p) - 1].toFixed(2);
  const result = {
    name,
    requests: times.length,
    requestedRate: rate,
    actualRate: times.length / ((performance.now() - start) / 1000),
    durationSeconds: (performance.now() - start) / 1000,
    p50: quantile(0.5),
    p95: quantile(0.95),
    p99: quantile(0.99),
    statuses,
    targetP95: target,
    pass: quantile(0.95) <= target && Object.keys(statuses).every((s) => s === '200'),
  };
  report.scenarios.push(result);
  console.log(JSON.stringify(result));
  await writeFile('docs/evidence/performance.json', JSON.stringify(report, null, 2));
}
const product = (await pool.query("SELECT id FROM products WHERE sku='SYN-000003'")).rows[0].id;
const vehicle = (await pool.query("SELECT id FROM vehicles WHERE external_id='SYN-2'")).rows[0].id;
await scenario('exact SKU search, initially unprimed application cache', 50, 20, 500, (i) => ({
  method: 'GET',
  url: '/api/products?q=SYN-' + String(1 + ((i * 97) % 99994)).padStart(6, '0'),
}));
await scenario('exact SKU repeated warm set', 50, 20, 500, (i) => ({
  method: 'GET',
  url: '/api/products?q=SYN-' + String(1 + (i % 50)).padStart(6, '0'),
}));
await scenario('variant verified fitment filter', 25, 20, 900, () => ({
  method: 'GET',
  url: '/api/products?vehicleId=' + vehicle,
}));
await scenario('product and stock read', 50, 20, 300, () => ({
  method: 'GET',
  url: '/api/products/' + product,
}));
await scenario('receipt writes, 20 per second', 20, 20, 800, (i) => ({
  method: 'POST',
  url: '/api/inventory/receipts',
  payload: {
    productId: product,
    warehouseId: wh,
    quantity: 1,
    unit: 'PCS',
    condition: 'SELLABLE',
    reference: 'LOAD-' + randomUUID(),
  },
}));
await scenario('dashboard', 2, 10, 1500, () => ({ method: 'GET', url: '/api/dashboard' }));
report.reconciliation = (
  await app.inject({ url: '/api/inventory/reconciliation', headers: { cookie } })
).json();
report.peakRSSBytes = process.resourceUsage().maxRSS * 1024;
report.queryPlan = (
  await pool.query(
    "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM products WHERE org_id=$1 AND search_text LIKE '%syn000003%' LIMIT 30",
    [org],
  )
).rows[0]['QUERY PLAN'];
report.limits = [
  'No slow network, Android hardware, saturation soak or cold OS disk cache measured.',
  '100k import resumability is a separate acceptance test; SQL fixture generation does not pass it.',
  'Database retained for inspection; no real customer/company data.',
];
await writeFile('docs/evidence/performance.json', JSON.stringify(report, null, 2));
await app.close();
await pool.end();
await admin.end();
console.log('Performance evidence saved. Dedicated benchmark database retained: ' + database);
