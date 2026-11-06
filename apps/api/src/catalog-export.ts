import {Readable} from 'node:stream';
import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import {type AuthedRequest,requirePermission} from './auth.js';
export const csvCell=(value:unknown)=>{let text=String(value??'');if(/^[\s]*[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
export function registerCatalogExport(app:FastifyInstance,pool:Pool){
 app.get('/api/reports/products.csv',async(request,reply)=>{
  const actor=(request as AuthedRequest).actor;requirePermission(actor,'catalog');
  const columns=['sku','brand','manufacturer_part_no','name_ar','name_fr','name_en','description_ar','description_fr','description_en','category_path','unit','pack_qty','oem_refs','ean_gtin','price_mad','cost_mad','supplier_ref','translation_review_status_ar','translation_review_status_fr','translation_review_status_en'];
  async function* rows(){
   const client=await pool.connect();try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='15s'");
    yield '\uFEFF'+columns.map(csvCell).join(',')+'\r\n';let cursor='00000000-0000-0000-0000-000000000000';
    while(true){const result=await client.query('SELECT p.*,m.part_number FROM products p LEFT JOIN manufacturer_parts m ON m.id=p.manufacturer_part_id WHERE p.org_id=$1 AND p.id>$2 ORDER BY p.id LIMIT 1000',[actor.org_id,cursor]);if(!result.rows.length)break;
     for(const p of result.rows){cursor=p.id;const values=[p.sku,p.brand,p.part_number,...['ar','fr','en'].map(l=>p.names[l]??''),...['ar','fr','en'].map(l=>p.descriptions[l]??''),p.category,'piece',p.pack_size,p.oem,p.barcode,(Number(p.price_minor)/100).toFixed(2),actor.permissions.includes('costs')?(Number(p.cost_minor)/100).toFixed(2):'',p.company_metadata?.supplierReference??'',...['ar','fr','en'].map(l=>p.translation_status[l]??'REVIEW_REQUIRED')];yield values.map(csvCell).join(',')+'\r\n';}
    }await client.query('COMMIT');
   }finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
  }
  reply.header('Content-Type','text/csv; charset=utf-8').header('Content-Disposition','attachment; filename="product-master-ar-fr-en.csv"');return reply.send(Readable.from(rows()));
 });
}
