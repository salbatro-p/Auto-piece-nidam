import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { DomainError, normalize } from './db.js';
import { type AuthedRequest, requirePermission } from './auth.js';
import { mutation } from './inventory.js';
const uuid = z.string().uuid();

export function registerCatalogLinks(app: FastifyInstance, pool: Pool) {
  app.get('/api/suppliers/:id/items', async (request) => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor, 'suppliers');
    const id = uuid.parse((request.params as any).id);
    const rows = (
      await pool.query(
        `SELECT i.product_id AS "productId",p.sku,p.names,i.reference,i.cost_minor,i.version
      FROM supplier_items i JOIN suppliers s ON s.id=i.supplier_id JOIN products p ON p.id=i.product_id
      WHERE s.id=$1 AND s.org_id=$2 AND p.org_id=$2 ORDER BY p.sku LIMIT 500`,
        [id, actor.org_id],
      )
    ).rows;
    return {
      items: rows.map(({ cost_minor, ...row }) => ({
        ...row,
        ...(actor.permissions.includes('costs') ? { costMinor: Number(cost_minor) } : {}),
      })),
    };
  });
  mutation(
    app,
    pool,
    '/api/suppliers/:id/items',
    'suppliers',
    z
      .object({
        productId: uuid,
        reference: z.string().trim().min(1).max(200),
        costMinor: z.number().int().min(0).max(100000000),
        version: z.number().int().min(0),
      })
      .strict(),
    async (c, actor, d, req) => {
      requirePermission(actor, 'costs');
      const id = uuid.parse((req.params as any).id);
      if (
        !(await c.query('SELECT id FROM suppliers WHERE id=$1 AND org_id=$2 FOR UPDATE', [id, actor.org_id]))
          .rowCount
      )
        throw new DomainError('NOT_FOUND', 404);
      if (
        !(
          await c.query(
            "SELECT id FROM products WHERE id=$1 AND org_id=$2 AND status<>'ARCHIVED' FOR SHARE",
            [d.productId, actor.org_id],
          )
        ).rowCount
      )
        throw new DomainError('NOT_FOUND', 404);
      const current = (
        await c.query('SELECT version FROM supplier_items WHERE supplier_id=$1 AND product_id=$2', [
          id,
          d.productId,
        ])
      ).rows[0];
      if ((current?.version ?? 0) !== d.version) throw new DomainError('EDIT_CONFLICT', 409);
      const row = (
        await c.query(
          `INSERT INTO supplier_items(supplier_id,product_id,reference,cost_minor) VALUES($1,$2,$3,$4)
      ON CONFLICT(supplier_id,product_id) DO UPDATE SET reference=EXCLUDED.reference,cost_minor=EXCLUDED.cost_minor,version=supplier_items.version+1,updated_at=now() RETURNING version`,
          [id, d.productId, d.reference, d.costMinor],
        )
      ).rows[0];
      // Retain historical supplier identifiers for exact reference lookup and audit continuity.
      await c.query(
        "INSERT INTO product_identifiers(product_id,type,raw_value,normalized_value) VALUES($1,'SUPPLIER',$2,$3) ON CONFLICT DO NOTHING",
        [d.productId, d.reference, normalize(d.reference)],
      );
      return { productId: d.productId, version: row.version };
    },
  );
  app.get('/api/products/:id/replacements', async (request) => {
    const actor = (request as AuthedRequest).actor,
      id = uuid.parse((request.params as any).id);
    const rows = (
      await pool.query(
        `SELECT r.replacement_id AS "replacementId",p.sku,p.names,r.source_id AS "sourceId",s.name AS "sourceName",s.can_store AS "sourceAllowed",r.evidence,r.active,r.version,r.created_at AS "createdAt"
      FROM product_replacements r JOIN products original ON original.id=r.product_id JOIN products p ON p.id=r.replacement_id JOIN sources s ON s.id=r.source_id
      WHERE original.id=$1 AND original.org_id=$2 AND p.org_id=$2 AND s.org_id=$2 ORDER BY r.created_at DESC`,
        [id, actor.org_id],
      )
    ).rows;
    return { items: rows };
  });
  mutation(
    app,
    pool,
    '/api/products/:id/replacements',
    'catalog',
    z.object({ replacementId: uuid, sourceId: uuid, evidence: z.string().trim().min(10).max(2000) }).strict(),
    async (c, actor, d, req) => {
      const id = uuid.parse((req.params as any).id);
      if (id === d.replacementId) throw new DomainError('INVALID_REPLACEMENT', 409);
      // Serialize edits to this organization's directed supersession graph, including reverse edges.
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`replacements:${actor.org_id}`]);
      const valid = await c.query(
        "SELECT id FROM products WHERE id=ANY($1::uuid[]) AND org_id=$2 AND status<>'ARCHIVED' ORDER BY id FOR SHARE",
        [[id, d.replacementId], actor.org_id],
      );
      if (valid.rowCount !== 2) throw new DomainError('NOT_FOUND', 404);
      if (
        !(
          await c.query('SELECT id FROM sources WHERE id=$1 AND org_id=$2 AND can_store FOR SHARE', [
            d.sourceId,
            actor.org_id,
          ])
        ).rowCount
      )
        throw new DomainError('SOURCE_RIGHTS_REQUIRED', 409);
      const cycle = await c.query(
        `WITH RECURSIVE successors(id) AS (SELECT $1::uuid UNION SELECT r.replacement_id FROM product_replacements r JOIN successors s ON s.id=r.product_id WHERE r.active) SELECT id FROM successors WHERE id=$2`,
        [d.replacementId, id],
      );
      if (cycle.rowCount) throw new DomainError('INVALID_REPLACEMENT', 409);
      await c.query(
        'INSERT INTO product_replacements(product_id,replacement_id,source_id,evidence,reviewed_by) VALUES($1,$2,$3,$4,$5)',
        [id, d.replacementId, d.sourceId, d.evidence, actor.id],
      );
      return { productId: id, replacementId: d.replacementId, version: 1 };
    },
  );
  mutation(
    app,
    pool,
    '/api/products/:id/replacements/withdraw',
    'catalog',
    z
      .object({
        replacementId: uuid,
        version: z.number().int().positive(),
        reason: z.string().trim().min(10).max(1000),
      })
      .strict(),
    async (c, actor, d, req) => {
      const id = uuid.parse((req.params as any).id);
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`replacements:${actor.org_id}`]);
      const result = await c.query(
        `UPDATE product_replacements r SET active=false,version=r.version+1 FROM products p WHERE r.product_id=p.id AND p.org_id=$1 AND p.id=$2 AND r.replacement_id=$3 AND r.version=$4 AND r.active RETURNING r.version`,
        [actor.org_id, id, d.replacementId, d.version],
      );
      if (!result.rowCount) throw new DomainError('EDIT_CONFLICT', 409);
      return {
        productId: id,
        replacementId: d.replacementId,
        version: result.rows[0].version,
        active: false,
      };
    },
  );
}
