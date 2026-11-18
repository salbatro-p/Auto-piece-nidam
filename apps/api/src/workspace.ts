import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { requirePermission, type AuthedRequest } from './auth.js';
import { DomainError, normalize } from './db.js';

export function registerWorkspace(app: FastifyInstance, pool: Pool) {
  app.get('/api/workspace/identifiers',async request => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor,'catalog');
    const raw = (request.query as {id?: unknown}).id;
    const values = z.array(z.string().trim().min(2).max(120)).min(1).max(4).parse(Array.isArray(raw) ? raw : [raw]);
    const keys = [...new Set(values.map(normalize).filter(Boolean))];
    const result = await pool.query(
      `SELECT DISTINCT p.id,p.sku FROM product_identifiers i JOIN products p ON p.id=i.product_id
       WHERE p.org_id=$1 AND i.normalized_value=ANY($2::text[]) ORDER BY p.sku LIMIT 12`,[actor.org_id,keys],
    );
    return {items:result.rows};
  });
  app.get('/api/workspace/attention', async request => {
    const actor = (request as AuthedRequest).actor;
    const has = (permission: string) => actor.permissions.includes(permission);
    const scope = [actor.org_id,actor.warehouse_ids];
    const [deliveries,counts,missingPhotos,imports] = await Promise.all([
      has('purchases') ? pool.query(
        "SELECT count(*)::int AS total FROM purchase_orders WHERE org_id=$1 AND status IN ('ORDERED','PART_RECEIVED') AND (cardinality($2::uuid[])=0 OR warehouse_id=ANY($2::uuid[]))",scope,
      ) : undefined,
      has('approve') || has('counts') ? pool.query(
        "SELECT count(*)::int AS total FROM stock_counts WHERE org_id=$1 AND status='PENDING' AND (cardinality($2::uuid[])=0 OR warehouse_id=ANY($2::uuid[]))",scope,
      ) : undefined,
      has('catalog') ? pool.query(
        `SELECT count(*)::int AS total FROM products p
         WHERE p.org_id=$1 AND p.status<>'ARCHIVED'
         AND EXISTS(SELECT 1 FROM inventory_balances b WHERE b.product_id=p.id AND b.org_id=$1
           AND (b.on_hand+b.damaged+b.quarantine)>0 AND (cardinality($2::uuid[])=0 OR b.warehouse_id=ANY($2::uuid[])))
         AND NOT EXISTS(SELECT 1 FROM usable_internal_media m WHERE m.product_id=p.id AND m.kind IN ('EXACT_PRODUCT_PHOTO','COMPANY_ORIGINAL_PHOTO'))`,scope,
      ) : undefined,
      has('imports') ? pool.query(
        `SELECT ((SELECT count(*) FROM bulk_import_jobs WHERE org_id=$1 AND status IN ('PREVIEW','PAUSED','INVALID'))+
                 (SELECT count(*) FROM catalog_feed_jobs WHERE org_id=$1 AND state IN ('STAGED','PAUSED'))+
                 (SELECT count(*) FROM import_jobs WHERE org_id=$1 AND status='PREVIEW'))::int AS total`,[actor.org_id],
      ) : undefined,
    ]);
    return {
      pendingDeliveries: deliveries?.rows[0].total ?? null,
      pendingCounts: counts?.rows[0].total ?? null,
      missingPhoto: missingPhotos?.rows[0].total ?? null,
      pendingImports: imports?.rows[0].total ?? null,
    };
  });
  app.get('/api/workspace/search', async request => {
    const actor = (request as AuthedRequest).actor;
    const { q } = z.object({ q: z.string().trim().min(2).max(120) }).strict().parse(request.query);
    const term = normalize(q);
    if (term.length < 2) return { parts: [], vehicles: [], suppliers: [], locations: [], categories: [] };
    const parts = await pool.query(
      `WITH exact AS (
         SELECT DISTINCT p.id FROM product_identifiers i JOIN products p ON p.id=i.product_id
         WHERE i.normalized_value=$2 AND p.org_id=$1 AND p.status<>'ARCHIVED'
       ), found AS (
         (SELECT p.id,p.sku,p.names,p.translation_status AS "translationStatus",p.brand,true AS exact
          FROM exact JOIN products p USING(id) ORDER BY p.sku LIMIT 8)
         UNION ALL
         (SELECT p.id,p.sku,p.names,p.translation_status,p.brand,false
          FROM products p WHERE p.org_id=$1 AND p.status<>'ARCHIVED' AND p.search_text LIKE '%'||$2||'%'
          AND NOT EXISTS(SELECT 1 FROM exact e WHERE e.id=p.id) ORDER BY p.sku LIMIT 8)
       )
       SELECT * FROM found ORDER BY exact DESC,sku LIMIT 8`, [actor.org_id, term],
    );
    const [vehicles, suppliers, locations, categories] = await Promise.all([
      pool.query(
        `SELECT id,make,model,generation,engine,market,equipment,year_from AS "yearFrom",year_to AS "yearTo"
         FROM vehicles WHERE org_id=$1 AND search_text LIKE '%'||$2||'%' ORDER BY make,model,generation,id LIMIT 5`,
        [actor.org_id,term],
      ),
      actor.permissions.includes('suppliers') ? pool.query(
        `SELECT id,name FROM suppliers WHERE org_id=$1 AND strpos(lower(name),lower($2))>0 ORDER BY name,id LIMIT 5`,
        [actor.org_id,q],
      ) : undefined,
      pool.query(
        `SELECT w.id,w.name,w.code,b.code AS bin FROM warehouses w
         LEFT JOIN warehouse_bins b ON b.warehouse_id=w.id AND b.org_id=w.org_id AND strpos(lower(b.code),lower($2))>0
         WHERE w.org_id=$1 AND (cardinality($3::uuid[])=0 OR w.id=ANY($3::uuid[]))
         AND (b.id IS NOT NULL OR strpos(lower(w.name),lower($2))>0 OR strpos(lower(w.code),lower($2))>0)
         ORDER BY w.code,b.code LIMIT 8`, [actor.org_id,q,actor.warehouse_ids],
      ),
      pool.query(
        `SELECT category,min(category_names::text)::jsonb AS names FROM products WHERE org_id=$1 AND status<>'ARCHIVED'
         AND (strpos(lower(category),lower($2))>0 OR strpos(lower(concat_ws(' ',category_names->>'ar',category_names->>'fr',category_names->>'en')),lower($2))>0)
         GROUP BY category ORDER BY category LIMIT 5`, [actor.org_id,q],
      ),
    ]);
    return { parts: parts.rows, vehicles: vehicles.rows, suppliers: suppliers?.rows ?? [], locations: locations.rows, categories: categories.rows };
  });

  app.get('/api/workspace/products/:id/locations', async request => {
    const actor = (request as AuthedRequest).actor;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { warehouseId, page } = z.object({
      warehouseId: z.string().uuid().optional(),
      page: z.coerce.number().int().min(1).max(1000).default(1),
    }).strict().parse(request.query);
    if (warehouseId && actor.warehouse_ids.length && !actor.warehouse_ids.includes(warehouseId))
      throw new DomainError('FORBIDDEN', 403);
    const { rows } = await pool.query(
      `SELECT b.id,b.code,w.id AS "warehouseId",w.name AS "warehouseName",w.code AS "warehouseCode",
        s.on_hand AS "onHand",s.quarantine,s.damaged
       FROM bin_balances s JOIN products p ON p.id=s.product_id AND p.org_id=$1
       JOIN warehouse_bins b ON b.id=s.bin_id AND b.org_id=p.org_id
       JOIN warehouses w ON w.id=b.warehouse_id AND w.org_id=p.org_id
       WHERE s.product_id=$2 AND (s.on_hand>0 OR s.quarantine>0 OR s.damaged>0)
       AND (cardinality($3::uuid[])=0 OR w.id=ANY($3::uuid[])) AND ($4::uuid IS NULL OR w.id=$4)
       ORDER BY w.code,w.id,b.code,b.id LIMIT 41 OFFSET $5`,
      [actor.org_id,id,actor.warehouse_ids,warehouseId ?? null,(page-1)*40],
    );
    return { items: rows.slice(0,40), more: rows.length > 40 };
  });

  app.get('/api/workspace/products/:id/suppliers',async request => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor,'suppliers');
    const {id} = z.object({id:z.string().uuid()}).parse(request.params);
    const {rows} = await pool.query(
      `SELECT s.id,s.name,s.lead_days AS "leadDays",i.reference
       FROM supplier_items i JOIN suppliers s ON s.id=i.supplier_id AND s.org_id=$1
       JOIN products p ON p.id=i.product_id AND p.org_id=s.org_id
       WHERE p.id=$2 ORDER BY s.name,s.id LIMIT 31`,[actor.org_id,id],
    );
    return {items:rows.slice(0,30),more:rows.length>30};
  });
}
