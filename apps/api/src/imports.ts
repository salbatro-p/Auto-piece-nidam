import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type Actor, audit, DomainError, normalize, outbox, transaction } from './db.js';
import { type AuthedRequest, requirePermission, permissions } from './auth.js';
import { productSchema } from './catalog.js';
import { mutation } from './inventory.js';

const uuid = z.string().uuid();
async function jobForUpdate(c: PoolClient, actor: Actor, id: string) {
  const job = (
    await c.query('SELECT * FROM bulk_import_jobs WHERE id=$1 AND org_id=$2 FOR UPDATE', [id, actor.org_id])
  ).rows[0];
  if (!job) throw new DomainError('NOT_FOUND', 404);
  return job;
}
async function checkSource(c: PoolClient, actor: Actor, id: string) {
  const source = (
    await c.query('SELECT can_store FROM sources WHERE id=$1 AND org_id=$2', [id, actor.org_id])
  ).rows[0];
  if (!source?.can_store) throw new DomainError('SOURCE_RIGHTS_REQUIRED', 409);
}
export function registerImports(app: FastifyInstance, pool: Pool) {
  mutation(
    app,
    pool,
    '/api/bulk-imports',
    'imports',
    z
      .object({
        sourceId: uuid,
        fileHash: z.string().regex(/^[a-f0-9]{64}$/),
        total: z.number().int().min(1).max(100000),
      })
      .strict(),
    async (c, actor, d) => {
      await checkSource(c, actor, d.sourceId);
      return (
        await c.query(
          'INSERT INTO bulk_import_jobs(org_id,source_id,created_by,total,file_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,status,total,uploaded,processed',
          [actor.org_id, d.sourceId, actor.id, d.total, d.fileHash],
        )
      ).rows[0];
    },
  );
  mutation(
    app,
    pool,
    '/api/bulk-imports/:id/chunks',
    'imports',
    z.object({ offset: z.number().int().min(0), rows: z.array(z.unknown()).min(1).max(1000) }).strict(),
    async (c, actor, d, req) => {
      const id = uuid.parse((req.params as any).id),
        job = await jobForUpdate(c, actor, id);
      if (job.status !== 'UPLOADING' || d.offset !== job.uploaded || d.offset + d.rows.length > job.total)
        throw new DomainError('IMPORT_OFFSET_CONFLICT', 409);
      await checkSource(c, actor, job.source_id);
      const skus = d.rows.map((r: any) => (typeof r?.sku === 'string' ? r.sku.trim() : '')).filter(Boolean);
      const seen = new Set(
        (
          await c.query(
            'SELECT sku FROM bulk_import_rows WHERE job_id=$1 AND sku=ANY($2::text[]) UNION SELECT sku FROM products WHERE org_id=$3 AND sku=ANY($2::text[])',
            [id, skus, actor.org_id],
          )
        ).rows.map((r) => r.sku),
      );
      let errors = 0;
      const rows = d.rows.map((raw: any, i: number) => {
        const parsed = productSchema.safeParse(raw);
        let code: string | null = null;
        if (!parsed.success) code = 'VALIDATION_ERROR';
        else if (
          [
            parsed.data.sku,
            ...Object.values(parsed.data.names),
            ...Object.values(parsed.data.descriptions),
            parsed.data.brand,
            parsed.data.oem,
            parsed.data.barcode,
            parsed.data.category,
          ].some((v) => /^[=+@\-\t\r]/.test(v))
        )
          code = 'FORMULA_REJECTED';
        else if (seen.has(parsed.data.sku)) code = 'DUPLICATE_SKU';
        else if (!actor.permissions.includes('costs') && (parsed.data.costMinor || parsed.data.priceMinor))
          code = 'FORBIDDEN';
        const sku = parsed.success ? parsed.data.sku : null;
        if (sku) seen.add(sku);
        if (code) errors++;
        return {
          row_number: d.offset + i + 1,
          sku,
          data: parsed.success ? { ...parsed.data, sourceId: job.source_id } : null,
          error_code: code,
        };
      });
      await c.query(
        'INSERT INTO bulk_import_rows(job_id,row_number,sku,data,error_code) SELECT $1,r.* FROM jsonb_to_recordset($2::jsonb) r(row_number integer,sku text,data jsonb,error_code text)',
        [id, JSON.stringify(rows)],
      );
      await c.query(
        'UPDATE bulk_import_jobs SET uploaded=uploaded+$2,error_count=error_count+$3,updated_at=now() WHERE id=$1',
        [id, rows.length, errors],
      );
      return { id, uploaded: d.offset + rows.length, total: job.total, errorCount: job.error_count + errors };
    },
  );
  mutation(
    app,
    pool,
    '/api/bulk-imports/:id/validate',
    'imports',
    z.object({}).strict(),
    async (c, actor, _d, req) => {
      const id = uuid.parse((req.params as any).id),
        job = await jobForUpdate(c, actor, id);
      if (job.status !== 'UPLOADING' || job.uploaded !== job.total)
        throw new DomainError('IMPORT_INVALID', 409);
      const status = job.error_count ? 'INVALID' : 'PREVIEW';
      await c.query('UPDATE bulk_import_jobs SET status=$2,updated_at=now() WHERE id=$1', [id, status]);
      return {
        id,
        status,
        total: job.total,
        valid: !job.error_count,
        errorCount: job.error_count,
        errors: (
          await c.query(
            'SELECT row_number AS row,error_code AS code FROM bulk_import_rows WHERE job_id=$1 AND error_code IS NOT NULL ORDER BY row_number LIMIT 500',
            [id],
          )
        ).rows,
        rows: (
          await c.query(
            'SELECT data FROM bulk_import_rows WHERE job_id=$1 AND error_code IS NULL ORDER BY row_number LIMIT 20',
            [id],
          )
        ).rows.map((r) => r.data),
      };
    },
  );
  mutation(
    app,
    pool,
    '/api/bulk-imports/:id/commit',
    'imports',
    z.object({}).strict(),
    async (c, actor, _d, req) => {
      const id = uuid.parse((req.params as any).id),
        job = await jobForUpdate(c, actor, id);
      if (['COMMITTING', 'COMMITTED'].includes(job.status)) return { id, status: job.status };
      if (!['PREVIEW', 'PAUSED'].includes(job.status) || job.error_count)
        throw new DomainError('IMPORT_INVALID', 409);
      await checkSource(c, actor, job.source_id);
      if (
        !actor.permissions.includes('costs') &&
        (
          await c.query(
            "SELECT 1 FROM bulk_import_rows WHERE job_id=$1 AND ((data->>'costMinor')::bigint>0 OR (data->>'priceMinor')::bigint>0) LIMIT 1",
            [id],
          )
        ).rowCount
      )
        throw new DomainError('FORBIDDEN', 403);
      await c.query(
        "UPDATE bulk_import_jobs SET status='COMMITTING',last_error=NULL,created_by=$2,updated_at=now() WHERE id=$1",
        [id, actor.id],
      );
      return { id, status: 'COMMITTING' };
    },
  );
  mutation(
    app,
    pool,
    '/api/bulk-imports/:id/revert',
    'imports',
    z.object({}).strict(),
    async (c, actor, _d, req) => {
      const id = uuid.parse((req.params as any).id),
        job = await jobForUpdate(c, actor, id);
      if (!['PAUSED', 'COMMITTED'].includes(job.status)) throw new DomainError('IMPORT_INVALID', 409);
      const ids = (
        await c.query(
          'SELECT product_id FROM bulk_import_rows WHERE job_id=$1 AND product_id IS NOT NULL ORDER BY product_id',
          [id],
        )
      ).rows.map((r) => r.product_id);
      // Lock the products first so edits and compensation cannot race.
      await c.query('SELECT id FROM products WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [ids]);
      if (
        (await c.query('SELECT 1 FROM stock_movements WHERE product_id=ANY($1::uuid[]) LIMIT 1', [ids]))
          .rowCount
      )
        throw new DomainError('IMPORT_HAS_MOVEMENTS', 409);
      if (
        (await c.query('SELECT 1 FROM products WHERE id=ANY($1::uuid[]) AND version<>1 LIMIT 1', [ids]))
          .rowCount
      )
        throw new DomainError('IMPORT_HAS_CHANGES', 409);
      await c.query("UPDATE bulk_import_jobs SET status='REVERTED',updated_at=now() WHERE id=$1", [id]);
      await c.query("UPDATE products SET status='ARCHIVED',version=version+1 WHERE id=ANY($1::uuid[])", [
        ids,
      ]);
      return { id, status: 'REVERTED' };
    },
  );
  app.get('/api/bulk-imports', async (request) => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor, 'imports');
    return {
      items: (
        await pool.query(
          'SELECT id,source_id AS "sourceId",file_hash AS "fileHash",status,total,uploaded,processed,error_count AS "errorCount",last_error AS "lastError",created_at AS "createdAt" FROM bulk_import_jobs WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100',
          [actor.org_id],
        )
      ).rows,
    };
  });
  app.get('/api/bulk-imports/:id', async (request) => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor, 'imports');
    const id = uuid.parse((request.params as any).id);
    const job = (
      await pool.query(
        'SELECT id,source_id AS "sourceId",file_hash AS "fileHash",status,total,uploaded,processed,error_count AS "errorCount",last_error AS "lastError" FROM bulk_import_jobs WHERE id=$1 AND org_id=$2',
        [id, actor.org_id],
      )
    ).rows[0];
    if (!job) throw new DomainError('NOT_FOUND', 404);
    return {
      ...job,
      valid: job.status === 'PREVIEW',
      errors: (
        await pool.query(
          'SELECT row_number AS row,error_code AS code FROM bulk_import_rows WHERE job_id=$1 AND error_code IS NOT NULL ORDER BY row_number LIMIT 500',
          [id],
        )
      ).rows,
      rows: (
        await pool.query(
          'SELECT data FROM bulk_import_rows WHERE job_id=$1 AND error_code IS NULL ORDER BY row_number LIMIT 20',
          [id],
        )
      ).rows.map((r) => r.data),
    };
  });
}

/** One independently committed checkpoint. A killed worker resumes from the durable row cursor. */
export async function processImportChunk(
  pool: Pool,
): Promise<{ processed: number; id?: string; done?: boolean; paused?: boolean }> {
  let jobId: string | undefined;
  try {
    return await transaction(pool, async (c) => {
      const job = (
        await c.query(
          "SELECT * FROM bulk_import_jobs WHERE status='COMMITTING' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
        )
      ).rows[0];
      if (!job) return { processed: 0 };
      jobId = job.id;
      const user = (await c.query('SELECT * FROM staff_users WHERE id=$1 AND active', [job.created_by]))
        .rows[0];
      if (!user) throw new DomainError('FORBIDDEN', 403);
      const actor: Actor = { ...user, permissions: permissions[user.role] ?? [] };
      requirePermission(actor, 'imports');
      await checkSource(c, actor, job.source_id);
      const staged = (
        await c.query(
          'SELECT row_number,data FROM bulk_import_rows WHERE job_id=$1 AND product_id IS NULL ORDER BY row_number LIMIT 500',
          [job.id],
        )
      ).rows;
      if (staged.length) {
        const records = staged.map(({ row_number, data: d }) => ({
          id: randomUUID(),
          row_number,
          sku: d.sku,
          names: d.names,
          descriptions: d.descriptions,
          brand: d.brand,
          oem: d.oem,
          barcode: d.barcode,
          category: d.category,
          category_names:d.categoryNames??{},
          pack_size: d.packSize,
          price_minor: d.priceMinor,
          cost_minor: d.costMinor,
          reorder_level: d.reorderLevel,
          search_text: normalize(
            [d.sku, d.oem, d.barcode, d.brand, d.category, ...Object.values(d.names)].join(' '),
          ),
        }));
        await c.query(
          `INSERT INTO products(id,org_id,sku,names,descriptions,brand,oem,barcode,category,pack_size,price_minor,cost_minor,reorder_level,search_text,source_id,status,category_names)
    SELECT r.id,$1,r.sku,r.names,r.descriptions,r.brand,r.oem,r.barcode,r.category,r.pack_size,r.price_minor,r.cost_minor,r.reorder_level,r.search_text,$2,'DRAFT',r.category_names
    FROM jsonb_to_recordset($3::jsonb) r(id uuid,row_number integer,sku text,names jsonb,descriptions jsonb,brand text,oem text,barcode text,category text,pack_size integer,price_minor bigint,cost_minor bigint,reorder_level integer,search_text text,category_names jsonb)`,
          [job.org_id, job.source_id, JSON.stringify(records)],
        );
        const identifiers = records.flatMap((r) =>
          [
            ['SKU', r.sku],
            ['OEM', r.oem],
            ['BARCODE', r.barcode],
          ]
            .filter(([, value]) => value)
            .map(([type, value]) => ({
              product_id: r.id,
              type,
              raw_value: value,
              normalized_value: normalize(value!),
            })),
        );
        await c.query(
          'INSERT INTO product_identifiers(product_id,type,raw_value,normalized_value,source_id) SELECT r.*,$1 FROM jsonb_to_recordset($2::jsonb) r(product_id uuid,type text,raw_value text,normalized_value text)',
          [job.source_id, JSON.stringify(identifiers)],
        );
        await c.query(
          'UPDATE bulk_import_rows b SET product_id=r.id FROM jsonb_to_recordset($2::jsonb) r(id uuid,row_number integer) WHERE b.job_id=$1 AND b.row_number=r.row_number',
          [job.id, JSON.stringify(records)],
        );
        await c.query('UPDATE bulk_import_jobs SET processed=processed+$2,updated_at=now() WHERE id=$1', [
          job.id,
          records.length,
        ]);
        await audit(
          c,
          actor,
          'IMPORT_CHECKPOINT',
          job.id,
          { from: job.processed, count: records.length },
          `import-${job.id}`,
        );
      }
      const done = job.processed + staged.length === job.total;
      if (done) {
        await c.query("UPDATE bulk_import_jobs SET status='COMMITTED',updated_at=now() WHERE id=$1", [
          job.id,
        ]);
        await c.query(
          "UPDATE products p SET status=b.data->>'status' FROM bulk_import_rows b WHERE b.job_id=$1 AND b.product_id=p.id",
          [job.id],
        );
        await outbox(c, actor, 'ProductImportCommitted', job.id, { count: job.total });
      }
      return { id: job.id, processed: staged.length, done };
    });
  } catch (e) {
    if (jobId) {
      const code = (e as { code?: string }).code;
      await pool.query(
        "UPDATE bulk_import_jobs SET status='PAUSED',last_error=$2,updated_at=now() WHERE id=$1 AND status='COMMITTING'",
        [
          jobId,
          code === '23505' ? 'DUPLICATE_SKU' : e instanceof DomainError ? e.code : 'IMPORT_INTERRUPTED',
        ],
      );
    }
    return { id: jobId, processed: 0, paused: true };
  }
}
