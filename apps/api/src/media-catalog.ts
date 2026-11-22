import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { type Actor, audit, DomainError, hash, normalize } from './db.js';
import { type AuthedRequest, requirePermission } from './auth.js';
import { mutation } from './inventory.js';
import {
  createMediaLicense,
  licenseFor,
  licenseSchema,
  mediaKinds,
  registerMediaPolicies,
} from './media-policy.js';
import { readMediaObject, storeMedia } from './media-store.js';
const uuid = z.string().uuid();
const applicability = z
  .object({
    side: z.enum(['LEFT', 'RIGHT', 'BOTH']).optional(),
    axle: z.enum(['FRONT', 'REAR', 'BOTH']).optional(),
    engine: z.string().max(100).optional(),
    equipment: z.string().max(500).optional(),
  })
  .strict();
export const imageStageSchema = z
  .object({
    productId: uuid.optional(),
    vehicleVariantId: uuid.optional(),
    kind: z.enum(mediaKinds),
    sku: z.string().max(80).default(''),
    manufacturerBrand: z.string().max(100).default(''),
    manufacturerPartNumber: z.string().max(100).default(''),
    licenseId: uuid,
    sourceUrl: z.string().max(1000).default(''),
    viewAngle: z.string().max(100).default(''),
    applicability: applicability.default({}),
    provider: z.string().max(200).default(''),
    illustrationId: z.string().max(200).default(''),
    callouts: z
      .array(z.object({ reference: z.string().max(80), label: z.string().max(500) }).strict())
      .max(200)
      .default([]),
    data: z.string().max(6000000),
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  })
  .strict();
type Stage = z.infer<typeof imageStageSchema>;
const spinProvider='AutoParts measured turntable v1';
// Bind even the individual image bytes to the live maker reference and verified model year.
const spinStillMatches = `EXISTS (SELECT 1 FROM products sp
  JOIN manufacturer_parts sm ON sm.id=sp.manufacturer_part_id
  JOIN fitments sf ON sf.product_id=sp.id AND sf.vehicle_id=m.vehicle_variant_id AND sf.status='VERIFIED'
  JOIN sources ss ON ss.id=sf.source_id AND ss.org_id=sp.org_id AND ss.can_store
  JOIN vehicles sv ON sv.id=sf.vehicle_id AND sv.org_id=sp.org_id
  WHERE sp.id=m.product_id AND sp.org_id=m.org_id AND sp.sku=m.sku_snapshot AND sp.brand=m.manufacturer_brand
    AND sm.part_number=m.manufacturer_part_number AND sm.part_number<>'' AND length(trim(m.source_url))>=8
    AND m.kind='GENERIC_CATEGORY_ILLUSTRATION' AND m.illustration_id ~ '^mesh-sha256:[0-9a-f]{64}:[0-9]{4}$'
    AND CASE WHEN right(m.illustration_id,4) ~ '^[0-9]{4}$' THEN right(m.illustration_id,4)::int END
      BETWEEN sv.year_from AND coalesce(sv.year_to,sv.year_from))`;
async function subject(c: PoolClient, actor: Actor, d: Stage) {
  const productKind = [
    'EXACT_PRODUCT_PHOTO',
    'COMPANY_ORIGINAL_PHOTO',
    'GENERIC_CATEGORY_ILLUSTRATION',
  ].includes(d.kind);
  if (productKind) {
    if (!d.productId) throw new DomainError('MEDIA_REFERENCE_MISMATCH', 409);
    const p = (
      await c.query(
        'SELECT p.*,mp.part_number FROM products p LEFT JOIN manufacturer_parts mp ON mp.id=p.manufacturer_part_id WHERE p.id=$1 AND p.org_id=$2 FOR SHARE OF p',
        [d.productId, actor.org_id],
      )
    ).rows[0];
    if (!p) throw new DomainError('NOT_FOUND', 404);
    if (
      p.sku !== d.sku ||
      p.brand !== d.manufacturerBrand ||
      (p.part_number ?? '') !== d.manufacturerPartNumber
    )
      throw new DomainError('MEDIA_REFERENCE_MISMATCH', 409);
  } else if (d.productId || !d.vehicleVariantId) throw new DomainError('MEDIA_APPLICABILITY_MISMATCH', 409);
  if (
    d.vehicleVariantId &&
    !(await c.query('SELECT id FROM vehicles WHERE id=$1 AND org_id=$2', [d.vehicleVariantId, actor.org_id]))
      .rowCount
  )
    throw new DomainError('NOT_FOUND', 404);
  if (d.kind === 'EXPLODED_DIAGRAM' && (!d.provider.trim() || !d.illustrationId.trim()))
    throw new DomainError('MEDIA_APPLICABILITY_MISMATCH', 409);
}
export async function stageImage(c: PoolClient, actor: Actor, d: Stage, requestId: string) {
  await subject(c, actor, d);
  if(d.provider===spinProvider){
    if(!d.manufacturerPartNumber || !d.vehicleVariantId || d.kind!=='GENERIC_CATEGORY_ILLUSTRATION' ||
      !/^mesh-sha256:[0-9a-f]{64}:\d{4}$/.test(d.illustrationId) || d.sourceUrl.trim().length<8 ||
      !['0','30','60','90','120','150','180','210','240','270','300','330'].includes(d.viewAngle))
      throw new DomainError('MEDIA_REFERENCE_MISMATCH',409);
    const confirmed=await c.query(`SELECT 1 FROM fitments f JOIN vehicles v ON v.id=f.vehicle_id
      JOIN sources s ON s.id=f.source_id AND s.org_id=v.org_id AND s.can_store
      WHERE f.product_id=$1 AND v.id=$2 AND v.org_id=$3 AND f.status='VERIFIED'
        AND $4::int BETWEEN v.year_from AND coalesce(v.year_to,v.year_from)`,
      [d.productId,d.vehicleVariantId,actor.org_id,Number(d.illustrationId.slice(-4))]);
    if(!confirmed.rowCount)throw new DomainError('MEDIA_APPLICABILITY_MISMATCH',409);
  }
  await licenseFor(c, actor, d.licenseId);
  const stored = await storeMedia(d.data, d.mime);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `media:${actor.org_id}:${stored.checksum}`,
  ]);
  const duplicates = (
    await c.query(
      'SELECT id,product_id,vehicle_variant_id,kind FROM product_media WHERE org_id=$1 AND content_checksum=$2 ORDER BY created_at',
      [actor.org_id, stored.checksum],
    )
  ).rows;
  const same = duplicates.find(
    (r) =>
      r.product_id === (d.productId ?? null) &&
      r.vehicle_variant_id === (d.vehicleVariantId ?? null) &&
      r.kind === d.kind,
  );
  if (same) return { id: same.id, mediaId: same.id, state: 'DUPLICATE', code: 'MEDIA_DUPLICATE' };
  const state = duplicates.length ? 'DISPUTED' : 'REVIEW_REQUIRED';
  const row = (
    await c.query(
      `INSERT INTO product_media(org_id,product_id,vehicle_variant_id,kind,sku_snapshot,manufacturer_brand,manufacturer_part_number,license_id,source_url,object_key,thumbnail_key,display_key,content_checksum,sha256,mime,file_size,dimensions,view_angle,state,applicability,provider,illustration_id,callouts,rights,created_by)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'See versioned media license',$23) RETURNING id`,
      [
        actor.org_id,
        d.productId ?? null,
        d.vehicleVariantId ?? null,
        d.kind,
        d.sku,
        d.manufacturerBrand,
        d.manufacturerPartNumber,
        d.licenseId,
        d.sourceUrl,
        stored.objectKey,
        stored.thumbnailKey,
        stored.displayKey,
        stored.checksum,
        stored.mime,
        stored.fileSize,
        stored.dimensions,
        d.viewAngle,
        state,
        d.applicability,
        d.provider,
        d.illustrationId,
        JSON.stringify(d.callouts),
        actor.id,
      ],
    )
  ).rows[0];
  await audit(
    c,
    actor,
    'MEDIA_STAGED',
    row.id,
    {
      productId: d.productId,
      vehicleVariantId: d.vehicleVariantId,
      kind: d.kind,
      licenseId: d.licenseId,
      checksum: stored.checksum,
      state,
      duplicateIds: duplicates.map((r) => r.id),
    },
    requestId,
  );
  return { id: row.id, mediaId: row.id, state };
}
async function validateApproval(c: PoolClient, actor: Actor, m: any, isPublic: boolean) {
  const license = await licenseFor(c, actor, m.license_id, true);
  if (
    isPublic &&
    (!['owner', 'manager'].includes(actor.role) ||
      !license.public_display_permitted ||
      (license.source_id && !license.can_syndicate))
  )
    throw new DomainError('MEDIA_RIGHTS_BLOCKED', 409);
  if (!m.object_key) throw new DomainError('MEDIA_REVIEW_REQUIRED', 409);
  if(m.provider===spinProvider && !(await c.query(`SELECT 1 FROM product_media m WHERE m.id=$1 AND ${spinStillMatches}`,[m.id])).rowCount)
    throw new DomainError('MEDIA_APPLICABILITY_MISMATCH',409);
  if (m.product_id) {
    const p = (
      await c.query(
        'SELECT p.*,mp.part_number FROM products p LEFT JOIN manufacturer_parts mp ON mp.id=p.manufacturer_part_id WHERE p.id=$1 AND p.org_id=$2 FOR SHARE OF p',
        [m.product_id, actor.org_id],
      )
    ).rows[0];
    if (
      !p ||
      m.sku_snapshot !== p.sku ||
      m.manufacturer_brand !== p.brand ||
      m.manufacturer_part_number !== (p.part_number ?? '')
    )
      throw new DomainError('MEDIA_REFERENCE_MISMATCH', 409);
    if (['EXACT_PRODUCT_PHOTO', 'COMPANY_ORIGINAL_PHOTO'].includes(m.kind) && !m.manufacturer_part_number)
      throw new DomainError('MEDIA_REFERENCE_MISMATCH', 409);
    for (const key of ['side', 'axle']) {
      const value = (p.company_metadata?.technicalAttributes ?? []).find(
        (a: any) => a.code.toLowerCase() === key,
      )?.value;
      if (value && m.applicability[key] && normalize(value) !== normalize(m.applicability[key]))
        throw new DomainError('MEDIA_APPLICABILITY_MISMATCH', 409);
    }
    if (
      m.vehicle_variant_id &&
      !(
        await c.query(
          "SELECT f.id FROM fitments f JOIN sources s ON s.id=f.source_id WHERE f.product_id=$1 AND f.vehicle_id=$2 AND f.status='VERIFIED' AND s.org_id=$3 AND s.can_store",
          [m.product_id, m.vehicle_variant_id, actor.org_id],
        )
      ).rowCount
    )
      throw new DomainError('MEDIA_APPLICABILITY_MISMATCH', 409);
  }
  if (m.vehicle_variant_id) {
    const v = (
      await c.query('SELECT * FROM vehicles WHERE id=$1 AND org_id=$2', [m.vehicle_variant_id, actor.org_id])
    ).rows[0];
    if (
      !v ||
      Object.entries(m.applicability).some(
        ([key, value]) => ['engine', 'equipment'].includes(key) && value !== v[key],
      )
    )
      throw new DomainError('MEDIA_APPLICABILITY_MISMATCH', 409);
  }
  if (m.kind === 'EXPLODED_DIAGRAM' && (!m.provider || !m.illustration_id))
    throw new DomainError('MEDIA_APPLICABILITY_MISMATCH', 409);
}
const columns = `m.id,m.product_id AS "productId",m.vehicle_variant_id AS "vehicleVariantId",m.kind,m.sku_snapshot AS sku,m.manufacturer_brand AS "manufacturerBrand",m.manufacturer_part_number AS "manufacturerPartNumber",m.license_id AS "licenseId",m.view_angle AS "viewAngle",m.state,m.applicability,m.provider,m.illustration_id AS "illustrationId",m.callouts,m.version,m.dimensions,m.file_size AS "fileSize",m.review_note AS "reviewNote",l.attribution_text AS "attributionText",l.name AS "sourceName",(usable.id IS NOT NULL) AS "displayApproved"`;
export function registerMediaCatalog(app: FastifyInstance, pool: Pool) {
  registerMediaPolicies(app, pool);
  mutation(app, pool, '/api/media/stage', 'catalog', imageStageSchema, stageImageFromRequest);
  async function stageImageFromRequest(c: PoolClient, actor: Actor, d: Stage, req: any) {
    return stageImage(c, actor, d, req.id);
  }
  mutation(
    app,
    pool,
    '/api/media/:id/match',
    'catalog',
    imageStageSchema
      .omit({ data: true, mime: true })
      .extend({ version: z.number().int().positive(), note: z.string().trim().min(10).max(2000) }),
    async (c, actor, d, req) => {
      const id = uuid.parse((req.params as any).id),
        m = (
          await c.query('SELECT * FROM product_media WHERE id=$1 AND org_id=$2 FOR UPDATE', [
            id,
            actor.org_id,
          ])
        ).rows[0];
      if (!m) throw new DomainError('NOT_FOUND', 404);
      if (m.version !== d.version) throw new DomainError('EDIT_CONFLICT', 409);
      if (m.product_id !== (d.productId ?? null) || m.vehicle_variant_id !== (d.vehicleVariantId ?? null))
        throw new DomainError('MEDIA_REFERENCE_MISMATCH', 409);
      await subject(c, actor, { ...d, data: '', mime: 'image/webp' });
      await licenseFor(c, actor, d.licenseId);
      // Legacy uploads are migrated losslessly into the private service on explicit matching. They still need approval.
      const stored = m.object_key ? null : await storeMedia(m.bytes.toString('base64'), m.mime);
      await c.query(
        `UPDATE product_media SET kind=$2,sku_snapshot=$3,manufacturer_brand=$4,manufacturer_part_number=$5,license_id=$6,source_url=$7,view_angle=$8,applicability=$9,provider=$10,illustration_id=$11,callouts=$12,state=CASE WHEN state='DISPUTED' THEN state ELSE 'REVIEW_REQUIRED' END,reviewed_by=NULL,reviewed_at=NULL,reviewed_license_version=NULL,review_note=$13,version=version+1,
   object_key=COALESCE(object_key,$14),display_key=COALESCE(display_key,$15),thumbnail_key=COALESCE(thumbnail_key,$16),content_checksum=COALESCE(content_checksum,$17),dimensions=CASE WHEN object_key IS NULL THEN $18 ELSE dimensions END,file_size=CASE WHEN object_key IS NULL THEN $19 ELSE file_size END,mime='image/webp',bytes=NULL WHERE id=$1`,
        [
          id,
          d.kind,
          d.sku,
          d.manufacturerBrand,
          d.manufacturerPartNumber,
          d.licenseId,
          d.sourceUrl,
          d.viewAngle,
          d.applicability,
          d.provider,
          d.illustrationId,
          JSON.stringify(d.callouts),
          d.note,
          stored?.objectKey,
          stored?.displayKey,
          stored?.thumbnailKey,
          stored?.checksum,
          stored?.dimensions,
          stored?.fileSize,
        ],
      );
      await audit(
        c,
        actor,
        'MEDIA_MATCH_UPDATED',
        id,
        {
          ...d,
          previous: {
            kind: m.kind,
            sku: m.sku_snapshot,
            manufacturerBrand: m.manufacturer_brand,
            manufacturerPartNumber: m.manufacturer_part_number,
            licenseId: m.license_id,
          },
        },
        req.id,
      );
      return { id, version: m.version + 1 };
    },
  );
  // Compatibility path for the existing owner product form. Uploads are staged, never automatically approved.
  mutation(
    app,
    pool,
    '/api/products/:id/media',
    'catalog',
    z
      .object({
        data: z.string().max(6000000),
        mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
        rights: z.string().trim().min(10).max(2000),
      })
      .strict(),
    async (c, actor, d, req) => {
      const id = uuid.parse((req.params as any).id),
        p = (
          await c.query(
            'SELECT p.sku,p.brand,mp.part_number FROM products p LEFT JOIN manufacturer_parts mp ON mp.id=p.manufacturer_part_id WHERE p.id=$1 AND p.org_id=$2',
            [id, actor.org_id],
          )
        ).rows[0];
      if (!p) throw new DomainError('NOT_FOUND', 404);
      const license = await createMediaLicense(
        c,
        actor,
        licenseSchema.parse({
          name: 'Company original upload',
          sourceType: 'COMPANY',
          termsVersion: 'Staff upload declaration',
          proof: d.rights,
          internalDisplayPermitted: true,
          publicDisplayPermitted: false,
        }),
      );
      await audit(
        c,
        actor,
        'MEDIA_LICENSE_CREATED',
        license.id,
        { proof: d.rights, sourceType: 'COMPANY' },
        req.id,
      );
      return stageImage(
        c,
        actor,
        imageStageSchema.parse({
          productId: id,
          kind: 'COMPANY_ORIGINAL_PHOTO',
          sku: p.sku,
          manufacturerBrand: p.brand,
          manufacturerPartNumber: p.part_number ?? '',
          licenseId: license.id,
          data: d.data,
          mime: d.mime,
        }),
        req.id,
      );
    },
  );
  app.get('/api/products/:id/spin-frames',async(request)=>{
    const actor=(request as AuthedRequest).actor,id=uuid.parse((request.params as {id:string}).id);
    const result=await pool.query(`SELECT m.id,m.product_id AS "productId",m.vehicle_variant_id AS "vehicleVariantId",
      m.sku_snapshot AS sku,m.manufacturer_brand AS "manufacturerBrand",m.manufacturer_part_number AS "manufacturerPartNumber",
      m.kind,m.provider,m.illustration_id AS "illustrationId",m.license_id AS "licenseId",m.view_angle AS "viewAngle",true AS "displayApproved"
      FROM usable_internal_media m WHERE m.org_id=$1 AND m.product_id=$2 AND m.provider=$3 AND ${spinStillMatches}
      ORDER BY m.reviewed_at DESC,m.id`,[actor.org_id,id,spinProvider]);
    return {items:result.rows};
  });
  app.get('/api/products/:id/gallery', async (request) => {
    const actor = (request as AuthedRequest).actor,
      id = uuid.parse((request.params as any).id),
      reviewer = actor.permissions.includes('catalog');
    return {
      items: (
        await pool.query(
          `SELECT ${columns} FROM product_media m LEFT JOIN media_source_licenses l ON l.id=m.license_id LEFT JOIN usable_internal_media usable ON usable.id=m.id WHERE m.product_id=$1 AND m.org_id=$2 AND ($3 OR usable.id IS NOT NULL) AND (m.provider<>$4 OR ${spinStillMatches}) ORDER BY m.created_at DESC LIMIT 100`,
          [id, actor.org_id, reviewer,spinProvider],
        )
      ).rows,
    };
  });
  app.get('/api/vehicles/:id/media', async (request) => {
    const actor = (request as AuthedRequest).actor,
      id = uuid.parse((request.params as any).id),
      reviewer = actor.permissions.includes('catalog');
    return {
      items: (
        await pool.query(
          `SELECT ${columns} FROM product_media m LEFT JOIN media_source_licenses l ON l.id=m.license_id LEFT JOIN usable_internal_media usable ON usable.id=m.id WHERE m.vehicle_variant_id=$1 AND m.product_id IS NULL AND m.org_id=$2 AND ($3 OR usable.id IS NOT NULL) ORDER BY m.created_at DESC LIMIT 100`,
          [id, actor.org_id, reviewer],
        )
      ).rows,
    };
  });
  mutation(
    app,
    pool,
    '/api/media/:id/review',
    'catalog',
    z
      .object({
        version: z.number().int().positive(),
        state: z.enum(['APPROVED_INTERNAL', 'APPROVED_PUBLIC', 'REJECTED']),
        note: z.string().trim().min(10).max(2000),
        physicalMatchConfirmed: z.boolean(),
        applicabilityConfirmed: z.boolean(),
        duplicateUseConfirmed: z.boolean().default(false),
      })
      .strict(),
    async (c, actor, d, req) => {
      const id = uuid.parse((req.params as any).id),
        m = (
          await c.query('SELECT * FROM product_media WHERE id=$1 AND org_id=$2 FOR UPDATE', [
            id,
            actor.org_id,
          ])
        ).rows[0];
      if (!m) throw new DomainError('NOT_FOUND', 404);
      if (m.version !== d.version) throw new DomainError('EDIT_CONFLICT', 409);
      if (d.state !== 'REJECTED') {
        if (
          !d.physicalMatchConfirmed ||
          !d.applicabilityConfirmed ||
          (m.state === 'DISPUTED' && !d.duplicateUseConfirmed)
        )
          throw new DomainError('MEDIA_REVIEW_REQUIRED', 409);
        await validateApproval(c, actor, m, d.state === 'APPROVED_PUBLIC');
      }
      await c.query(
        'INSERT INTO media_reviews(media_id,media_version,state,note,reviewed_by) VALUES($1,$2,$3,$4,$5)',
        [id, m.version, d.state, d.note, actor.id],
      );
      await c.query(
        'UPDATE product_media SET state=$2,review_note=$3,reviewed_by=$4,reviewed_at=now(),version=version+1,reviewed_license_version=(SELECT version FROM media_source_licenses WHERE id=product_media.license_id) WHERE id=$1',
        [id, d.state, d.note, actor.id],
      );
      await audit(
        c,
        actor,
        'MEDIA_REVIEWED',
        id,
        { ...d, checksum: m.content_checksum, licenseId: m.license_id },
        req.id,
      );
      return { id, state: d.state, version: m.version + 1 };
    },
  );
  app.get('/api/media/:id', async (request, reply) => {
    const actor = (request as AuthedRequest).actor,
      id = uuid.parse((request.params as any).id),
      q = z
        .object({ size: z.enum(['thumbnail', 'display', 'source']).default('display') })
        .parse(request.query);
    const m = (
      await pool.query(
        `SELECT m.*,u.id AS usable FROM product_media m LEFT JOIN usable_internal_media u ON u.id=m.id WHERE m.id=$1 AND m.org_id=$2 AND (m.provider<>$3 OR ${spinStillMatches})`,
        [id, actor.org_id,spinProvider],
      )
    ).rows[0];
    if (!m) throw new DomainError('NOT_FOUND', 404);
    if (!m.usable) {
      requirePermission(actor, 'catalog');
      if (!m.license_id) throw new DomainError('MEDIA_RIGHTS_BLOCKED', 409);
      await licenseFor(pool, actor, m.license_id, true);
    }
    if (q.size === 'source') requirePermission(actor, 'catalog');
    const key = q.size === 'thumbnail' ? m.thumbnail_key : q.size === 'source' ? m.object_key : m.display_key;
    if (!key) throw new DomainError('IMAGE_UNAVAILABLE', 404);
    reply
      .header('Content-Type', 'image/webp')
      .header('Cache-Control', 'private, no-store')
      .header('Content-Disposition', 'inline');
    return reply.send(await readMediaObject(key));
  });
}
