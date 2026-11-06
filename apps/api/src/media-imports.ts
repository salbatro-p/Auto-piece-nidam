import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { type AuthedRequest, requirePermission } from './auth.js';
import { mutation } from './inventory.js';
import { audit, DomainError, hash } from './db.js';
import { imageStageSchema, stageImage } from './media-catalog.js';
const uuid = z.string().uuid();
const rowSchema = imageStageSchema
  .omit({ productId: true })
  .extend({
    kind: z.string().max(80),
    licenseId: z.string().max(80),
    vehicleVariantId: z.string().max(80).optional(),
    mime: z.string().max(80),
    applicability: z.record(z.string().max(50), z.string().max(500)).default({}),
    filename: z.string().min(1).max(300),
    clientError: z
      .enum(['INVALID_IMAGE', 'IMAGE_UNAVAILABLE', 'MEDIA_REFERENCE_MISMATCH', 'VALIDATION_ERROR'])
      .optional(),
  });
export function registerMediaImports(app: FastifyInstance, pool: Pool) {
  mutation(
    app,
    pool,
    '/api/media/imports',
    'catalog',
    z
      .object({ fileHash: z.string().regex(/^[a-f0-9]{64}$/), total: z.number().int().min(1).max(10000) })
      .strict(),
    async (c, actor, d, req) => {
      const job = (
        await c.query(
          'INSERT INTO image_ingest_jobs(org_id,created_by,file_hash,total) VALUES($1,$2,$3,$4) ON CONFLICT(org_id,created_by,file_hash) DO UPDATE SET file_hash=EXCLUDED.file_hash RETURNING id,total',
          [actor.org_id, actor.id, d.fileHash, d.total],
        )
      ).rows[0];
      if (job.total !== d.total) throw new DomainError('IDEMPOTENCY_CONFLICT', 409);
      await audit(c, actor, 'IMAGE_IMPORT_OPENED', job.id, { fileHash: d.fileHash, total: d.total }, req.id);
      return job;
    },
  );
  app.get('/api/media/imports/:id', async (request) => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor, 'catalog');
    const id = uuid.parse((request.params as any).id),
      q = z.object({ page: z.coerce.number().int().min(1).max(20).default(1) }).parse(request.query);
    const job = (
      await pool.query('SELECT id,total,created_at FROM image_ingest_jobs WHERE id=$1 AND org_id=$2', [
        id,
        actor.org_id,
      ])
    ).rows[0];
    if (!job) throw new DomainError('NOT_FOUND', 404);
    return {
      ...job,
      counts: (
        await pool.query(
          'SELECT status,count(*)::integer AS count FROM image_ingest_rows WHERE job_id=$1 GROUP BY status',
          [id],
        )
      ).rows,
      items: (
        await pool.query(
          'SELECT row_number AS "rowNumber",input,status,code,media_id AS "mediaId" FROM image_ingest_rows WHERE job_id=$1 ORDER BY row_number LIMIT 500 OFFSET $2',
          [id, (q.page - 1) * 500],
        )
      ).rows,
    };
  });
  mutation(app, pool, '/api/media/imports/:id/rows/:row', 'catalog', rowSchema, async (c, actor, d, req) => {
    const id = uuid.parse((req.params as any).id),
      number = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .parse((req.params as any).row),
      job = (
        await c.query('SELECT * FROM image_ingest_jobs WHERE id=$1 AND org_id=$2 FOR SHARE', [
          id,
          actor.org_id,
        ])
      ).rows[0];
    if (!job || number > job.total) throw new DomainError('NOT_FOUND', 404);
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`image-row:${id}:${number}`]);
    const fingerprint = hash(JSON.stringify(d)),
      old = (
        await c.query(
          'SELECT fingerprint,status,code,media_id AS "mediaId" FROM image_ingest_rows WHERE job_id=$1 AND row_number=$2',
          [id, number],
        )
      ).rows[0];
    if (old) {
      if (old.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_CONFLICT', 409);
      return {
        rowNumber: number,
        status: old.status,
        ...(old.code ? { code: old.code } : {}),
        ...(old.mediaId ? { mediaId: old.mediaId } : {}),
      };
    }
    const { data, mime, clientError, filename, ...input } = d;
    let status = 'ERROR',
      code: string | undefined,
      mediaId: string | undefined;
    await c.query('SAVEPOINT image_row');
    try {
      if (clientError) throw new DomainError(clientError);
      let productId: string | undefined;
      if (!['VEHICLE_PHOTO', 'EXPLODED_DIAGRAM'].includes(d.kind)) {
        const products = (
          await c.query(
            "SELECT p.id FROM products p JOIN manufacturer_parts mp ON mp.id=p.manufacturer_part_id WHERE p.org_id=$1 AND p.sku=$2 AND p.brand=$3 AND mp.part_number=$4 AND p.status<>'ARCHIVED'",
            [actor.org_id, d.sku, d.manufacturerBrand, d.manufacturerPartNumber],
          )
        ).rows;
        if (products.length !== 1) throw new DomainError('MEDIA_REFERENCE_MISMATCH', 409);
        productId = products[0].id;
      }
      const parsed = imageStageSchema.safeParse({ ...input, data, mime, productId });
      if (!parsed.success) throw new DomainError('VALIDATION_ERROR');
      const result = await stageImage(c, actor, parsed.data, req.id);
      mediaId = result.id;
      status =
        result.state === 'DUPLICATE' ? 'DUPLICATE' : result.state === 'DISPUTED' ? 'DISPUTED' : 'STAGED';
      code = result.code;
    } catch (err) {
      await c.query('ROLLBACK TO SAVEPOINT image_row');
      if (!(err instanceof DomainError) || err.status >= 500) throw err;
      code = err.code;
    }
    await c.query('RELEASE SAVEPOINT image_row');
    await c.query(
      'INSERT INTO image_ingest_rows(job_id,row_number,fingerprint,input,status,code,media_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [id, number, fingerprint, { ...input, filename, mime }, status, code ?? null, mediaId ?? null],
    );
    return { rowNumber: number, status, code, mediaId };
  });
}
