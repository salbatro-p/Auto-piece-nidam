import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { totp } from '../apps/api/src/auth.js';

// Disposable CI stack only. The trust root is supplied before Node starts.
if (process.env.GITHUB_ACTIONS !== 'true' || !process.env.RUNNER_TEMP || !process.env.NODE_EXTRA_CA_CERTS)
  throw new Error('Use the isolated company-stack CI job');
const dir = process.env.RUNNER_TEMP;
const base = 'https://localhost';
const call = async (route: string, body?: object, headers: Record<string,string> = {}) => {
  const response = await fetch(base+'/api'+route, {method:body?'POST':'GET',headers:{origin:base,
    ...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
  return {response, data:await response.json()};
};
if (process.argv.includes('--after-restart')) {
  const {id,headers} = JSON.parse(await readFile(dir+'/company-session.json','utf8'));
  const sale = await call('/sales/'+id, undefined, headers);
  assert.equal(sale.response.status,200); assert.equal(sale.data.totalMinor,4200);
  assert.equal((await call('/me',undefined,headers)).data.user.companyName,'QA Atelier');
  console.log('Restored service on trusted HTTPS. Session, company identity and receipt verified.');
} else {
  const config = await call('/config');
  assert.deepEqual(config.data,{defaultLocale:'fr',passwordOnlyLogin:false,demo:false});
  assert.equal((await call('/products')).response.status,401);
  const ticket=(await readFile(dir+'/company-ticket','utf8')).trim();
  const password=randomBytes(24).toString('hex');
  const secret=[...randomBytes(32)].map(b=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[b%32]).join('');
  const owner={email:'operator@example.invalid',password};
  assert.equal((await call('/auth/accept-invitation',{token:ticket,password,locale:'ar',totp:totp(secret),mfaSecret:secret})).response.status,200);
  assert.equal((await call('/auth/login',owner)).data.code,'MFA_REQUIRED');
  const signed=await call('/auth/login',{...owner,totp:totp(secret)});
  assert.equal(signed.response.status,200);
  const cookie=signed.response.headers.get('set-cookie')!;
  assert.match(cookie,/; Secure/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
  const headers={cookie:cookie.split(';')[0]!, 'x-csrf-token':signed.data.csrfToken};
  const post=(url:string,data:object,key=randomUUID())=>call(url,data,{...headers,'idempotency-key':key});
  const product=await post('/products',{sku:'QA-001',brand:'SYNTHETIC',manufacturerPartNo:'QA-FILTER',names:{en:'Test filter',ar:'مرشح تجريبي',fr:'Filtre test'},
    category:'filters',packSize:1,priceMinor:4200,costMinor:2000,status:'ACTIVE_INTERNAL'});
  assert.equal(product.response.status,200);
  const productId=product.data.id;
  const warehouseId=(await call('/warehouses',undefined,headers)).data.items[0].id;
  const received=await post('/inventory/receipts',{warehouseId,productId,quantity:4,unit:'PCS',reference:'QA-RECEIPT'});
  assert.equal(received.response.status,200);
  const key=randomUUID(), body={warehouseId,locale:'ar',lines:[{productId,quantity:1}]};
  const sold=await post('/sales',body,key);assert.equal(sold.response.status,200);
  const replay=await post('/sales',body,key);assert.equal(replay.data.id,sold.data.id);
  const stock=(await call('/products/'+productId,undefined,headers)).data.stock;
  assert.equal(stock.find((s:{warehouseId:string})=>s.warehouseId===warehouseId).available,3);
  const license=await post('/media/licenses',{name:'QA fixture',sourceType:'COMPANY',termsVersion:'QA',
    proof:'Synthetic image for isolated recovery testing only.',internalDisplayPermitted:true,publicDisplayPermitted:false});
  assert.equal(license.response.status,200);
  const fixture=await sharp({create:{width:640,height:480,channels:3,background:'#745927'}}).png().toBuffer();
  const image=await post('/media/stage',{productId,kind:'COMPANY_ORIGINAL_PHOTO',sku:'QA-001',manufacturerBrand:'SYNTHETIC',
    manufacturerPartNumber:'QA-FILTER',licenseId:license.data.id,mime:'image/png',data:fixture.toString('base64')});
  assert.equal(image.response.status,200);
  assert.equal(image.data.state,'REVIEW_REQUIRED');
  await writeFile(dir+'/company-session.json',JSON.stringify({id:sold.data.id,headers}),{mode:0o600});
  console.log('Verified first-owner MFA, secure session, receipt replay, available stock and anonymous access policy over trusted HTTPS.');
}
