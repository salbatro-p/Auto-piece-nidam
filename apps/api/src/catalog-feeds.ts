import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { requirePermission, permissions, type AuthedRequest } from './auth.js';
import { audit, DomainError, hash, transaction, type Actor } from './db.js';
import { mutation } from './inventory.js';

const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(160);
const year = z.number().int().min(1900).max(2100);
const model = { externalId: text, make: text, model: text, market: text };
const feedRow = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('MODEL_YEAR'), ...model, year, body: text.optional() }).strict(),
  z.object({
    kind: z.literal('VEHICLE_VARIANT'), ...model, generation: text,
    yearFrom: year, yearTo: year, engine: text, fuel: text, transmission: text,
    drivetrain: text.optional(), body: text, equipment: text.optional(), trim: text.optional(),
  }).strict(),
  z.object({
    kind: z.literal('PART_REFERENCE'), externalId: text, manufacturer: text,
    partNumber: text, category: text, variant: text.optional(), market: text.optional(),
    technicalAttributes: z.record(z.string().max(80), z.string().max(500)).optional(),
  }).strict(),
]);
const batchSchema = z.object({
  sourceId: uuid,
  datasetVersion: text,
  provenance: z.object({
    endpoint: z.url({ protocol: /^https$/ }).max(1000),
    retrievedAt: z.iso.datetime({ offset: true }),
    rawSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict().optional(),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
}).strict();
const summary = `j.id,j.source_id AS "sourceId",s.name AS "sourceName",j.source_version AS "sourceVersion",
  j.dataset_version AS "datasetVersion",j.snapshot_sha256 AS "snapshotSha256",j.provenance,j.state,j.total,j.checkpoint,j.attempts,
  j.last_error AS "lastError",j.created_at AS "createdAt",j.started_at AS "startedAt",j.completed_at AS "completedAt",
  counts.accepted,counts.duplicate,counts.conflict,counts.rejected`;
const jobQuery = `FROM catalog_feed_jobs j JOIN sources s ON s.id=j.source_id
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER(WHERE outcome='ACCEPTED')::int AS accepted,
      count(*) FILTER(WHERE outcome='DUPLICATE')::int AS duplicate,
      count(*) FILTER(WHERE outcome='CONFLICT')::int AS conflict,
      count(*) FILTER(WHERE outcome='REJECTED')::int AS rejected
    FROM catalog_feed_rows WHERE job_id=j.id
  ) counts ON true WHERE j.org_id=$1`;

function canonical(value: unknown, depth = 0): string {
  if (depth > 12) throw new DomainError('VALIDATION_ERROR',400);
  if (Array.isArray(value)) return '[' + value.map(item => canonical(item,depth + 1)).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item,depth + 1)).join(',') + '}';
  }
  return JSON.stringify(value);
}

async function feedSource(client: PoolClient, org: string, id: string) {
  const source = (await client.query(
    'SELECT version FROM sources WHERE id=$1 AND org_id=$2 AND can_store FOR SHARE', [id, org],
  )).rows[0];
  if (!source) throw new DomainError('SOURCE_RIGHTS_REQUIRED', 409);
  return Number(source.version);
}

export function registerCatalogFeeds(app: FastifyInstance, pool: Pool) {
  app.get('/api/catalog/references', async request => {
    const actor = (request as AuthedRequest).actor;
    const q = z.object({
      kind: z.enum(['MODEL_YEAR','VEHICLE_VARIANT','PART_REFERENCE']).default('MODEL_YEAR'),
      query: z.string().trim().max(100).default(''),
      page: z.coerce.number().int().min(1).max(1000).default(1),
    }).strict().parse(request.query);
    const { rows } = await pool.query(
      `SELECT r.id,r.contents,s.name AS "sourceName",j.dataset_version AS "datasetVersion"
       FROM catalog_feed_references r JOIN sources s ON s.id=r.source_id AND s.org_id=r.org_id
       JOIN catalog_feed_jobs j ON j.id=r.job_id AND j.state='COMPLETE'
       WHERE r.org_id=$1 AND r.kind=$2 AND s.version=r.source_version AND s.can_store AND s.can_display
       AND ($3='' OR strpos(lower(concat_ws(' ',r.contents->>'make',r.contents->>'model',
         r.contents->>'manufacturer',r.contents->>'partNumber',r.contents->>'externalId')),lower($3))>0)
       ORDER BY r.external_id,r.id LIMIT 31 OFFSET $4`,
      [actor.org_id,q.kind,q.query,(q.page-1)*30],
    );
    return { items: rows.slice(0,30), more: rows.length > 30 };
  });
  app.get('/api/catalog/feeds', async request => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor, 'imports');
    return { items: (await pool.query(`SELECT ${summary} ${jobQuery} ORDER BY j.created_at DESC LIMIT 25`, [actor.org_id])).rows };
  });
  app.get('/api/catalog/feeds/:id', async request => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor, 'imports');
    const id = uuid.parse((request.params as { id: string }).id);
    const { page } = z.object({ page: z.coerce.number().int().min(1).max(10).default(1) }).parse(request.query);
    const job = (await pool.query(`SELECT ${summary} ${jobQuery} AND j.id=$2`, [actor.org_id, id])).rows[0];
    if (!job) throw new DomainError('NOT_FOUND', 404);
    const items = (await pool.query(
      'SELECT row_number AS "rowNumber",contents,outcome,error_code AS "errorCode" FROM catalog_feed_rows WHERE job_id=$1 ORDER BY row_number LIMIT 50 OFFSET $2',
      [id, (page - 1) * 50],
    )).rows;
    return { ...job, items, page };
  });
  mutation(app, pool, '/api/catalog/feeds', 'imports', batchSchema, async (c, actor, data: z.infer<typeof batchSchema>, req) => {
    const version = await feedSource(c, actor.org_id, data.sourceId);
    const checksum = hash(canonical(data.rows));
    const job = await c.query(
      `INSERT INTO catalog_feed_jobs(org_id,source_id,source_version,dataset_version,snapshot_sha256,total,created_by,provenance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (org_id,source_id,source_version,snapshot_sha256) DO NOTHING RETURNING id`,
      [actor.org_id,data.sourceId,version,data.datasetVersion,checksum,data.rows.length,actor.id,data.provenance ?? {}],
    );
    if (!job.rowCount) {
      return (await c.query(
        'SELECT id FROM catalog_feed_jobs WHERE org_id=$1 AND source_id=$2 AND source_version=$3 AND snapshot_sha256=$4',
        [actor.org_id,data.sourceId,version,checksum],
      )).rows[0];
    }
    const id = job.rows[0].id;
    const staged = data.rows.map((contents, i) => {
      const parsed = feedRow.safeParse(contents);
      const valid = parsed.success && (parsed.data.kind !== 'VEHICLE_VARIANT' || parsed.data.yearFrom <= parsed.data.yearTo);
      return { row_number: i + 1, contents, outcome: valid ? 'STAGED' : 'REJECTED', error_code: valid ? null : 'VALIDATION_ERROR' };
    });
    await c.query(
      `INSERT INTO catalog_feed_rows(job_id,row_number,contents,outcome,error_code)
       SELECT $1,r.* FROM jsonb_to_recordset($2::jsonb) r(row_number integer,contents jsonb,outcome text,error_code text)`,
      [id,JSON.stringify(staged)],
    );
    await audit(c, actor, 'CATALOG_FEED_STAGED', id, { checksum, version, count: staged.length }, req.id);
    return { id };
  });
  mutation(app, pool, '/api/catalog/feeds/:id/run', 'imports', z.object({}).strict(), async (c, actor, _d, req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const job = (await c.query('SELECT * FROM catalog_feed_jobs WHERE id=$1 AND org_id=$2 FOR UPDATE', [id,actor.org_id])).rows[0];
    if (!job) throw new DomainError('NOT_FOUND', 404);
    if (job.state === 'COMPLETE' || job.state === 'RUNNING') return { id, state: job.state };
    if (await feedSource(c,actor.org_id,job.source_id) !== job.source_version) throw new DomainError('SOURCE_RIGHTS_REQUIRED',409);
    await c.query(
      "UPDATE catalog_feed_jobs SET state='RUNNING',approved_by=$2,attempts=attempts+1,last_error=NULL,started_at=coalesce(started_at,now()) WHERE id=$1",
      [id,actor.id],
    );
    await audit(c, actor, 'CATALOG_FEED_APPROVED', id, { checkpoint: job.checkpoint }, req.id);
    return { id, state: 'RUNNING' };
  });
}

export async function processCatalogFeed(pool: Pool, chunkSize = 50) {
  return transaction(pool, async c => {
    const job = (await c.query(
      "SELECT * FROM catalog_feed_jobs WHERE state='RUNNING' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
    )).rows[0];
    if (!job) return;
    await c.query('SAVEPOINT catalog_feed_chunk');
    try {
      const staff = (await c.query('SELECT * FROM staff_users WHERE id=$1 AND org_id=$2 AND active FOR SHARE', [job.approved_by,job.org_id])).rows[0];
      if (!staff) throw new DomainError('FORBIDDEN',403);
      const actor: Actor = { ...staff, permissions: permissions[staff.role] ?? [] };
      requirePermission(actor,'imports');
      if (await feedSource(c,job.org_id,job.source_id) !== job.source_version) throw new DomainError('SOURCE_RIGHTS_REQUIRED',409);
      const rows = (await c.query(
        "SELECT row_number,contents FROM catalog_feed_rows WHERE job_id=$1 AND outcome='STAGED' ORDER BY row_number LIMIT $2",
        [job.id,chunkSize],
      )).rows;
      for (const row of rows) {
        const parsed = feedRow.parse(row.contents);
        // JSONB equality ignores key order. A changed reference is queued as a conflict, never overwritten.
        const inserted = await c.query(
          `INSERT INTO catalog_feed_references(org_id,source_id,source_version,kind,external_id,contents,job_id,row_number)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
          [job.org_id,job.source_id,job.source_version,parsed.kind,parsed.externalId,parsed,job.id,row.row_number],
        );
        let outcome = 'ACCEPTED';
        if (!inserted.rowCount) {
          const reference = (await c.query(
            `SELECT contents=$6::jsonb AS equal FROM catalog_feed_references
             WHERE org_id=$1 AND source_id=$2 AND source_version=$3 AND kind=$4 AND external_id=$5`,
            [job.org_id,job.source_id,job.source_version,parsed.kind,parsed.externalId,parsed],
          )).rows[0];
          outcome = reference?.equal ? 'DUPLICATE' : 'CONFLICT';
        }
        await c.query('UPDATE catalog_feed_rows SET outcome=$3 WHERE job_id=$1 AND row_number=$2',[job.id,row.row_number,outcome]);
      }
      const left = (await c.query(
        "SELECT min(row_number) AS next FROM catalog_feed_rows WHERE job_id=$1 AND outcome='STAGED'", [job.id],
      )).rows[0].next;
      const checkpoint = left === null ? job.total : left - 1;
      await c.query(
        "UPDATE catalog_feed_jobs SET checkpoint=$2,state=CASE WHEN $2=total THEN 'COMPLETE' ELSE 'RUNNING' END,completed_at=CASE WHEN $2=total THEN now() ELSE NULL END WHERE id=$1",
        [job.id,checkpoint],
      );
      return { id: job.id, checkpoint, done: left === null };
    } catch (error) {
      await c.query('ROLLBACK TO SAVEPOINT catalog_feed_chunk');
      const code = error instanceof DomainError ? error.code : 'IMPORT_INTERRUPTED';
      await c.query("UPDATE catalog_feed_jobs SET state='PAUSED',last_error=$2 WHERE id=$1",[job.id,code]);
      return { id: job.id, paused: true };
    }
  });
}
