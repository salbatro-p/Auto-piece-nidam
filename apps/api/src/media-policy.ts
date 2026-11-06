import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { type Actor, DomainError, audit } from './db.js';
import { type AuthedRequest, requirePermission } from './auth.js';
import { mutation } from './inventory.js';
const uuid = z.string().uuid();
export const mediaKinds = [
  'EXACT_PRODUCT_PHOTO',
  'COMPANY_ORIGINAL_PHOTO',
  'GENERIC_CATEGORY_ILLUSTRATION',
  'VEHICLE_PHOTO',
  'EXPLODED_DIAGRAM',
] as const;
export const licenseSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    sourceType: z.enum(['COMPANY', 'SUPPLIER', 'LICENSED_CATALOG', 'OTHER']),
    sourceId: uuid.optional(),
    termsVersion: z.string().trim().min(1).max(200),
    proof: z.string().trim().min(10).max(4000),
    internalDisplayPermitted: z.boolean(),
    publicDisplayPermitted: z.boolean(),
    attributionText: z.string().max(500).default(''),
    territory: z.string().min(2).max(100).default('MA'),
    restrictions: z.string().max(2000).default(''),
    expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
  })
  .strict();
export async function licenseFor(c: PoolClient | Pool, actor: Actor, id: string, display = false) {
  const row = (
    await c.query(
      `SELECT l.*,s.can_store,s.can_display,s.can_syndicate FROM media_source_licenses l LEFT JOIN sources s ON s.id=l.source_id AND s.org_id=l.org_id WHERE l.id=$1 AND l.org_id=$2`,
      [id, actor.org_id],
    )
  ).rows[0];
  if (!row) throw new DomainError('NOT_FOUND', 404);
  if (
    row.revoked_at ||
    (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) ||
    (row.source_id && !row.can_store) ||
    (display && (!row.internal_display_permitted || (row.source_id && !row.can_display)))
  )
    throw new DomainError('MEDIA_RIGHTS_BLOCKED', 409);
  return row;
}
async function validate(c: PoolClient, actor: Actor, d: z.infer<typeof licenseSchema>) {
  if (d.publicDisplayPermitted && (!d.internalDisplayPermitted || !['owner', 'manager'].includes(actor.role)))
    throw new DomainError('FORBIDDEN', 403);
  if (d.sourceType !== 'COMPANY' && !d.sourceId) throw new DomainError('SOURCE_RIGHTS_REQUIRED', 409);
  if (
    d.sourceId &&
    !(
      await c.query('SELECT id FROM sources WHERE id=$1 AND org_id=$2 AND can_store', [
        d.sourceId,
        actor.org_id,
      ])
    ).rowCount
  )
    throw new DomainError('SOURCE_RIGHTS_REQUIRED', 409);
}
export async function createMediaLicense(c: PoolClient, actor: Actor, d: z.infer<typeof licenseSchema>) {
  await validate(c, actor, d);
  return (
    await c.query(
      `INSERT INTO media_source_licenses(org_id,source_id,source_type,name,terms_version,proof,internal_display_permitted,public_display_permitted,attribution_text,territory,restrictions,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,version`,
      [
        actor.org_id,
        d.sourceId ?? null,
        d.sourceType,
        d.name,
        d.termsVersion,
        d.proof,
        d.internalDisplayPermitted,
        d.publicDisplayPermitted,
        d.attributionText,
        d.territory,
        d.restrictions,
        d.expiresAt,
        actor.id,
      ],
    )
  ).rows[0];
}
export function registerMediaPolicies(app: FastifyInstance, pool: Pool) {
  app.get('/api/media/licenses', async (request) => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor, 'catalog');
    return {
      items: (
        await pool.query(
          `SELECT id,name,source_id AS "sourceId",source_type AS "sourceType",terms_version AS "termsVersion",proof,internal_display_permitted AS "internalDisplayPermitted",public_display_permitted AS "publicDisplayPermitted",attribution_text AS "attributionText",territory,restrictions,expires_at AS "expiresAt",revoked_at AS "revokedAt",version FROM media_source_licenses WHERE org_id=$1 ORDER BY created_at DESC LIMIT 1000`,
          [actor.org_id],
        )
      ).rows,
    };
  });
  mutation(app, pool, '/api/media/licenses', 'catalog', licenseSchema, async (c, actor, d, req) => {
    const result = await createMediaLicense(c, actor, d);
    await audit(c, actor, 'MEDIA_LICENSE_CREATED', result.id, d, req.id);
    return result;
  });
  mutation(
    app,
    pool,
    '/api/media/licenses/:id/update',
    'catalog',
    licenseSchema.extend({ version: z.number().int().positive(), revoked: z.boolean().default(false) }),
    async (c, actor, d, req) => {
      await validate(c, actor, d);
      const id = uuid.parse((req.params as any).id);
      const previous = (
        await c.query('SELECT * FROM media_source_licenses WHERE id=$1 AND org_id=$2 FOR UPDATE', [
          id,
          actor.org_id,
        ])
      ).rows[0];
      const result = await c.query(
        `UPDATE media_source_licenses SET source_id=$3,source_type=$4,name=$5,terms_version=$6,proof=$7,internal_display_permitted=$8,public_display_permitted=$9,attribution_text=$10,territory=$11,restrictions=$12,expires_at=$13,revoked_at=CASE WHEN $14 THEN COALESCE(revoked_at,now()) ELSE NULL END,version=version+1 WHERE id=$1 AND org_id=$2 AND version=$15 RETURNING id,version`,
        [
          id,
          actor.org_id,
          d.sourceId ?? null,
          d.sourceType,
          d.name,
          d.termsVersion,
          d.proof,
          d.internalDisplayPermitted,
          d.publicDisplayPermitted,
          d.attributionText,
          d.territory,
          d.restrictions,
          d.expiresAt,
          d.revoked,
          d.version,
        ],
      );
      if (!result.rowCount) throw new DomainError('EDIT_CONFLICT', 409);
      await audit(c, actor, 'MEDIA_LICENSE_UPDATED', id, { previous, current: d }, req.id);
      return result.rows[0];
    },
  );
}
