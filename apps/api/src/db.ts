import { Pool, type PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';

export const ORG_ID = '00000000-0000-4000-8000-000000000001';
export const createPool = () =>
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 30,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  });
export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export type Actor = {
  id: string;
  org_id: string;
  name: string;
  role: string;
  locale: string;
  warehouse_ids: string[];
  permissions: string[];
};
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u064B-\u065F\u0670]/g, '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]/gu, '');
export async function audit(
  c: PoolClient | Pool,
  actor: Actor,
  action: string,
  objectId: string | null,
  data: unknown,
  requestId: string,
) {
  await c.query(
    'INSERT INTO audit_events(org_id,actor_id,action,object_id,data,request_id) VALUES($1,$2,$3,$4,$5,$6)',
    [actor.org_id, actor.id, action, objectId, JSON.stringify(data), requestId],
  );
}
export async function transaction<T>(pool: Pool, work: (c: PoolClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SET LOCAL lock_timeout='5s'");
      await c.query("SET LOCAL statement_timeout='15s'");
      const result = await work(c);
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      if (attempt < 2 && ['40001', '40P01'].includes((e as { code: string }).code)) {
        await new Promise((r) => setTimeout(r, 30 * (attempt + 1)));
        continue;
      }
      throw e;
    } finally {
      c.release();
    }
  }
}
export async function mutate(
  pool: Pool,
  actor: Actor,
  key: string,
  route: string,
  body: unknown,
  requestId: string,
  work: (c: PoolClient) => Promise<unknown>,
) {
  if (!key || key.length < 8 || key.length > 100) throw new DomainError('IDEMPOTENCY_REQUIRED');
  const requestHash = hash(JSON.stringify({ route, body }));
  return transaction(pool, async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `${actor.org_id}:${actor.id}:${key}`,
    ]);
    const previous = await c.query(
      'SELECT request_hash,response FROM idempotency WHERE org_id=$1 AND actor_id=$2 AND key=$3',
      [actor.org_id, actor.id, key],
    );
    if (previous.rowCount) {
      if (previous.rows[0].request_hash !== requestHash) throw new DomainError('IDEMPOTENCY_CONFLICT', 409);
      return previous.rows[0].response;
    }
    const response = await work(c);
    await c.query(
      'INSERT INTO idempotency(org_id,actor_id,key,request_hash,response) VALUES($1,$2,$3,$4,$5)',
      [actor.org_id, actor.id, key, requestHash, JSON.stringify(response)],
    );
    await audit(c, actor, route, null, { idempotencyKey: key }, requestId);
    return response;
  });
}
export async function document(c: PoolClient, actor: Actor, kind: string, data: unknown, reference?: string) {
  const id = randomUUID();
  await c.query(
    'INSERT INTO business_documents(id,org_id,kind,reference,actor_id,data) VALUES($1,$2,$3,$4,$5,$6)',
    [id, actor.org_id, kind, reference ?? null, actor.id, JSON.stringify(data)],
  );
  return id;
}
export async function outbox(
  c: PoolClient,
  actor: Actor,
  kind: string,
  aggregateId: string,
  payload: unknown,
) {
  await c.query(
    'INSERT INTO outbox_events(org_id,kind,aggregate_id,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
    [actor.org_id, kind, aggregateId, JSON.stringify(payload)],
  );
}
export function warehouseScope(actor: Actor, id: string) {
  if (actor.warehouse_ids.length && !actor.warehouse_ids.includes(id))
    throw new DomainError('FORBIDDEN', 403);
}
