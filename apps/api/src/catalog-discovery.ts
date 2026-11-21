import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { type AuthedRequest, requirePermission } from './auth.js';
import { DomainError } from './db.js';
import { assortmentGroups, findMerchandiseTypes } from '../../../packages/contracts/src/assortment.js';
const vehicleColumns = `id,make,model,generation,year_from AS "yearFrom",year_to AS "yearTo",market,engine,equipment,fuel,transmission,body`;
export function registerCatalogDiscovery(app: FastifyInstance, pool: Pool) {
  app.get('/api/catalog/assortment', async (request) => {
    const filter = z.object({
      q: z.string().max(160).default(''),
      group: z.string().max(64).default(''),
      range: z.enum(['all','counter']).default('all'),
      page: z.coerce.number().int().min(1).max(10000).default(1),
    }).strict().parse(request.query);
    const matches = findMerchandiseTypes(filter.q, filter.group, filter.range === 'counter');
    const start = (filter.page - 1) * 50;
    return {
      groups: assortmentGroups.map(({code,names}) => ({code,names})),
      items: matches.slice(start,start+50),
      total: matches.length,
    };
  });
  app.get('/api/catalog/vehicle-options', async (request) => {
    const actor = (request as AuthedRequest).actor,
      q = z
        .object({
          make: z.string().max(100).optional(),
          model: z.string().max(100).optional(),
          generation: z.string().max(100).optional(),
          year: z.coerce.number().int().min(1900).max(2100).optional(),
          market: z.string().max(100).optional(),
          engine: z.string().max(100).optional(),
          equipment: z.string().max(500).optional(),
        })
        .strict()
        .parse(request.query);
    const values: unknown[] = [actor.org_id],
      filters = ['org_id=$1'];
    // Only fixed, developer-owned column names enter SQL. All user values are bound parameters.
    for (const key of ['make', 'model', 'generation', 'year', 'market', 'engine', 'equipment'] as const)
      if (q[key] !== undefined) {
        values.push(q[key]);
        filters.push(
          key === 'year'
            ? `year_from<=$${values.length} AND year_to>=$${values.length}`
            : `${key}=$${values.length}`,
        );
      }
    const where = filters.join(' AND '),
      facets: Record<string, string[]> = {};
    for (const key of ['make', 'model', 'generation', 'market', 'engine', 'equipment'] as const)
      facets[key] = (
        await pool.query(
          `SELECT DISTINCT ${key} AS value FROM vehicles WHERE ${where} ORDER BY value LIMIT 500`,
          values,
        )
      ).rows.map((r) => r.value);
    const items = await pool.query(
      `SELECT ${vehicleColumns} FROM vehicles WHERE ${where} ORDER BY make,model,generation,engine,equipment,id LIMIT 51`,
      values,
    );
    return { facets, items: items.rows.slice(0, 50), more: items.rows.length > 50 };
  });
  app.get('/api/vehicles/:id', async (request) => {
    const actor = (request as AuthedRequest).actor,
      row = (
        await pool.query(`SELECT ${vehicleColumns} FROM vehicles WHERE id=$1 AND org_id=$2`, [
          z
            .string()
            .uuid()
            .parse((request.params as any).id),
          actor.org_id,
        ])
      ).rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 404);
    return row;
  });
  app.get('/api/catalog/categories', async (request) => ({
    items: (
      await pool.query(
        "SELECT category,min(category_names::text)::jsonb AS names FROM products WHERE org_id=$1 AND status<>'ARCHIVED' GROUP BY category ORDER BY category",
        [(request as AuthedRequest).actor.org_id],
      )
    ).rows,
  }));
  app.get('/api/media/coverage', async (request) => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor, 'catalog');
    const q = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        queue: z.enum(['all', 'missing', 'disputed', 'poorQuality', 'rights']).default('all'),
      })
      .parse(request.query);
    const base = `WITH stocked AS (SELECT p.id,p.sku,p.names,p.translation_status AS "translationStatus",p.brand,mp.part_number AS "manufacturerPartNo",sum(b.on_hand+b.quarantine+b.damaged)::integer AS pieces
   FROM products p JOIN inventory_balances b ON b.product_id=p.id LEFT JOIN manufacturer_parts mp ON mp.id=p.manufacturer_part_id
   WHERE p.org_id=$1 AND p.status<>'ARCHIVED' AND (cardinality($2::uuid[])=0 OR b.warehouse_id=ANY($2::uuid[])) GROUP BY p.id,mp.part_number HAVING sum(b.on_hand+b.quarantine+b.damaged)>0),
   coverage AS (SELECT stocked.*,
    EXISTS(SELECT 1 FROM usable_internal_media m WHERE m.product_id=stocked.id AND m.kind IN ('EXACT_PRODUCT_PHOTO','COMPANY_ORIGINAL_PHOTO')) AS exact,
    EXISTS(SELECT 1 FROM fitments f JOIN sources s ON s.id=f.source_id WHERE f.product_id=stocked.id AND f.status='VERIFIED' AND s.can_store) AS fitment,
    EXISTS(SELECT 1 FROM usable_public_media m WHERE m.product_id=stocked.id AND m.kind IN ('EXACT_PRODUCT_PHOTO','COMPANY_ORIGINAL_PHOTO')) AS public,
    EXISTS(SELECT 1 FROM product_media m WHERE m.product_id=stocked.id AND m.state='DISPUTED') AS disputed,
    EXISTS(SELECT 1 FROM product_media m WHERE m.product_id=stocked.id AND ((m.dimensions->>'width')::integer<600 OR (m.dimensions->>'height')::integer<400)) AS "poorQuality",
    EXISTS(SELECT 1 FROM product_media m LEFT JOIN usable_internal_media u ON u.id=m.id WHERE m.product_id=stocked.id AND u.id IS NULL) AS "reviewRequired",
    COALESCE((SELECT sum(sl.quantity) FROM sale_lines sl JOIN sales s ON s.id=sl.sale_id WHERE sl.product_id=stocked.id AND s.created_at>now()-interval '90 days' AND (cardinality($2::uuid[])=0 OR s.warehouse_id=ANY($2::uuid[]))),0)::integer AS "sold90Days"
    FROM stocked)`;
    const params = [actor.org_id, actor.warehouse_ids];
    const summary = (
      await pool.query(
        `${base} SELECT count(*)::integer AS "totalStockedSkus",count(*) FILTER(WHERE exact)::integer AS "withApprovedExactPhoto",count(*) FILTER(WHERE fitment)::integer AS "withVerifiedVehicleFitment",count(*) FILTER(WHERE public)::integer AS "withRightsForPublic",count(*) FILTER(WHERE NOT exact)::integer AS "missingPhoto",count(*) FILTER(WHERE disputed)::integer AS "disputedMatch",count(*) FILTER(WHERE "poorQuality")::integer AS "poorQuality",count(*) FILTER(WHERE "reviewRequired")::integer AS "reviewRequired" FROM coverage`,
        params,
      )
    ).rows[0];
    const where = {
      all: 'true',
      missing: 'NOT exact',
      disputed: 'disputed',
      poorQuality: '"poorQuality"',
      rights: '"reviewRequired"',
    }[q.queue];
    const items = await pool.query(
      `${base} SELECT * FROM coverage WHERE ${where} ORDER BY "sold90Days" DESC,pieces DESC,sku LIMIT 50 OFFSET $3`,
      [...params, (q.page - 1) * 50],
    );
    return { summary, items: items.rows, page: q.page };
  });
}
