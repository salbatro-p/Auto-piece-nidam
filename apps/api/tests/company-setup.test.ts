import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { seed } from '../src/seed.js';
import { prepareCompany } from '../src/setup-company.js';
import { totp } from '../src/auth.js';

test('A blank company can enroll one owner, open its receiving bins and invite staff without synthetic stock', async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(process.env.DEMO_MODE, 'true');
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
  const name = 'autoparts_company_test_' + process.pid + '_' + Date.now();
  url.pathname = '/postgres';
  const admin = new Pool({connectionString:url.href});
  await admin.query(`CREATE DATABASE "${name}"`);
  url.pathname = '/' + name;
  const pool = new Pool({connectionString:url.href});
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await migrate(pool);
    const setup = {database:name,company:'QA company',locale:'ar',owner:{name:'QA owner',email:'owner@example.invalid'},
      warehouses:[{code:'COUNTER',name:'Counter'},{code:'DEPOT',name:'Depot'}]};
    const token = () => randomBytes(32).toString('hex');
    const first = token(), second = token(), renewed = token();
    await assert.rejects(prepareCompany(pool,{...setup,database:'wrong'},token()), /does not match/);
    const race = await Promise.allSettled([prepareCompany(pool,setup,first),prepareCompany(pool,setup,second)]);
    assert.equal(race.filter(r => r.status === 'fulfilled').length,1);
    await assert.rejects(seed(pool), /refused/);
    await prepareCompany(pool,setup,renewed,true);
    app = await createApp(pool);
    const config = (await app.inject({url:'/api/config'})).json();
    assert.deepEqual(config,{defaultLocale:'ar',passwordOnlyLogin:false,demo:false});
    for (const old of [first,second]) {
      assert.equal((await app.inject({method:'POST',url:'/api/auth/invitation-info',payload:{token:old}})).statusCode,400);
    }
    const password = token(), secret = [...randomBytes(32)].map(b=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[b%32]).join('');
    const body = {token:renewed,locale:'fr',password};
    const activate = (extra: object) => app!.inject({method:'POST',url:'/api/auth/accept-invitation',payload:{...body,...extra}});
    assert.equal((await activate({})).json().code,'MFA_REQUIRED');
    const activation = {mfaSecret:secret,totp:totp(secret)};
    assert.equal((await activate(activation)).statusCode,200);
    assert.equal((await activate(activation)).json().code,'INVITATION_INVALID');
    await assert.rejects(prepareCompany(pool,setup,token(),true), /unclaimed/);
    const login = (otp: object) => app!.inject({method:'POST',url:'/api/auth/login',payload:{email:setup.owner.email,password,...otp}});
    assert.equal((await login({})).statusCode,401);
    const signed = await login({totp:totp(secret)});
    assert.equal(signed.statusCode,200);
    assert.equal(signed.json().user.companyName,setup.company);
    assert.equal(signed.json().user.demo,false);
    const headers = {cookie:String(signed.headers['set-cookie']).split(';')[0]!, 'x-csrf-token':signed.json().csrfToken,'idempotency-key':token()};
    const setupSteps = (await app.inject({url:'/api/workspace/company-setup',headers})).json().steps;
    assert.deepEqual(setupSteps,{staff:false,catalog:false,intake:false,tax:false});
    const bins = (await app.inject({url:'/api/bins',headers})).json().items;
    assert.equal(bins.length,2);
    assert.ok(bins.every((b:{isDefault:boolean})=>b.isDefault));
    const invite = await app.inject({method:'POST',url:'/api/staff/invitations',headers,
      payload:{email:'clerk@example.invalid',name:'QA clerk',role:'sales',warehouseIds:[bins[0].warehouseId]}});
    assert.equal(invite.statusCode,200);
    const products = (await app.inject({url:'/api/products',headers})).json();
    assert.equal(products.total,0);
    assert.equal((await pool.query('SELECT 1 FROM stock_movements LIMIT 1')).rowCount,0);
    assert.equal((await pool.query('SELECT 1 FROM sales LIMIT 1')).rowCount,0);
    assert.equal((await pool.query('SELECT 1 FROM staff_users')).rowCount,1);
  } finally {
    if (app) await app.close();
    await pool.end();
    try { await admin.query(`DROP DATABASE "${name}"`); } finally { await admin.end(); }
  }
});
