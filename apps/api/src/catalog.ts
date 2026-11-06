import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { type Actor, audit, DomainError, hash, normalize, warehouseScope } from './db.js';
import { type AuthedRequest, requirePermission } from './auth.js';
import { mutation } from './inventory.js';
import { sanitizeImage } from './media.js';
const uuid = z.string().uuid();
const localized = z
  .object({
    ar: z.string().max(3000).default(''),
    fr: z.string().max(3000).default(''),
    en: z.string().max(3000).default(''),
  })
  .strict();
const metadata = z
  .object({
    technicalAttributes:z.array(z.object({code:z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/),labels:localized,value:z.string().min(1).max(200),unit:z.string().max(30).default('')}).strict()).max(50).optional(),
    supplierReference: z.string().max(200).default(''),
    imageSource: z.string().max(1000).default(''),
    suppliedReviewStatus: localized.default({ ar: '', fr: '', en: '' }),
  })
  .strict();
export const productSchema = z
  .object({
    sku: z.string().trim().min(1).max(80),
    names: localized.refine((n) => Object.values(n).some(Boolean)),
    descriptions: localized.default({ ar: '', fr: '', en: '' }),
    brand: z.string().trim().min(1).max(100),
    manufacturerPartNo: z.string().max(100).default(''),
    companyMetadata: metadata.default({
      supplierReference: '',
      imageSource: '',
      suppliedReviewStatus: { ar: '', fr: '', en: '' },
    }),
    oem: z.string().max(100).default(''),
    barcode: z.string().max(100).default(''),
    category: z.string().max(100),
    categoryNames: localized.default({ ar: '', fr: '', en: '' }),
    packSize: z.number().int().min(1).max(10000),
    priceMinor: z.number().int().min(0).max(100000000),
    costMinor: z.number().int().min(0).max(100000000),
    reorderLevel: z.number().int().min(0).max(1000000).default(5),
    status: z.enum(['DRAFT', 'ACTIVE_INTERNAL']).default('DRAFT'),
    sourceId: uuid.optional(),
  })
  .strict();
type ProductData = z.infer<typeof productSchema>;
async function sourceAllowed(c: PoolClient, actor: Actor, id?: string) {
  if (
    id &&
    !(await c.query('SELECT id FROM sources WHERE id=$1 AND org_id=$2 AND can_store', [id, actor.org_id]))
      .rowCount
  )
    throw new DomainError('SOURCE_RIGHTS_REQUIRED', 409);
}
export async function bindManufacturer(
  c: PoolClient,
  actor: Actor,
  id: string,
  brand: string,
  partNumber: string,
  data: unknown,
) {
  let partId = null;
  if (partNumber) {
    const maker = (
      await c.query(
        'INSERT INTO manufacturers(org_id,name) VALUES($1,$2) ON CONFLICT(org_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id',
        [actor.org_id, brand],
      )
    ).rows[0];
    partId = (
      await c.query(
        'INSERT INTO manufacturer_parts(manufacturer_id,part_number) VALUES($1,$2) ON CONFLICT(manufacturer_id,part_number) DO UPDATE SET part_number=EXCLUDED.part_number RETURNING id',
        [maker.id, partNumber],
      )
    ).rows[0].id;
  }
  await c.query('UPDATE products SET manufacturer_part_id=$2,company_metadata=$3 WHERE id=$1', [
    id,
    partId,
    JSON.stringify(data),
  ]);
}
async function identifiers(c: PoolClient, id: string, data: ProductData, sourceId?: string) {
  const values = [
    ['SKU', data.sku],
    ['BARCODE', data.barcode],
    ['MANUFACTURER', data.manufacturerPartNo],
    ['SUPPLIER', data.companyMetadata.supplierReference],
    ...data.oem.split(/[;|]/).map((value) => ['OEM', value.trim()]),
  ];
  for (const [type, value] of values)
    if (value)
      await c.query(
        'INSERT INTO product_identifiers(product_id,type,raw_value,normalized_value,source_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
        [id, type, value, normalize(value), sourceId ?? null],
      );
}
function searchText(d: ProductData) {
  return normalize(
    [
      d.sku,
      d.oem,
      d.barcode,
      d.brand,
      d.category,
      d.manufacturerPartNo,
      ...Object.values(d.names),
      ...Object.values(d.categoryNames),
    ].join(' '),
  );
}
export async function insertProduct(c: PoolClient, actor: Actor, data: ProductData) {
  await sourceAllowed(c, actor, data.sourceId);
  const row = (
    await c.query(
      'INSERT INTO products(org_id,sku,names,descriptions,brand,oem,barcode,category,pack_size,price_minor,cost_minor,reorder_level,status,source_id,search_text,category_names) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id',
      [
        actor.org_id,
        data.sku,
        data.names,
        data.descriptions,
        data.brand,
        data.oem,
        data.barcode,
        data.category,
        data.packSize,
        data.priceMinor,
        data.costMinor,
        data.reorderLevel,
        data.status,
        data.sourceId ?? null,
        searchText(data),
        data.categoryNames,
      ],
    )
  ).rows[0];
  await bindManufacturer(c, actor, row.id, data.brand, data.manufacturerPartNo, data.companyMetadata);
  await identifiers(c, row.id, data, data.sourceId);
  return row.id as string;
}
async function decorateProducts(pool: Pool, actor: Actor, rows: any[]) {
  if (!rows.length) return [];
  const ids = rows.map((p) => p.id);
  const [stocks, fitments, media] = await Promise.all([
    pool.query(
      'SELECT b.product_id,b.warehouse_id AS "warehouseId",w.name AS "warehouseName",b.on_hand AS "onHand",b.reserved,b.on_hand-b.reserved AS available,b.quarantine,b.damaged FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id WHERE product_id=ANY($1::uuid[]) AND (cardinality($2::uuid[])=0 OR b.warehouse_id=ANY($2::uuid[]))',
      [ids, actor.warehouse_ids],
    ),
    pool.query(
      'SELECT product_id,vehicle_id AS "vehicleId",status,evidence,qualifiers,source_id AS "sourceId",reviewed_at AS "reviewedAt" FROM fitments WHERE product_id=ANY($1::uuid[])',
      [ids],
    ),
    pool.query(
      'SELECT DISTINCT ON(product_id) id,product_id FROM product_media WHERE product_id=ANY($1::uuid[]) ORDER BY product_id,created_at DESC',
      [ids],
    ),
  ]);
  return rows.map((p) => ({
    id: p.id,
    sku: p.sku,
    names: p.names,
    descriptions: p.descriptions,
    brand: p.brand,
    manufacturerPartNo: p.manufacturer_part_no ?? '',
    companyMetadata: p.company_metadata,
    oem: p.oem,
    barcode: p.barcode,
    category: p.category,
    categoryNames: p.category_names,
    packSize: p.pack_size,
    priceMinor: Number(p.price_minor),
    ...(actor.permissions.includes('costs') ? { costMinor: Number(p.cost_minor) } : {}),
    reorderLevel: p.reorder_level,
    status: p.status,
    translationStatus: p.translation_status,
    version: p.version,
    stock: stocks.rows.filter((b) => b.product_id === p.id).map(({ product_id, ...b }) => b),
    fitments: fitments.rows.filter((f) => f.product_id === p.id).map(({ product_id, ...f }) => f),
    mediaId: media.rows.find((m) => m.product_id === p.id)?.id,
  }));
}
const sourceSchema = z
  .object({
    name: z.string().min(2).max(200),
    origin: z.string().min(2).max(500),
    license: z.string().min(5).max(2000),
    canStore: z.boolean(),
    canDisplay: z.boolean(),
    canSyndicate: z.boolean(),
  })
  .strict();
export function registerCatalog(app: FastifyInstance, pool: Pool) {
  app.get('/api/warehouses', async (request) => {
    const actor = (request as AuthedRequest).actor;
    return {
      items: (
        await pool.query(
          'SELECT id,name,code FROM warehouses WHERE org_id=$1 AND (cardinality($2::uuid[])=0 OR id=ANY($2::uuid[])) ORDER BY code',
          [actor.org_id, actor.warehouse_ids],
        )
      ).rows,
    };
  });
  app.get('/api/products', async (request) => {
    const actor = (request as AuthedRequest).actor,
      q = z
        .object({
          q: z.string().max(200).default(''),
          page: z.coerce.number().int().min(1).max(100000).default(1),
          warehouseId: uuid.optional(),
          vehicleId: uuid.optional(),
        })
        .parse(request.query);
    if (q.warehouseId) warehouseScope(actor, q.warehouseId);
    const params = [actor.org_id, `%${normalize(q.q)}%`, q.vehicleId ?? null, q.warehouseId ?? null];
    const exact = q.q
      ? !!(
          await pool.query(
            'SELECT 1 FROM product_identifiers i JOIN products p ON p.id=i.product_id WHERE i.normalized_value=$1 AND p.org_id=$2 LIMIT 1',
            [normalize(q.q), actor.org_id],
          )
        ).rowCount
      : false;
    const matching = exact
      ? "p.id IN (SELECT product_id FROM product_identifiers WHERE normalized_value=trim(both '%' FROM $2))"
      : "($2='%%' OR p.search_text LIKE $2)";
    const where = `p.org_id=$1 AND p.status<>'ARCHIVED' AND ${matching} AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM fitments f WHERE f.product_id=p.id AND f.vehicle_id=$3 AND f.status='VERIFIED')) AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM inventory_balances b WHERE b.product_id=p.id AND b.warehouse_id=$4))`;
    const [items, count] = await Promise.all([
      pool.query(
        `SELECT p.*,mp.part_number AS manufacturer_part_no FROM products p LEFT JOIN manufacturer_parts mp ON mp.id=p.manufacturer_part_id WHERE ${where} ORDER BY p.sku LIMIT 30 OFFSET $5`,
        [...params, (q.page - 1) * 30],
      ),
      pool.query(`SELECT count(*)::integer AS total FROM products p WHERE ${where}`, params),
    ]);
    return {
      items: await decorateProducts(pool, actor, items.rows),
      total: count.rows[0].total,
      page: q.page,
    };
  });
  app.get('/api/products/:id', async (request) => {
    const actor = (request as AuthedRequest).actor,
      rows = (
        await pool.query(
          'SELECT p.*,mp.part_number AS manufacturer_part_no FROM products p LEFT JOIN manufacturer_parts mp ON mp.id=p.manufacturer_part_id WHERE p.id=$1 AND p.org_id=$2',
          [uuid.parse((request.params as any).id), actor.org_id],
        )
      ).rows;
    const products = await decorateProducts(pool, actor, rows);
    if (!products[0]) throw new DomainError('NOT_FOUND', 404);
    return products[0];
  });
  mutation(app, pool, '/api/products', 'catalog', productSchema, async (c, actor, d, req) => {
    if (!actor.permissions.includes('costs') && (d.costMinor || d.priceMinor))
      throw new DomainError('FORBIDDEN', 403);
    const id = await insertProduct(c, actor, d);
    await audit(c, actor, 'PRODUCT_CREATED', id, { sku: d.sku }, req.id);
    return { id, version: 1 };
  });
  mutation(
    app,
    pool,
    '/api/products/:id/update',
    'catalog',
    productSchema.extend({ version: z.number().int().positive() }),
    async (c, actor, d, req) => {
      const id = uuid.parse((req.params as any).id),
        old = (
          await c.query('SELECT * FROM products WHERE id=$1 AND org_id=$2 FOR UPDATE', [id, actor.org_id])
        ).rows[0];
      if (!old) throw new DomainError('NOT_FOUND', 404);
      if (old.version !== d.version) throw new DomainError('EDIT_CONFLICT', 409);
      if (
        !actor.permissions.includes('costs') &&
        (d.costMinor !== Number(old.cost_minor) || d.priceMinor !== Number(old.price_minor))
      )
        throw new DomainError('FORBIDDEN', 403);
      if (old.sku !== d.sku) throw new DomainError('SKU_IMMUTABLE', 409);
      await sourceAllowed(c, actor, d.sourceId);
      const technicalChanged=JSON.stringify(old.company_metadata?.technicalAttributes??[])!==JSON.stringify(d.companyMetadata.technicalAttributes??[]);
      await bindManufacturer(c, actor, id, d.brand, d.manufacturerPartNo, d.companyMetadata);
      await identifiers(c, id, d, d.sourceId ?? old.source_id);
      await c.query(
        'UPDATE products SET names=$2,descriptions=$3,brand=$4,oem=$5,barcode=$6,category=$7,pack_size=$8,price_minor=$9,cost_minor=$10,reorder_level=$11,status=$12,search_text=$13,source_id=$14,translation_status=CASE WHEN names<>$2::jsonb OR descriptions<>$3::jsonb OR category_names<>$16::jsonb OR $17 THEN $15::jsonb ELSE translation_status END,category_names=$16,version=version+1,updated_at=now() WHERE id=$1',
        [
          id,
          d.names,
          d.descriptions,
          d.brand,
          d.oem,
          d.barcode,
          d.category,
          d.packSize,
          d.priceMinor,
          d.costMinor,
          d.reorderLevel,
          d.status,
          searchText(d),
          d.sourceId ?? old.source_id,
          { ar: 'REVIEW_REQUIRED', fr: 'REVIEW_REQUIRED', en: 'REVIEW_REQUIRED' },
          d.categoryNames,
          technicalChanged,
        ],
      );
      await audit(
        c,
        actor,
        'PRODUCT_UPDATED',
        id,
        {
          previousVersion: old.version,
          fields: ['names', 'descriptions', 'priceMinor', 'costMinor', 'packSize'],
        },
        req.id,
      );
      return { id, version: old.version + 1 };
    },
  );
  mutation(
    app,
    pool,
    '/api/products/:id/translations/review',
    'catalog',
    z
      .object({
        locale: z.enum(['ar', 'fr', 'en']),
        version: z.number().int().positive(),
        note: z.string().trim().min(10).max(2000),
      })
      .strict(),
    async (c, actor, d, req) => {
      const id = uuid.parse((req.params as any).id),
        p = (await c.query('SELECT * FROM products WHERE id=$1 AND org_id=$2 FOR UPDATE', [id, actor.org_id]))
          .rows[0];
      if (!p) throw new DomainError('NOT_FOUND', 404);
      if (p.version !== d.version) throw new DomainError('EDIT_CONFLICT', 409);
      if (!p.names[d.locale]?.trim() || !p.descriptions[d.locale]?.trim())
        throw new DomainError('TRANSLATION_INCOMPLETE', 409);
      const attributes=p.company_metadata?.technicalAttributes??[];
      if(attributes.some((a:any)=>!a.labels[d.locale]?.trim()))throw new DomainError('TRANSLATION_INCOMPLETE',409);
      const digest = hash(JSON.stringify({ name: p.names[d.locale], description: p.descriptions[d.locale],category:p.category_names[d.locale],attributes:attributes.map((a:any)=>({...a,labels:a.labels[d.locale]})) }));
      await c.query(
        'INSERT INTO translation_reviews(product_id,locale,product_version,reviewer_id,note,content_hash) VALUES($1,$2,$3,$4,$5,$6)',
        [id, d.locale, p.version, actor.id, d.note, digest],
      );
      await c.query(
        'UPDATE products SET translation_status=jsonb_set(translation_status,ARRAY[$2]::text[],\'"APPROVED"\'::jsonb),version=version+1 WHERE id=$1',
        [id, d.locale],
      );
      await audit(
        c,
        actor,
        'TRANSLATION_REVIEWED',
        id,
        { locale: d.locale, contentHash: digest, previousVersion: p.version },
        req.id,
      );
      return { id, locale: d.locale, status: 'APPROVED' };
    },
  );
  mutation(
    app,
    pool,
    '/api/products/:id/media',
    'catalog',
    z
      .object({
        data: z.string().max(6000000),
        mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        rights: z.string().trim().min(5).max(2000),
      })
      .strict(),
    async (c, actor, d, req) => {
      const id = uuid.parse((req.params as any).id);
      if (!(await c.query('SELECT id FROM products WHERE id=$1 AND org_id=$2', [id, actor.org_id])).rowCount)
        throw new DomainError('NOT_FOUND', 404);
      const bytes = await sanitizeImage(d.data, d.mime);
      const row = (
        await c.query(
          'INSERT INTO product_media(product_id,mime,bytes,sha256,rights,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
          [id, d.mime, bytes, hash(bytes.toString('base64')), d.rights, actor.id],
        )
      ).rows[0];
      return { id: row.id, mediaId: row.id };
    },
  );
  app.get('/api/media/:id', async (request, reply) => {
    const actor = (request as AuthedRequest).actor,
      image = (
        await pool.query(
          'SELECT m.mime,m.bytes FROM product_media m JOIN products p ON p.id=m.product_id WHERE m.id=$1 AND p.org_id=$2',
          [uuid.parse((request.params as any).id), actor.org_id],
        )
      ).rows[0];
    if (!image) throw new DomainError('NOT_FOUND', 404);
    reply
      .header('Content-Type', image.mime)
      .header('Content-Disposition', 'inline')
      .header('Cache-Control', 'private, no-store');
    return reply.send(image.bytes);
  });
  app.get('/api/vehicles', async (request) => {
    const actor = (request as AuthedRequest).actor,
      q = z
        .object({
          q: z.string().max(200).default(''),
          page: z.coerce.number().int().min(1).max(10000).default(1),
        })
        .parse(request.query),
      params = [actor.org_id, `%${normalize(q.q)}%`];
    const [items, count] = await Promise.all([
      pool.query(
        'SELECT id,make,model,generation,market,year_from AS "yearFrom",year_to AS "yearTo",engine,fuel,transmission,body,equipment,aliases FROM vehicles WHERE org_id=$1 AND search_text LIKE $2 ORDER BY make,model,id LIMIT 30 OFFSET $3',
        [...params, (q.page - 1) * 30],
      ),
      pool.query(
        'SELECT count(*)::integer total FROM vehicles WHERE org_id=$1 AND search_text LIKE $2',
        params,
      ),
    ]);
    return { items: items.rows, total: count.rows[0].total, page: q.page };
  });
  mutation(
    app,
    pool,
    '/api/vehicles',
    'catalog',
    z
      .object({
        make: z.string().min(1).max(100),
        model: z.string().min(1).max(100),
        generation: z.string().min(1).max(100),
        market: z.string().min(1).max(100),
        yearFrom: z.number().int().min(1900).max(2100),
        yearTo: z.number().int().min(1900).max(2100),
        engine: z.string().min(1).max(100),
        fuel: z.string().max(100),
        transmission: z.string().max(100),
        body: z.string().max(100),
        equipment: z.string().max(500).default(''),
        sourceId: uuid,
        externalId: z.string().min(1).max(100),
        aliases: localized.default({ ar: '', fr: '', en: '' }),
      })
      .strict()
      .refine((d) => d.yearFrom <= d.yearTo),
    async (c, actor, d) => {
      await sourceAllowed(c, actor, d.sourceId);
      return (
        await c.query(
          'INSERT INTO vehicles(org_id,make,model,generation,market,year_from,year_to,engine,fuel,transmission,body,equipment,source_id,external_id,aliases) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id',
          [
            actor.org_id,
            d.make,
            d.model,
            d.generation,
            d.market,
            d.yearFrom,
            d.yearTo,
            d.engine,
            d.fuel,
            d.transmission,
            d.body,
            d.equipment,
            d.sourceId,
            d.externalId,
            d.aliases,
          ],
        )
      ).rows[0];
    },
  );
  mutation(
    app,
    pool,
    '/api/fitments',
    'catalog',
    z
      .object({
        productId: uuid,
        vehicleId: uuid,
        status: z.enum(['SOURCE_CLAIMED', 'REVIEW_REQUIRED', 'VERIFIED', 'CONFLICTED', 'REJECTED']),
        evidence: z.string().max(2000),
        sourceId: uuid,
        qualifiers: z.string().max(1000).default(''),
      })
      .strict(),
    async (c, actor, d, req) => {
      const valid = (
        await c.query(
          'SELECT p.id FROM products p JOIN vehicles v ON v.org_id=p.org_id JOIN sources s ON s.org_id=p.org_id WHERE p.id=$1 AND v.id=$2 AND s.id=$3 AND p.org_id=$4 AND s.can_store',
          [d.productId, d.vehicleId, d.sourceId, actor.org_id],
        )
      ).rowCount;
      if (!valid) throw new DomainError('SOURCE_RIGHTS_REQUIRED', 409);
      if (d.status === 'VERIFIED' && d.evidence.trim().length <= 10)
        throw new DomainError('FITMENT_EVIDENCE_REQUIRED', 409);
      const row = (
        await c.query(
          'INSERT INTO fitments(product_id,vehicle_id,status,evidence,source_id,qualifiers,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(product_id,vehicle_id) DO UPDATE SET status=$3,evidence=$4,source_id=$5,qualifiers=$6,reviewed_by=$7,reviewed_at=now() RETURNING id',
          [d.productId, d.vehicleId, d.status, d.evidence, d.sourceId, d.qualifiers, actor.id],
        )
      ).rows[0];
      await audit(c, actor, 'FITMENT_REVIEWED', row.id, { status: d.status, sourceId: d.sourceId }, req.id);
      return { id: row.id, status: d.status };
    },
  );
  app.get('/api/sources', async (request) => {
    const actor = (request as AuthedRequest).actor;
    if (!actor.permissions.some((p) => ['catalog', 'imports'].includes(p)))
      throw new DomainError('FORBIDDEN', 403);
    return {
      items: (
        await pool.query(
          'SELECT id,name,origin,license,can_store AS "canStore",can_display AS "canDisplay",can_syndicate AS "canSyndicate",status,version,checked_at AS "checkedAt" FROM sources WHERE org_id=$1 ORDER BY name',
          [actor.org_id],
        )
      ).rows,
    };
  });
  mutation(
    app,
    pool,
    '/api/sources',
    'catalog',
    sourceSchema,
    async (c, actor, d) =>
      (
        await c.query(
          'INSERT INTO sources(org_id,name,origin,license,can_store,can_display,can_syndicate,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
          [
            actor.org_id,
            d.name,
            d.origin,
            d.license,
            d.canStore,
            d.canDisplay,
            d.canSyndicate,
            d.canStore ? 'INTERNAL_APPROVED' : 'REVIEW_REQUIRED',
          ],
        )
      ).rows[0],
  );
  mutation(
    app,
    pool,
    '/api/sources/:id/update',
    'catalog',
    sourceSchema.extend({ version: z.number().int().positive() }),
    async (c, actor, d, req) => {
      const id = uuid.parse((req.params as any).id),
        old = (
          await c.query('SELECT * FROM sources WHERE id=$1 AND org_id=$2 FOR UPDATE', [id, actor.org_id])
        ).rows[0];
      if (!old) throw new DomainError('NOT_FOUND', 404);
      if (old.version !== d.version) throw new DomainError('EDIT_CONFLICT', 409);
      await c.query(
        'UPDATE sources SET name=$2,origin=$3,license=$4,can_store=$5,can_display=$6,can_syndicate=$7,status=$8,checked_at=now(),version=version+1 WHERE id=$1',
        [
          id,
          d.name,
          d.origin,
          d.license,
          d.canStore,
          d.canDisplay,
          d.canSyndicate,
          d.canStore ? 'INTERNAL_APPROVED' : 'REVIEW_REQUIRED',
        ],
      );
      await audit(
        c,
        actor,
        'SOURCE_RIGHTS_UPDATED',
        id,
        {
          previousVersion: old.version,
          canStore: d.canStore,
          canDisplay: d.canDisplay,
          canSyndicate: d.canSyndicate,
        },
        req.id,
      );
      return { id, version: old.version + 1 };
    },
  );
  app.get('/api/catalog/coverage', async (request) => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor, 'catalog');
    return (
      await pool.query(
        "SELECT count(*)::integer total,count(*) FILTER(WHERE coalesce(names->>'ar','')<>'')::integer ar,count(*) FILTER(WHERE coalesce(names->>'fr','')<>'')::integer fr,count(*) FILTER(WHERE coalesce(names->>'en','')<>'')::integer en,count(*) FILTER(WHERE translation_status->>'ar'='APPROVED')::integer approved_ar,count(*) FILTER(WHERE translation_status->>'fr'='APPROVED')::integer approved_fr,count(*) FILTER(WHERE translation_status->>'en'='APPROVED')::integer approved_en FROM products WHERE org_id=$1",
        [actor.org_id],
      )
    ).rows[0];
  });
}
