import type { Pool, PoolClient } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type Actor, document, DomainError, outbox, warehouseScope } from './db.js';
import { type AuthedRequest } from './auth.js';
import { lockBalances, mutation } from './inventory.js';
const uuid = z.string().uuid();
const columns = { onHand: 'on_hand', quarantine: 'quarantine', damaged: 'damaged' } as const;
async function defaultBin(c: PoolClient, actor: Actor, warehouseId: string) {
  return (
    await c.query(
      "INSERT INTO warehouse_bins(org_id,warehouse_id,code,is_default) VALUES($1,$2,'RECEIVING',true) ON CONFLICT(warehouse_id,code) DO UPDATE SET code=EXCLUDED.code RETURNING id",
      [actor.org_id, warehouseId],
    )
  ).rows[0].id as string;
}
async function change(
  c: PoolClient,
  actor: Actor,
  docId: string,
  productId: string,
  binId: string,
  kind: string,
  column: string,
  delta: number,
) {
  await c.query('INSERT INTO bin_balances(product_id,bin_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [
    productId,
    binId,
  ]);
  const changed = await c.query(
    `UPDATE bin_balances SET ${column}=${column}+$3 WHERE product_id=$1 AND bin_id=$2 AND ${column}+$3>=0 RETURNING product_id`,
    [productId, binId, delta],
  );
  if (!changed.rowCount) throw new DomainError('INSUFFICIENT_BIN_STOCK', 409);
  await c.query(
    `INSERT INTO bin_movements(org_id,document_id,product_id,bin_id,kind,${column}_delta,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [actor.org_id, docId, productId, binId, kind, delta, actor.id],
  );
}
/** Warehouse reservation remains unassigned to a physical bin. Physical stock never exceeds its ledger. */
export async function postBinDeltas(
  c: PoolClient,
  actor: Actor,
  docId: string,
  productId: string,
  warehouseId: string,
  kind: string,
  delta: { onHand?: number; quarantine?: number; damaged?: number; binId?: string },
) {
  if (
    delta.binId &&
    !(
      await c.query('SELECT id FROM warehouse_bins WHERE id=$1 AND warehouse_id=$2 AND org_id=$3', [
        delta.binId,
        warehouseId,
        actor.org_id,
      ])
    ).rowCount
  )
    throw new DomainError('NOT_FOUND', 404);
  for (const [key, column] of Object.entries(columns)) {
    const amount = delta[key as keyof typeof columns] ?? 0;
    if (!amount) continue;
    if (amount > 0) {
      await change(
        c,
        actor,
        docId,
        productId,
        delta.binId ?? (await defaultBin(c, actor, warehouseId)),
        kind,
        column,
        amount,
      );
      continue;
    }
    const rows = (
      await c.query(
        `SELECT b.bin_id,b.${column} AS quantity FROM bin_balances b JOIN warehouse_bins w ON w.id=b.bin_id WHERE b.product_id=$1 AND w.warehouse_id=$2 AND ($3::uuid IS NULL OR b.bin_id=$3) AND b.${column}>0 ORDER BY w.is_default DESC,b.bin_id FOR UPDATE OF b`,
        [productId, warehouseId, delta.binId ?? null],
      )
    ).rows;
    let remaining = -amount;
    for (const row of rows) {
      const take = Math.min(remaining, row.quantity);
      await change(c, actor, docId, productId, row.bin_id, kind, column, -take);
      remaining -= take;
      if (!remaining) break;
    }
    if (remaining) throw new DomainError('INSUFFICIENT_BIN_STOCK', 409);
  }
}
export function registerBins(app: FastifyInstance, pool: Pool) {
  app.get('/api/bins', async (request) => {
    const actor = (request as AuthedRequest).actor;
    const d = z.object({ warehouseId: uuid.optional(), productId: uuid.optional() }).parse(request.query);
    if (d.warehouseId) warehouseScope(actor, d.warehouseId);
    return {
      items: (
        await pool.query(
          'SELECT w.id,w.code,w.warehouse_id AS "warehouseId",w.is_default AS "isDefault",COALESCE(b.on_hand,0) AS "onHand",COALESCE(b.quarantine,0) AS quarantine,COALESCE(b.damaged,0) AS damaged FROM warehouse_bins w LEFT JOIN bin_balances b ON b.bin_id=w.id AND b.product_id=$3 WHERE w.org_id=$1 AND ($2::uuid IS NULL OR w.warehouse_id=$2) AND (cardinality($4::uuid[])=0 OR w.warehouse_id=ANY($4::uuid[])) ORDER BY w.code',
          [actor.org_id, d.warehouseId ?? null, d.productId ?? null, actor.warehouse_ids],
        )
      ).rows,
    };
  });
  mutation(
    app,
    pool,
    '/api/bins',
    'transfer',
    z
      .object({
        warehouseId: uuid,
        code: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .refine((code) => code.toUpperCase() !== 'RECEIVING'),
      })
      .strict(),
    async (c, actor, d) => {
      warehouseScope(actor, d.warehouseId);
      if (
        !(await c.query('SELECT id FROM warehouses WHERE id=$1 AND org_id=$2', [d.warehouseId, actor.org_id]))
          .rowCount
      )
        throw new DomainError('NOT_FOUND', 404);
      return (
        await c.query(
          'INSERT INTO warehouse_bins(org_id,warehouse_id,code) VALUES($1,$2,$3) RETURNING id,code',
          [actor.org_id, d.warehouseId, d.code],
        )
      ).rows[0];
    },
  );
  mutation(
    app,
    pool,
    '/api/inventory/bin-transfers',
    'transfer',
    z
      .object({
        productId: uuid,
        warehouseId: uuid,
        fromBinId: uuid,
        toBinId: uuid,
        condition: z.enum(['SELLABLE', 'QUARANTINE', 'DAMAGED']),
        quantity: z.number().int().min(1).max(1000000),
        reason: z.string().trim().min(3).max(300),
      })
      .strict()
      .refine((d) => d.fromBinId !== d.toBinId),
    async (c, actor, d) => {
      await lockBalances(c, actor, [d]);
      const bins = (
        await c.query(
          'SELECT id FROM warehouse_bins WHERE id=ANY($1::uuid[]) AND warehouse_id=$2 AND org_id=$3',
          [[d.fromBinId, d.toBinId], d.warehouseId, actor.org_id],
        )
      ).rows;
      if (bins.length !== 2) throw new DomainError('NOT_FOUND', 404);
      const id = await document(c, actor, 'BIN_TRANSFER', d),
        column =
          d.condition === 'SELLABLE' ? 'on_hand' : d.condition === 'QUARANTINE' ? 'quarantine' : 'damaged';
      await change(c, actor, id, d.productId, d.fromBinId, 'BIN_TRANSFER_OUT', column, -d.quantity);
      await change(c, actor, id, d.productId, d.toBinId, 'BIN_TRANSFER_IN', column, d.quantity);
      await outbox(c, actor, 'BinStockTransferred', id, d);
      return { id, status: 'COMPLETED' };
    },
  );
  app.get('/api/bins/reconciliation', async (request) => {
    const actor = (request as AuthedRequest).actor;
    if (!actor.permissions.includes('audit')) throw new DomainError('FORBIDDEN', 403);
    const aggregate = (
      await pool.query(
        'SELECT b.product_id,b.warehouse_id FROM inventory_balances b LEFT JOIN (SELECT x.product_id,w.warehouse_id,sum(x.on_hand) on_hand,sum(x.quarantine) quarantine,sum(x.damaged) damaged FROM bin_balances x JOIN warehouse_bins w ON w.id=x.bin_id GROUP BY x.product_id,w.warehouse_id) bins ON bins.product_id=b.product_id AND bins.warehouse_id=b.warehouse_id WHERE b.org_id=$1 AND (b.on_hand<>coalesce(bins.on_hand,0) OR b.quarantine<>coalesce(bins.quarantine,0) OR b.damaged<>coalesce(bins.damaged,0))',
        [actor.org_id],
      )
    ).rows;
    const ledger = (
      await pool.query(
        'SELECT b.product_id,b.bin_id FROM bin_balances b JOIN warehouse_bins w ON w.id=b.bin_id LEFT JOIN bin_movements m ON m.product_id=b.product_id AND m.bin_id=b.bin_id WHERE w.org_id=$1 GROUP BY b.product_id,b.bin_id HAVING b.on_hand<>coalesce(sum(m.on_hand_delta),0) OR b.quarantine<>coalesce(sum(m.quarantine_delta),0) OR b.damaged<>coalesce(sum(m.damaged_delta),0)',
        [actor.org_id],
      )
    ).rows;
    return {
      balanced: !aggregate.length && !ledger.length,
      warehouseDifferences: aggregate,
      ledgerDifferences: ledger,
    };
  });
}
