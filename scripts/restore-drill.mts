import { Pool } from 'pg';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { createApp } from '../apps/api/src/app.js';
import {readMediaObject} from '../apps/api/src/media-store.js';
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
  'media_source_licenses',
  'media_reviews',
  'fitment_evidence',
  'image_ingest_jobs',
  'image_ingest_rows',
  'warehouse_bins',
  'bin_balances',
  'bin_movements',
  'bulk_import_jobs',
  'bulk_import_rows',
  'translation_reviews',
  'quotes',
  'manufacturers',
  'manufacturer_parts',
  'product_replacements',
  'organizations',
  'warehouses',
  'staff_users',
  'invitations',
  'sources',
  'vehicles',
  'fitments',
  'suppliers',
  'supplier_items',
  'purchase_orders',
  'purchase_lines',
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
const mediaRoot=file+'.media';
const mediaObjects=(await snapshot.query('SELECT object_key,display_key,thumbnail_key FROM product_media WHERE object_key IS NOT NULL')).rows;
const mediaFiles:Record<string,{bytes:number;sha256:string}>={};
for(const key of new Set<string>(mediaObjects.flatMap(row=>[row.object_key,row.display_key,row.thumbnail_key]).filter(Boolean))){
 if(!/^[a-f0-9]{64}\/(source|display|thumbnail)\.webp$/.test(key))throw new Error('Invalid private media key in backup');
 const bytes=await readMediaObject(key);await mkdir(join(mediaRoot,key.split('/')[0]),{recursive:true});await writeFile(join(mediaRoot,key),bytes,{mode:0o600});
 mediaFiles[key]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
await writeFile(mediaRoot+'.manifest.json',JSON.stringify(mediaFiles,null,2),{mode:0o600});
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
process.env.MEDIA_STORAGE_DIR=mediaRoot;
let mediaFilesIdentical=true;
for(const [key,expected] of Object.entries(mediaFiles)){const bytes=await readMediaObject(key);if(bytes.length!==expected.bytes||createHash('sha256').update(bytes).digest('hex')!==expected.sha256)mediaFilesIdentical=false;}
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
const approvedPhoto=(await restored.query('SELECT id FROM usable_internal_media LIMIT 1')).rows[0];
const restoredMediaResponse=approvedPhoto?await app.inject({url:'/api/media/'+approvedPhoto.id+'?size=thumbnail',headers:{cookie}}):undefined;
const restoredMediaPass=!!restoredMediaResponse&&restoredMediaResponse.statusCode===200&&restoredMediaResponse.headers['content-type']==='image/webp';
const reconciliation = (
  await app.inject({ url: '/api/inventory/reconciliation', headers: { cookie: auditCookie } })
).json();
const binReconciliation = (
  await app.inject({ url: '/api/bins/reconciliation', headers: { cookie: auditCookie } })
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
  privateMedia:{objects:Object.keys(mediaFiles).length,totalBytes:Object.values(mediaFiles).reduce((sum,v)=>sum+v.bytes,0),allFileHashesMatch:mediaFilesIdentical,approvedThumbnailAfterRestore:restoredMediaPass,manifest:mediaFiles},
  businessFlow: {
    saleStatus: sale.statusCode,
    replayStatus: replay.statusCode,
    exactlyOneDeduction: flowPass,
  },
  reconciliation,
  binReconciliation,
  pass: identical && flowPass && mediaFilesIdentical && restoredMediaPass && reconciliation.balanced === true && binReconciliation.balanced === true,
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
