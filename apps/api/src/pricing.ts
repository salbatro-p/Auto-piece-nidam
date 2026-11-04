import type {Pool,PoolClient} from 'pg';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {type AuthedRequest,requirePermission} from './auth.js';
import {DomainError,warehouseScope} from './db.js';
import {mutation} from './inventory.js';
import {priceTotals,type TaxSettings} from '../../../packages/contracts/src/pricing.js';
export async function readTax(c:Pool|PoolClient,orgId:string,lock=false):Promise<TaxSettings>{return (await c.query('SELECT tax_rate_bps AS "rateBps",tax_inclusive AS inclusive,tax_configured AS configured,tax_version AS version FROM organizations WHERE id=$1'+(lock?' FOR SHARE':''),[orgId])).rows[0];}
export function registerPricing(app:FastifyInstance,pool:Pool){
 app.get('/api/pricing',request=>readTax(pool,(request as AuthedRequest).actor.org_id));
 mutation(app,pool,'/api/settings/tax','staff',z.object({rateBps:z.number().int().min(0).max(10000),inclusive:z.boolean(),configured:z.boolean(),version:z.number().int().positive()}).strict(),async(c,actor,d)=>{
  const updated=await c.query('UPDATE organizations SET tax_rate_bps=$2,tax_inclusive=$3,tax_configured=$4,tax_version=tax_version+1 WHERE id=$1 AND tax_version=$5 RETURNING tax_version AS version',[actor.org_id,d.rateBps,d.inclusive,d.configured,d.version]);if(!updated.rowCount)throw new DomainError('EDIT_CONFLICT',409);return updated.rows[0];
 });
 mutation(app,pool,'/api/quotes','sell',z.object({warehouseId:z.string().uuid(),locale:z.enum(['ar','fr','en']),reference:z.string().max(200).default(''),lines:z.array(z.object({productId:z.string().uuid(),quantity:z.number().int().min(1).max(1000000)}).strict()).min(1).max(100).refine(lines=>new Set(lines.map(l=>l.productId)).size===lines.length),validHours:z.number().int().min(1).max(168).default(24)}).strict(),async(c,actor,d)=>{
  warehouseScope(actor,d.warehouseId);if(!(await c.query('SELECT id FROM warehouses WHERE id=$1 AND org_id=$2',[d.warehouseId,actor.org_id])).rowCount)throw new DomainError('NOT_FOUND',404);
  const products=(await c.query("SELECT id,sku,names,price_minor FROM products WHERE org_id=$1 AND id=ANY($2::uuid[]) AND status='ACTIVE_INTERNAL' ORDER BY id FOR SHARE",[actor.org_id,d.lines.map((l:any)=>l.productId)])).rows;if(products.length!==d.lines.length)throw new DomainError('PRODUCT_NOT_ACTIVE',409);
  const tax=await readTax(c,actor.org_id,true),lines=d.lines.map((l:any)=>{const p=products.find(p=>p.id===l.productId)!;return {...l,sku:p.sku,names:p.names,priceMinor:Number(p.price_minor)};}),data={lines,...priceTotals(lines,tax),taxRateBps:tax.rateBps,taxInclusive:tax.inclusive,taxConfigured:tax.configured};
  const row=(await c.query("INSERT INTO quotes(org_id,warehouse_id,actor_id,locale,reference,data,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+$7*interval '1 hour') RETURNING id,status,created_at AS \"createdAt\",expires_at AS \"expiresAt\"",[actor.org_id,d.warehouseId,actor.id,d.locale,d.reference,JSON.stringify(data),d.validHours])).rows[0];return {...row,...data,reference:d.reference,kind:'QUOTE'};
 });
 app.get('/api/quotes',async request=>{const actor=(request as AuthedRequest).actor;requirePermission(actor,'sell');return {items:(await pool.query('SELECT id,status,reference,created_at AS "createdAt",expires_at AS "expiresAt",data FROM quotes WHERE org_id=$1 AND (cardinality($2::uuid[])=0 OR warehouse_id=ANY($2::uuid[])) ORDER BY created_at DESC LIMIT 100',[actor.org_id,actor.warehouse_ids])).rows.map(({data,...q})=>({...q,...data,kind:'QUOTE'}))};});
 mutation(app,pool,'/api/quotes/:id/cancel','sell',z.object({}).strict(),async(c,actor,_d,req)=>{const id=z.string().uuid().parse((req.params as any).id),quote=(await c.query('SELECT warehouse_id FROM quotes WHERE id=$1 AND org_id=$2 FOR UPDATE',[id,actor.org_id])).rows[0];if(!quote)throw new DomainError('NOT_FOUND',404);warehouseScope(actor,quote.warehouse_id);await c.query("UPDATE quotes SET status='CANCELLED' WHERE id=$1",[id]);return {id,status:'CANCELLED'};});
}
