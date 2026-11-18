import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { permissions, requirePermission, type AuthedRequest } from './auth.js';
import { audit, DomainError, transaction, type Actor } from './db.js';
import { mutation } from './inventory.js';
import { licenseFor } from './media-policy.js';
import { readMediaObject, storeMedia } from './media-store.js';
import { localRenderer, proceduralProvider, templateVersion, visualKinds, visualTemplates, type VisualProvider } from './visual-renderer.js';

const uuid = z.string().uuid();
const category = z.string().trim().min(1).max(100);
const requestSchema = z.object({
  category,
  kind: z.enum(visualKinds),
  template: z.enum(visualTemplates),
  licenseId: uuid,
}).strict();
const columns = `v.id,v.category,v.kind,v.template,v.provider,v.template_version AS "templateVersion",
  v.license_id AS "licenseId",v.license_version AS "licenseVersion",v.state,v.dimensions,
  v.attempts,v.last_error AS "lastError",v.created_at AS "createdAt",v.rendered_at AS "renderedAt",
  v.reviewed_at AS "reviewedAt",v.checksum,l.name AS "licenseName",l.attribution_text AS "attribution"`;
const rightsCurrent = `l.internal_display_permitted
  AND l.version=v.license_version AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at>now())
  AND (l.source_id IS NULL OR (s.org_id=v.org_id AND s.can_store AND s.can_display))`;
const displayable = `v.state='APPROVED_INTERNAL' AND ${rightsCurrent}`;

async function currentLicense(client: PoolClient, actor: Actor, row: { license_id: string; license_version: number }) {
  const license = await licenseFor(client,actor,row.license_id,true);
  if (license.version !== row.license_version || license.source_type !== 'COMPANY')
    throw new DomainError('MEDIA_RIGHTS_BLOCKED',409);
  return license;
}

export function registerOriginalVisuals(app: FastifyInstance, pool: Pool) {
  app.get('/api/visuals', async request => {
    const actor = (request as AuthedRequest).actor;
    const q = z.object({ category: category.optional() }).strict().parse(request.query);
    if (!q.category) requirePermission(actor,'catalog');
    const args = q.category ? [actor.org_id,q.category] : [actor.org_id];
    const filter = q.category ? `AND v.category=$2 AND ${displayable}` : '';
    const projection = q.category
      ? 'v.id,v.kind,v.template,l.attribution_text AS attribution'
      : `${columns},(${displayable}) AS "displayApproved",(${rightsCurrent}) AS "rightsCurrent"`;
    const items = (await pool.query(
      `SELECT ${projection}
       FROM original_visual_jobs v JOIN media_source_licenses l ON l.id=v.license_id AND l.org_id=v.org_id
       LEFT JOIN sources s ON s.id=l.source_id WHERE v.org_id=$1 ${filter}
       ORDER BY v.reviewed_at DESC NULLS LAST,v.created_at DESC,v.id LIMIT ${q.category ? 10 : 50}`, args,
    )).rows;
    return { items };
  });
  app.get('/api/visuals/:id/image', async (request, reply) => {
    const actor = (request as AuthedRequest).actor;
    const id = uuid.parse((request.params as { id: string }).id);
    const { size } = z.object({ size: z.enum(['thumbnail','display']).default('thumbnail') }).parse(request.query);
    const row = (await pool.query(
      `SELECT v.thumbnail_key,v.display_key,v.state,(${displayable}) AS displayable,(${rightsCurrent}) AS rights_current
       FROM original_visual_jobs v JOIN media_source_licenses l ON l.id=v.license_id AND l.org_id=v.org_id
       LEFT JOIN sources s ON s.id=l.source_id WHERE v.org_id=$1 AND v.id=$2`, [actor.org_id,id],
    )).rows[0];
    if (!row || !row.rights_current || (!row.displayable && !(row.state === 'REVIEW_REQUIRED' && actor.permissions.includes('catalog'))))
      throw new DomainError('NOT_FOUND',404);
    const key = size === 'display' ? row.display_key : row.thumbnail_key;
    if (!key) throw new DomainError('IMAGE_UNAVAILABLE',404);
    return reply.type('image/webp').send(await readMediaObject(key));
  });
  mutation(app,pool,'/api/visuals','catalog',requestSchema,async (c,actor,data: z.infer<typeof requestSchema>,req) => {
    const known = await c.query("SELECT 1 FROM products WHERE org_id=$1 AND category=$2 AND status<>'ARCHIVED' LIMIT 1",[actor.org_id,data.category]);
    if (!known.rowCount) throw new DomainError('NOT_FOUND',404);
    const license = await licenseFor(c,actor,data.licenseId,true);
    if (license.source_type !== 'COMPANY') throw new DomainError('MEDIA_RIGHTS_BLOCKED',409);
    const values = [actor.org_id,data.category,data.kind,data.template,localRenderer,templateVersion,data.licenseId,license.version,actor.id];
    const created = await c.query(
      `INSERT INTO original_visual_jobs(org_id,category,kind,template,provider,template_version,license_id,license_version,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING id,state`,values,
    );
    if (!created.rowCount) return (await c.query(
      `SELECT id,state FROM original_visual_jobs WHERE org_id=$1 AND category=$2 AND kind=$3 AND template=$4
       AND provider=$5 AND template_version=$6 AND license_id=$7 AND license_version=$8`,values.slice(0,8),
    )).rows[0];
    const job = created.rows[0];
    await audit(c,actor,'ORIGINAL_VISUAL_QUEUED',job.id,{ category: data.category,kind: data.kind,template: data.template,provider: localRenderer,estimatedCostMinor: 0 },req.id);
    return job;
  });
  mutation(app,pool,'/api/visuals/:id/review','catalog',z.object({
    decision: z.enum(['APPROVED_INTERNAL','REJECTED','QUEUED']),
    note: z.string().trim().min(8).max(1000),
  }).strict(),async (c,actor,data,req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const row = (await c.query('SELECT * FROM original_visual_jobs WHERE id=$1 AND org_id=$2 FOR UPDATE',[id,actor.org_id])).rows[0];
    if (!row) throw new DomainError('NOT_FOUND',404);
    if (data.decision !== 'REJECTED') await currentLicense(c,actor,row);
    if (
      (data.decision === 'QUEUED' && row.state !== 'FAILED') ||
      (data.decision === 'APPROVED_INTERNAL' && row.state !== 'REVIEW_REQUIRED') ||
      (data.decision === 'REJECTED' && !['REVIEW_REQUIRED','APPROVED_INTERNAL'].includes(row.state))
    ) throw new DomainError('EDIT_CONFLICT',409);
    await c.query(
      'UPDATE original_visual_jobs SET state=$2,reviewed_by=$3,reviewed_at=now(),last_error=NULL WHERE id=$1',
      [id,data.decision,actor.id],
    );
    await audit(c,actor,'ORIGINAL_VISUAL_REVIEWED',id,{ decision: data.decision, previous: row.state, note: data.note },req.id);
    return { id,state: data.decision };
  });
}

export async function processOriginalVisual(
  pool: Pool,
  providers: Record<string,VisualProvider> = { [localRenderer]: proceduralProvider },
) {
  return transaction(pool,async c => {
    const row = (await c.query(
      "SELECT * FROM original_visual_jobs WHERE state='QUEUED' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
    )).rows[0];
    if (!row) return;
    try {
      const user = (await c.query('SELECT * FROM staff_users WHERE id=$1 AND org_id=$2 AND active',[row.created_by,row.org_id])).rows[0];
      if (!user) throw new DomainError('FORBIDDEN',403);
      const actor: Actor = { ...user, permissions: permissions[user.role] ?? [] };
      requirePermission(actor,'catalog');
      await currentLicense(c,actor,row);
      const provider = providers[row.provider];
      if (!provider) throw new DomainError('IMPORT_INTERRUPTED',409);
      const bytes = await provider.render({ template: row.template,kind: row.kind,requestId: row.id });
      const stored = await storeMedia(bytes.toString('base64'),'image/png');
      await c.query(
        `UPDATE original_visual_jobs SET state='REVIEW_REQUIRED',object_key=$2,display_key=$3,thumbnail_key=$4,checksum=$5,
         dimensions=$6,attempts=attempts+1,rendered_at=now() WHERE id=$1`,
        [row.id,stored.objectKey,stored.displayKey,stored.thumbnailKey,stored.checksum,stored.dimensions],
      );
      return { id: row.id,state: 'REVIEW_REQUIRED' };
    } catch (error) {
      const code = error instanceof DomainError ? error.code : 'IMPORT_INTERRUPTED';
      await c.query("UPDATE original_visual_jobs SET state='FAILED',last_error=$2,attempts=attempts+1 WHERE id=$1",[row.id,code]);
      return { id: row.id,state: 'FAILED' };
    }
  });
}
