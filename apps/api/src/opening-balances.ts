import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { document, DomainError, outbox, warehouseScope } from './db.js';
import { type AuthedRequest, requirePermission } from './auth.js';
import { lockBalances, movement, mutation } from './inventory.js';
const uuid = z.string().uuid();
const line = z
  .object({
    sku: z.string().min(1).max(80),
    branch: z.string().min(1).max(100),
    warehouse: z.string().min(1).max(100),
    bin: z.string().max(40).default(''),
    condition: z.enum(['SELLABLE', 'QUARANTINE', 'DAMAGED']),
    quantity_counted: z.number().int().min(0).max(1000000),
    counted_by: uuid,
    approver: uuid.optional(),
    count_date: z.iso.date(),
    source_document: z.string().min(3).max(200),
  })
  .strict();
export function registerOpeningBalances(app: FastifyInstance, pool: Pool) {
  app.get('/api/opening-balances', async (request) => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor, 'counts');
    return {
      items: (
        await pool.query(
          `SELECT d.id,d.actor_id AS "countedBy",d.data,d.created_at AS "createdAt",posted.id AS "postedId" FROM business_documents d LEFT JOIN business_documents posted ON posted.org_id=d.org_id AND posted.kind='OPENING_BALANCE' AND posted.reference=d.id::text WHERE d.org_id=$1 AND d.kind='OPENING_PREVIEW' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d.data->'rows') r WHERE cardinality($2::uuid[])>0 AND NOT ((r->>'warehouseId')::uuid=ANY($2::uuid[]))) ORDER BY d.created_at DESC LIMIT 30`,
          [actor.org_id, actor.warehouse_ids],
        )
      ).rows,
    };
  });
  mutation(
    app,
    pool,
    '/api/opening-balances/preview',
    'counts',
    z.object({ fileHash: z.string().regex(/^[a-f0-9]{64}$/), rows: z.array(line).min(1).max(500) }).strict(),
    async (c, actor, d) => {
      const rows = [];
      const seen = new Set<string>();
      for (const row of d.rows) {
        if (row.counted_by !== actor.id) throw new DomainError('COUNT_AUTHOR_REQUIRED', 403);
        if (row.count_date > new Date().toISOString().slice(0, 10)) throw new DomainError('VALIDATION_ERROR');
        if (
          row.approver &&
          !(
            await c.query(
              "SELECT id FROM staff_users WHERE id=$1 AND org_id=$2 AND active AND role IN ('owner','manager')",
              [row.approver, actor.org_id],
            )
          ).rowCount
        )
          throw new DomainError('NOT_FOUND', 404);
        const p = (
          await c.query("SELECT id FROM products WHERE sku=$1 AND org_id=$2 AND status='ACTIVE_INTERNAL'", [
            row.sku,
            actor.org_id,
          ])
        ).rows[0];
        const w = (
          await c.query('SELECT id FROM warehouses WHERE code=$1 AND org_id=$2', [
            row.warehouse,
            actor.org_id,
          ])
        ).rows[0];
        if (!p || !w) throw new DomainError('NOT_FOUND', 404);
        warehouseScope(actor, w.id);
        let binId: string | undefined;
        if (row.bin) {
          binId = (
            await c.query('SELECT id FROM warehouse_bins WHERE warehouse_id=$1 AND code=$2', [w.id, row.bin])
          ).rows[0]?.id;
          if (!binId) throw new DomainError('NOT_FOUND', 404);
        }
        const identity = [p.id, w.id, binId ?? '', row.condition].join(':');
        if (seen.has(identity)) throw new DomainError('DUPLICATE_RECORD', 409);
        seen.add(identity);
        if (
          (
            await c.query('SELECT id FROM stock_movements WHERE product_id=$1 AND warehouse_id=$2 LIMIT 1', [
              p.id,
              w.id,
            ])
          ).rowCount
        )
          throw new DomainError('OPENING_ALREADY_MOVED', 409);
        rows.push({ ...row, productId: p.id, warehouseId: w.id, ...(binId ? { binId } : {}) });
      }
      const id = await document(c, actor, 'OPENING_PREVIEW', { fileHash: d.fileHash, rows });
      return { id, rows, status: 'REVIEW_REQUIRED' };
    },
  );
  mutation(
    app,
    pool,
    '/api/opening-balances/:id/approve',
    'approve',
    z.object({ note: z.string().trim().min(10).max(1000) }).strict(),
    async (c, actor, d, req) => {
      const id = uuid.parse((req.params as any).id),
        preview = (
          await c.query(
            "SELECT * FROM business_documents WHERE id=$1 AND org_id=$2 AND kind='OPENING_PREVIEW' FOR UPDATE",
            [id, actor.org_id],
          )
        ).rows[0];
      if (!preview) throw new DomainError('NOT_FOUND', 404);
      if (preview.actor_id === actor.id) throw new DomainError('SELF_APPROVAL_FORBIDDEN', 409);
      if (
        (
          await c.query(
            "SELECT id FROM business_documents WHERE org_id=$1 AND kind='OPENING_BALANCE' AND reference=$2",
            [actor.org_id, id],
          )
        ).rowCount
      )
        throw new DomainError('DUPLICATE_RECORD', 409);
      const rows = preview.data.rows;
      for (const row of rows)
        if (row.approver && row.approver !== actor.id) throw new DomainError('FORBIDDEN', 403);
      await lockBalances(c, actor, rows);
      // Recheck after acquiring the same balance locks used by receipt/sale/transfer.
      for (const row of rows) {
        if (
          (
            await c.query('SELECT id FROM stock_movements WHERE product_id=$1 AND warehouse_id=$2 LIMIT 1', [
              row.productId,
              row.warehouseId,
            ])
          ).rowCount
        )
          throw new DomainError('OPENING_ALREADY_MOVED', 409);
      }
      const posted = await document(
        c,
        actor,
        'OPENING_BALANCE',
        { previewId: id, countedBy: preview.actor_id, fileHash: preview.data.fileHash, rows, note: d.note },
        id,
      );
      for (const row of rows)
        await movement(c, actor, posted, row.productId, row.warehouseId, 'OPENING_BALANCE', req.id, {
          ...(row.binId ? { binId: row.binId } : {}),
          [row.condition === 'SELLABLE'
            ? 'onHand'
            : row.condition === 'QUARANTINE'
              ? 'quarantine'
              : 'damaged']: row.quantity_counted,
        });
      await outbox(c, actor, 'OpeningBalanceApproved', posted, { previewId: id });
      return { id: posted, previewId: id, status: 'COMPLETED' };
    },
  );
}
