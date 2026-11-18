import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createApp } from '../apps/api/src/app.js';
import { totp } from '../apps/api/src/auth.js';

const url = new URL(process.env.DATABASE_URL ?? '');
const output = process.argv[2];
if (url.hostname !== '127.0.0.1' || url.port !== '55434' || url.pathname !== '/autoparts_https_pilot' ||
    url.username !== 'pilot_app' || process.env.NODE_ENV !== 'production' || process.env.DEMO_MODE !== 'false' ||
    !process.env.DEMO_PASSWORD || !process.env.DEMO_TOTP_SECRET || !output) {
  throw new Error('Use only the separate, freshly seeded local staging-rehearsal cluster.');
}
const origin = 'https://pilot.example.invalid';
process.env.APP_ORIGINS = origin;
let check = 'startup';
const checks: string[] = [];
const pool = new Pool({ connectionString: url.href });
let app: Awaited<ReturnType<typeof createApp>> | undefined;
type Session = { cookie: string; csrf: string };
try {
  const db = (await pool.query(
    "SELECT current_database() AS name, NOT rolsuper AS restricted FROM pg_roles WHERE rolname=current_user",
  )).rows[0];
  assert.deepEqual(db,{name:'autoparts_https_pilot',restricted:true});
  app = await createApp(pool);
  const headers = { origin };
  const call = (path: string, session?: Session, body?: object, key = randomUUID()) => app!.inject({
    url:path,
    method:body ? 'POST':'GET',
    headers:{ ...headers, ...(session ? {cookie:session.cookie,'x-csrf-token':session.csrf} : {}), 'idempotency-key':key },
    ...(body ? {payload:body}:{}),
  });
  const login = async (role: string, privileged = false): Promise<Session> => {
    const login = await call('/api/auth/login',undefined,{
      email:role+'@demo.local',password:process.env.DEMO_PASSWORD!,
      ...(privileged ? {totp:totp(process.env.DEMO_TOTP_SECRET!)} : {}),
    });
    assert.equal(login.statusCode,200);
    const cookie = String(login.headers['set-cookie']);
    assert.match(cookie,/; Secure(?:;|$)/i);
    assert.match(cookie,/; HttpOnly(?:;|$)/i);
    assert.match(cookie,/; SameSite=Strict(?:;|$)/i);
    return {cookie:cookie.split(';')[0]!,csrf:login.json().csrfToken};
  };

  check = 'production login policy';
  assert.equal((await call('/api/config')).json().passwordOnlyLogin,false);
  assert.equal((await call('/api/workspace/search?q=AP-FLT-001')).statusCode,401);
  assert.equal((await call('/api/auth/login',undefined,{
    email:'owner@demo.local',password:process.env.DEMO_PASSWORD!,
  })).json().code,'MFA_REQUIRED');
  check = 'owner MFA and secure session';
  const owner = await login('owner',true);
  check = 'employee sessions and permission boundaries';
  const counter = await login('sales');
  const warehouse = await login('warehouse');
  assert.equal((await call('/api/staff',counter)).statusCode,403);
  assert.equal((await call('/api/sales',warehouse,{})).statusCode,403);
  checks.push('Privileged MFA, secure cookies and staff permission boundaries');

  check = 'scope and duplicate-safe stock flow';
  const locations = (await call('/api/warehouses',counter)).json().items;
  assert.deepEqual(locations.map((w:{code:string})=>w.code),['CAS']);
  const warehouseId = locations[0].id;
  const sku = 'STAGE-QA-'+randomUUID().slice(0,8);
  const partNumber = sku+'-REF';
  const product = await call('/api/products',owner,{
    sku,names:{ar:'قطعة اختبار',fr:'Pièce de test',en:'Synthetic rehearsal part'},
    brand:'SYNTHETIC',manufacturerPartNo:partNumber,category:'filters',
    packSize:1,priceMinor:1499,costMinor:800,status:'ACTIVE_INTERNAL',
  });
  assert.equal(product.statusCode,200);
  const productId = product.json().id;
  const receipt = {productId,warehouseId,quantity:3,unit:'PCS',reference:sku+'-RECEIPT'};
  const receiptKey = randomUUID();
  const a = await call('/api/inventory/receipts',warehouse,receipt,receiptKey);
  const b = await call('/api/inventory/receipts',warehouse,receipt,receiptKey);
  assert.equal(a.statusCode,200);
  assert.deepEqual(a.json(),b.json());
  const sale = {warehouseId,lines:[{productId,quantity:1}],locale:'fr'};
  const saleKey = randomUUID();
  const first = await call('/api/sales',counter,sale,saleKey);
  assert.equal(first.statusCode,200);
  assert.deepEqual(first.json(),(await call('/api/sales',counter,sale,saleKey)).json());
  const stock = (await call('/api/products/'+productId,counter)).json().stock[0];
  assert.equal(stock.onHand,2);
  assert.equal((await call('/api/sales/'+first.json().id,counter)).statusCode,200);
  checks.push('Warehouse scope, receipt and sale replay, and one stock deduction');

  check = 'independent count review';
  const counted = await call('/api/inventory/counts',warehouse,{
    productId,warehouseId,counted:2,reason:'Synthetic pilot reconciliation',
  });
  assert.equal(counted.statusCode,200);
  assert.equal((await call('/api/inventory/counts/'+counted.json().id+'/approve',owner,{})).statusCode,200);
  assert.equal((await call('/api/inventory/reconciliation',owner)).json().balanced,true);
  assert.equal((await call('/api/bins/reconciliation',owner)).json().balanced,true);
  checks.push('Count approval and both inventory reconciliations');

  check = 'private media';
  const license = await call('/api/media/licenses',owner,{
    name:'Staging rehearsal fixture',sourceType:'COMPANY',termsVersion:'QA',
    proof:'Synthetic pixels generated for isolated staging test only.',
    internalDisplayPermitted:true,publicDisplayPermitted:false,
  });
  assert.equal(license.statusCode,200);
  const blank = await sharp({create:{height:480,width:640,channels:3,background:'#245b70'}}).png().toBuffer();
  const media = await call('/api/media/stage',owner,{
    productId,kind:'COMPANY_ORIGINAL_PHOTO',sku,manufacturerBrand:'SYNTHETIC',manufacturerPartNumber:partNumber,
    licenseId:license.json().id,mime:'image/png',data:blank.toString('base64'),
  });
  assert.equal(media.statusCode,200);
  assert.equal(media.json().state,'REVIEW_REQUIRED');
  const id = media.json().id;
  assert.equal((await call('/api/media/'+id+'/review',owner,{
    version:1,state:'APPROVED_INTERNAL',note:'Synthetic test image and reference reviewed.',
    physicalMatchConfirmed:true,applicabilityConfirmed:true,
  })).statusCode,200);
  assert.equal((await call('/api/media/'+id+'?size=thumbnail',counter)).headers['content-type'],'image/webp');
  assert.equal((await call('/api/media/'+id)).statusCode,401);
  assert.equal((await pool.query('SELECT 1 FROM usable_public_media WHERE id=$1',[id])).rowCount,0);
  checks.push('Protected photo upload, review and thumbnail, and public rights denial');

  for (const session of [owner,counter,warehouse]) assert.equal((await call('/api/auth/logout',session,{})).statusCode,200);
  const report = {date:new Date().toISOString(),revision:'39a4197',scope:'Fastify production-mode injection with separate native PostgreSQL, not hosted HTTPS.',checks,passed:true};
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({passed:true,checks}));
} catch {
  console.error(JSON.stringify({passed:false,check}));
  process.exitCode = 1;
} finally {
  await app?.close();
  await pool.end();
}
