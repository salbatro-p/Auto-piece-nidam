import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  type Actor,
  audit,
  document,
  DomainError,
  mutate,
  outbox,
  transaction,
  warehouseScope,
} from './db.js';
import { type AuthedRequest, localeSchema, requirePermission } from './auth.js';
import { postBinDeltas } from './bins.js';
import { readTax } from './pricing.js';
import { priceTotals } from '../../../packages/contracts/src/pricing.js';

const uuid = z.string().uuid();
declare module 'fastify' {
  interface FastifyContextConfig { domainMutation?:boolean; requestBodySchema?:Record<string,unknown>; }
}
const qty = z.number().int().positive().max(1000000);
const lineSchema = z.object({ productId: uuid, quantity: qty }).strict();
const linesSchema = z
  .array(lineSchema)
  .min(1)
  .max(100)
  .refine((lines) => new Set(lines.map((l) => l.productId)).size === lines.length);
export type StockLine = { productId: string; quantity: number };
export async function lockBalances(
  c: PoolClient,
  actor: Actor,
  pairs: { productId: string; warehouseId: string }[],
) {
  const sorted = [...new Map(pairs.map((p) => [`${p.productId}:${p.warehouseId}`, p])).values()].sort(
    (a, b) => `${a.productId}:${a.warehouseId}`.localeCompare(`${b.productId}:${b.warehouseId}`),
  );
  for (const pair of sorted) {
    warehouseScope(actor, pair.warehouseId);
    const valid = await c.query(
      "SELECT p.id FROM products p JOIN warehouses w ON w.org_id=p.org_id WHERE p.id=$1 AND w.id=$2 AND p.org_id=$3 AND p.status<>'ARCHIVED' FOR SHARE OF p",
      [pair.productId, pair.warehouseId, actor.org_id],
    );
    if (!valid.rowCount) throw new DomainError('NOT_FOUND', 404);
    await c.query(
      'INSERT INTO inventory_balances(org_id,product_id,warehouse_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
      [actor.org_id, pair.productId, pair.warehouseId],
    );
    await c.query('SELECT 1 FROM inventory_balances WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE', [
      pair.productId,
      pair.warehouseId,
    ]);
  }
}
export async function movement(
  c: PoolClient,
  actor: Actor,
  docId: string,
  productId: string,
  warehouseId: string,
  kind: string,
  requestId: string,
  delta: { onHand?: number; reserved?: number; quarantine?: number; damaged?: number; binId?: string },
) {
  const d = [delta.onHand ?? 0, delta.reserved ?? 0, delta.quarantine ?? 0, delta.damaged ?? 0];
  const result = await c.query(
    `UPDATE inventory_balances SET on_hand=on_hand+$3,reserved=reserved+$4,quarantine=quarantine+$5,damaged=damaged+$6,version=version+1 WHERE product_id=$1 AND warehouse_id=$2 AND on_hand+$3>=0 AND reserved+$4>=0 AND reserved+$4<=on_hand+$3 AND quarantine+$5>=0 AND damaged+$6>=0 RETURNING *`,
    [productId, warehouseId, ...d],
  );
  if (!result.rowCount) throw new DomainError('INSUFFICIENT_STOCK', 409);
  await c.query(
    'INSERT INTO stock_movements(org_id,document_id,product_id,warehouse_id,kind,on_hand_delta,reserved_delta,quarantine_delta,damaged_delta,actor_id,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [actor.org_id, docId, productId, warehouseId, kind, ...d, actor.id, requestId],
  );
  await postBinDeltas(c, actor, docId, productId, warehouseId, kind, delta);
  return result.rows[0];
}
export function mutation(
  app: FastifyInstance,
  pool: Pool,
  path: string,
  permission: string,
  schema: z.ZodTypeAny,
  handler: (c: PoolClient, actor: Actor, data: any, request: FastifyRequest) => Promise<unknown>,
) {
  app.post(path, {config:{domainMutation:true,requestBodySchema:z.toJSONSchema(schema,{unrepresentable:'any'})}}, async (request) => {
    const req = request as AuthedRequest;
    requirePermission(req.actor, permission);
    const data = schema.parse(request.body);
    return mutate(
      pool,
      req.actor,
      String(request.headers['idempotency-key'] ?? ''),
      request.url,
      request.body,
      request.id,
      (c) => handler(c, req.actor, data, request),
    );
  });
}
async function reservation(c: PoolClient, actor: Actor, id: string) {
  const r = await c.query('SELECT * FROM reservations WHERE id=$1 AND org_id=$2 FOR UPDATE', [
    id,
    actor.org_id,
  ]);
  if (!r.rowCount) throw new DomainError('NOT_FOUND', 404);
  warehouseScope(actor, r.rows[0].warehouse_id);
  return r.rows[0];
}
async function release(
  c: PoolClient,
  actor: Actor,
  id: string,
  status: 'RELEASED' | 'EXPIRED',
  requestId: string,
) {
  const r = await reservation(c, actor, id);
  if (r.status !== 'ACTIVE') return { id, status: r.status };
  const lines = (
    await c.query(
      'SELECT product_id AS "productId",quantity FROM reservation_lines WHERE reservation_id=$1 ORDER BY product_id',
      [id],
    )
  ).rows;
  await lockBalances(
    c,
    actor,
    lines.map((l) => ({ productId: l.productId, warehouseId: r.warehouse_id })),
  );
  const doc = await document(c, actor, status, { reservationId: id });
  for (const line of lines)
    await movement(c, actor, doc, line.productId, r.warehouse_id, status, requestId, {
      reserved: -line.quantity,
    });
  await c.query('UPDATE reservations SET status=$2 WHERE id=$1', [id, status]);
  await outbox(c, actor, 'ReservationReleased', id, { status });
  return { id, status };
}
export async function expireReservations(pool: Pool) {
  const expired = (
    await pool.query(
      "SELECT r.id AS reservation_id,u.* FROM reservations r JOIN staff_users u ON u.id=r.actor_id WHERE r.status='ACTIVE' AND r.expires_at<=now() ORDER BY r.expires_at LIMIT 100",
    )
  ).rows;
  for (const row of expired)
    await transaction(pool, (c) =>
      release(
        c,
        { ...row, warehouse_ids: [], permissions: [] },
        row.reservation_id,
        'EXPIRED',
        'reservation-expiry',
      ),
    );
}
export function registerInventory(app: FastifyInstance, pool: Pool) {
  mutation(
    app,
    pool,
    '/api/inventory/receipts',
    'receive',
    z
      .object({
        productId: uuid,
        warehouseId: uuid,
        quantity: qty,
        unit: z.enum(['PCS', 'CARTON']),
        reference: z.string().trim().min(2).max(120),
        condition: z.enum(['SELLABLE', 'QUARANTINE', 'DAMAGED']).default('SELLABLE'),
        binId: uuid.optional(),
        purchaseId: uuid.optional(),
      })
      .strict(),
    async (c, actor, d, req) => {
      await lockBalances(c, actor, [d]);
      const p = (await c.query('SELECT pack_size FROM products WHERE id=$1', [d.productId])).rows[0];
      const pieces = d.quantity * (d.unit === 'CARTON' ? p.pack_size : 1);
      if (pieces > 10000000) throw new DomainError('VALIDATION_ERROR');
      if (d.purchaseId) {
        const po = (
          await c.query('SELECT * FROM purchase_orders WHERE id=$1 AND org_id=$2 FOR UPDATE', [
            d.purchaseId,
            actor.org_id,
          ])
        ).rows[0];
        if (!po || po.warehouse_id !== d.warehouseId || po.status === 'CANCELLED')
          throw new DomainError('INVALID_PURCHASE', 409);
        const updated = await c.query(
          'UPDATE purchase_lines SET received=received+$3 WHERE purchase_id=$1 AND product_id=$2 AND received+$3<=quantity RETURNING *',
          [d.purchaseId, d.productId, pieces],
        );
        if (!updated.rowCount) throw new DomainError('RECEIVING_DISCREPANCY', 409);
        await c.query(
          "UPDATE purchase_orders SET status=CASE WHEN EXISTS(SELECT 1 FROM purchase_lines WHERE purchase_id=$1 AND received<quantity) THEN 'PART_RECEIVED' ELSE 'RECEIVED' END WHERE id=$1",
          [d.purchaseId],
        );
      }
      const id = await document(c, actor, 'RECEIPT', { ...d, pieces }, d.reference);
      await movement(c, actor, id, d.productId, d.warehouseId, 'RECEIPT', req.id, {
        binId: d.binId,
        ...(d.condition === 'SELLABLE'
          ? { onHand: pieces }
          : d.condition === 'QUARANTINE'
            ? { quarantine: pieces }
            : { damaged: pieces }),
      });
      await outbox(c, actor, 'StockReceived', id, { productId: d.productId, pieces });
      return { id, status: 'COMPLETED', pieces };
    },
  );
  mutation(
    app,
    pool,
    '/api/inventory/reservations',
    'sell',
    z
      .object({
        warehouseId: uuid,
        lines: linesSchema,
        ttlMinutes: z.number().int().min(1).max(120).default(15),
      })
      .strict(),
    async (c, actor, d, req) => {
      await lockBalances(
        c,
        actor,
        d.lines.map((l: StockLine) => ({ ...l, warehouseId: d.warehouseId })),
      );
      const id = randomUUID();
      await c.query(
        "INSERT INTO reservations(id,org_id,warehouse_id,actor_id,expires_at) VALUES($1,$2,$3,$4,now()+$5*interval '1 minute')",
        [id, actor.org_id, d.warehouseId, actor.id, d.ttlMinutes],
      );
      const doc = await document(c, actor, 'RESERVATION', { id, lines: d.lines });
      for (const line of d.lines) {
        const active = (
          await c.query("SELECT id FROM products WHERE id=$1 AND status='ACTIVE_INTERNAL'", [line.productId])
        ).rowCount;
        if (!active) throw new DomainError('PRODUCT_NOT_ACTIVE', 409);
        await movement(c, actor, doc, line.productId, d.warehouseId, 'RESERVATION', req.id, {
          reserved: line.quantity,
        });
        await c.query('INSERT INTO reservation_lines(reservation_id,product_id,quantity) VALUES($1,$2,$3)', [
          id,
          line.productId,
          line.quantity,
        ]);
      }
      await outbox(c, actor, 'ReservationPlaced', id, { lines: d.lines });
      return { id, status: 'ACTIVE', lines: d.lines, warehouseId: d.warehouseId };
    },
  );
  mutation(
    app,
    pool,
    '/api/inventory/reservations/:id/release',
    'sell',
    z.object({}).strict(),
    async (c, actor, _d, req) => release(c, actor, uuid.parse((req.params as any).id), 'RELEASED', req.id),
  );
  mutation(
    app,
    pool,
    '/api/sales',
    'sell',
    z
      .object({
        warehouseId: uuid,
        lines: linesSchema,
        reservationId: uuid.optional(),
        locale: localeSchema,
        expectedTotalMinor: z.number().int().nonnegative().optional(),
      })
      .strict(),
    async (c, actor, d, req) => {
      if (d.reservationId) {
        const r = await reservation(c, actor, d.reservationId);
        if (
          r.status !== 'ACTIVE' ||
          new Date(r.expires_at).getTime() <= Date.now() ||
          r.warehouse_id !== d.warehouseId
        )
          throw new DomainError('RESERVATION_INVALID', 409);
        const rl = (
          await c.query(
            'SELECT product_id AS "productId",quantity FROM reservation_lines WHERE reservation_id=$1 ORDER BY product_id',
            [d.reservationId],
          )
        ).rows;
        if (
          JSON.stringify(rl) !==
          JSON.stringify([...d.lines].sort((a, b) => a.productId.localeCompare(b.productId)))
        )
          throw new DomainError('RESERVATION_INVALID', 409);
      }
      await lockBalances(
        c,
        actor,
        d.lines.map((l: StockLine) => ({ ...l, warehouseId: d.warehouseId })),
      );
      const saleLines = [];
      let total = 0;
      for (const line of d.lines) {
        const p = (
          await c.query("SELECT * FROM products WHERE id=$1 AND status='ACTIVE_INTERNAL'", [line.productId])
        ).rows[0];
        if (!p) throw new DomainError('PRODUCT_NOT_ACTIVE', 409);
        total += Number(p.price_minor) * line.quantity;
        if (!Number.isSafeInteger(total)) throw new DomainError('VALIDATION_ERROR');
        saleLines.push({ ...line, sku: p.sku, names: p.names, priceMinor: Number(p.price_minor) });
      }
      const tax = await readTax(c, actor.org_id, true),
        totals = priceTotals(saleLines, tax);
      total = totals.totalMinor;
      if (d.expectedTotalMinor !== undefined && d.expectedTotalMinor !== total)
        throw new DomainError('PRICE_CHANGED', 409);
      const id = randomUUID();
      await c.query(
        'INSERT INTO sales(id,org_id,warehouse_id,actor_id,reservation_id,total_minor,locale,subtotal_minor,tax_minor,tax_rate_bps,tax_inclusive,tax_configured) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [
          id,
          actor.org_id,
          d.warehouseId,
          actor.id,
          d.reservationId ?? null,
          total,
          d.locale,
          totals.subtotalMinor,
          totals.taxMinor,
          tax.rateBps,
          tax.inclusive,
          tax.configured,
        ],
      );
      const doc = await document(c, actor, 'SALE', { saleId: id });
      for (const line of saleLines) {
        await movement(c, actor, doc, line.productId, d.warehouseId, 'SALE', req.id, {
          onHand: -line.quantity,
          reserved: d.reservationId ? -line.quantity : 0,
        });
        await c.query(
          'INSERT INTO sale_lines(sale_id,product_id,sku,names,quantity,price_minor) VALUES($1,$2,$3,$4,$5,$6)',
          [id, line.productId, line.sku, line.names, line.quantity, line.priceMinor],
        );
      }
      if (d.reservationId)
        await c.query("UPDATE reservations SET status='FULFILLED' WHERE id=$1", [d.reservationId]);
      await outbox(c, actor, 'SaleConfirmed', id, { totalMinor: total });
      return {
        id,
        totalMinor: total,
        subtotalMinor: totals.subtotalMinor,
        taxMinor: totals.taxMinor,
        taxRateBps: tax.rateBps,
        taxInclusive: tax.inclusive,
        taxConfigured: tax.configured,
        lines: saleLines,
        status: 'COMPLETED',
        locale: d.locale,
        createdAt: new Date().toISOString(),
      };
    },
  );
  mutation(
    app,
    pool,
    '/api/inventory/transfers',
    'transfer',
    z
      .object({
        productId: uuid,
        fromWarehouseId: uuid,
        toWarehouseId: uuid,
        quantity: qty,
        reason: z.string().trim().min(3).max(300),
      })
      .strict()
      .refine((d) => d.fromWarehouseId !== d.toWarehouseId),
    async (c, actor, d, req) => {
      await lockBalances(c, actor, [
        { productId: d.productId, warehouseId: d.fromWarehouseId },
        { productId: d.productId, warehouseId: d.toWarehouseId },
      ]);
      const id = await document(c, actor, 'TRANSFER', d);
      await movement(c, actor, id, d.productId, d.fromWarehouseId, 'TRANSFER_OUT', req.id, {
        onHand: -d.quantity,
      });
      await movement(c, actor, id, d.productId, d.toWarehouseId, 'TRANSFER_IN', req.id, {
        onHand: d.quantity,
      });
      await outbox(c, actor, 'StockTransferred', id, d);
      return { id, status: 'COMPLETED' };
    },
  );
  mutation(
    app,
    pool,
    '/api/inventory/returns',
    'returns',
    z
      .object({
        saleId: uuid,
        productId: uuid,
        warehouseId: uuid,
        quantity: qty,
        reason: z.string().trim().min(3).max(300),
      })
      .strict(),
    async (c, actor, d, req) => {
      const sale = (
        await c.query('SELECT * FROM sales WHERE id=$1 AND org_id=$2 FOR UPDATE', [d.saleId, actor.org_id])
      ).rows[0];
      if (!sale) throw new DomainError('NOT_FOUND', 404);
      warehouseScope(actor, sale.warehouse_id);
      const changed = await c.query(
        'UPDATE sale_lines SET returned=returned+$3 WHERE sale_id=$1 AND product_id=$2 AND returned+$3<=quantity RETURNING *',
        [d.saleId, d.productId, d.quantity],
      );
      if (!changed.rowCount) throw new DomainError('RETURN_EXCEEDS_SALE', 409);
      await lockBalances(c, actor, [d]);
      const id = randomUUID();
      await c.query(
        'INSERT INTO returns(id,org_id,sale_id,product_id,warehouse_id,quantity,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, actor.org_id, d.saleId, d.productId, d.warehouseId, d.quantity, d.reason, actor.id],
      );
      const doc = await document(c, actor, 'RETURN_INTAKE', { returnId: id, ...d });
      await movement(c, actor, doc, d.productId, d.warehouseId, 'RETURN_INTAKE', req.id, {
        quarantine: d.quantity,
      });
      return { id, status: 'QUARANTINE' };
    },
  );
  mutation(
    app,
    pool,
    '/api/inventory/returns/:id/inspect',
    'approve',
    z.object({ condition: z.enum(['SELLABLE', 'DAMAGED']) }).strict(),
    async (c, actor, d, req) => {
      const id = uuid.parse((req.params as any).id);
      const r = (
        await c.query('SELECT * FROM returns WHERE id=$1 AND org_id=$2 FOR UPDATE', [id, actor.org_id])
      ).rows[0];
      if (!r) throw new DomainError('NOT_FOUND', 404);
      if (r.status !== 'QUARANTINE') throw new DomainError('ALREADY_PROCESSED', 409);
      await lockBalances(c, actor, [{ productId: r.product_id, warehouseId: r.warehouse_id }]);
      const doc = await document(c, actor, 'RETURN_INSPECTED', { returnId: id, condition: d.condition });
      await movement(c, actor, doc, r.product_id, r.warehouse_id, 'RETURN_INSPECTED', req.id, {
        quarantine: -r.quantity,
        ...(d.condition === 'SELLABLE' ? { onHand: r.quantity } : { damaged: r.quantity }),
      });
      await c.query('UPDATE returns SET status=$2,inspected_by=$3 WHERE id=$1', [id, d.condition, actor.id]);
      await outbox(c, actor, 'ReturnAccepted', id, d);
      return { id, status: d.condition };
    },
  );
  mutation(
    app,
    pool,
    '/api/inventory/counts',
    'counts',
    z
      .object({
        productId: uuid,
        warehouseId: uuid,
        counted: z.number().int().min(0).max(10000000),
        reason: z.string().trim().min(3).max(300),
      })
      .strict(),
    async (c, actor, d) => {
      await lockBalances(c, actor, [d]);
      const balance = (
        await c.query('SELECT * FROM inventory_balances WHERE product_id=$1 AND warehouse_id=$2', [
          d.productId,
          d.warehouseId,
        ])
      ).rows[0];
      const r = await c.query(
        'INSERT INTO stock_counts(org_id,product_id,warehouse_id,counted,expected,balance_version,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [
          actor.org_id,
          d.productId,
          d.warehouseId,
          d.counted,
          balance.on_hand,
          balance.version,
          d.reason,
          actor.id,
        ],
      );
      return { id: r.rows[0].id, status: 'PENDING', expected: balance.on_hand, counted: d.counted };
    },
  );
  mutation(
    app,
    pool,
    '/api/inventory/counts/:id/approve',
    'approve',
    z.object({}).strict(),
    async (c, actor, _d, req) => {
      const id = uuid.parse((req.params as any).id);
      const count = (
        await c.query('SELECT * FROM stock_counts WHERE id=$1 AND org_id=$2 FOR UPDATE', [id, actor.org_id])
      ).rows[0];
      if (!count) throw new DomainError('NOT_FOUND', 404);
      if (count.created_by === actor.id) throw new DomainError('SELF_APPROVAL_FORBIDDEN', 403);
      if (count.status !== 'PENDING') throw new DomainError('ALREADY_PROCESSED', 409);
      await lockBalances(c, actor, [{ productId: count.product_id, warehouseId: count.warehouse_id }]);
      const b = (
        await c.query('SELECT * FROM inventory_balances WHERE product_id=$1 AND warehouse_id=$2', [
          count.product_id,
          count.warehouse_id,
        ])
      ).rows[0];
      if (b.version !== count.balance_version) throw new DomainError('COUNT_STALE', 409);
      const doc = await document(c, actor, 'COUNT_ADJUSTMENT', { countId: id, reason: count.reason });
      await movement(c, actor, doc, count.product_id, count.warehouse_id, 'COUNT_ADJUSTMENT', req.id, {
        onHand: count.counted - count.expected,
      });
      await c.query("UPDATE stock_counts SET status='APPROVED',approved_by=$2 WHERE id=$1", [id, actor.id]);
      return { id, status: 'APPROVED' };
    },
  );
  app.get('/api/inventory/:kind', async (request) => {
    const req = request as AuthedRequest;
    const kind = (req.params as any).kind;
    const tables: Record<string, string> = {
      reservations: 'reservations',
      returns: 'returns',
      counts: 'stock_counts',
    };
    const table = tables[kind];
    if (!table) throw new DomainError('NOT_FOUND', 404);
    if (kind === 'counts') requirePermission(req.actor, 'counts');
    const rows = await pool.query(
      `SELECT * FROM ${table} WHERE org_id=$1 AND (cardinality($2::uuid[])=0 OR warehouse_id=ANY($2::uuid[])) ORDER BY created_at DESC LIMIT 200`,
      [req.actor.org_id, req.actor.warehouse_ids],
    );
    return {
      items: rows.rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, x) => x.toUpperCase()), v]),
        ),
      ),
    };
  });
  app.get('/api/inventory/movements', async (request) => {
    const req = request as AuthedRequest;
    requirePermission(req.actor, 'audit');
    const r = await pool.query(
      'SELECT m.*,p.sku FROM stock_movements m JOIN products p ON p.id=m.product_id WHERE m.org_id=$1 AND (cardinality($2::uuid[])=0 OR m.warehouse_id=ANY($2::uuid[])) ORDER BY m.created_at DESC LIMIT 200',
      [req.actor.org_id, req.actor.warehouse_ids],
    );
    return { items: r.rows };
  });
  app.get('/api/inventory/reconciliation', async (request) => {
    const req = request as AuthedRequest;
    requirePermission(req.actor, 'audit');
    const rows = (
      await pool.query(
        `SELECT b.product_id,b.warehouse_id,b.on_hand,b.reserved,b.quarantine,b.damaged,COALESCE(sum(m.on_hand_delta),0)::integer AS ledger_on_hand,COALESCE(sum(m.reserved_delta),0)::integer AS ledger_reserved,COALESCE(sum(m.quarantine_delta),0)::integer AS ledger_quarantine,COALESCE(sum(m.damaged_delta),0)::integer AS ledger_damaged FROM inventory_balances b LEFT JOIN stock_movements m USING(product_id,warehouse_id) WHERE b.org_id=$1 GROUP BY b.product_id,b.warehouse_id HAVING b.on_hand<>COALESCE(sum(m.on_hand_delta),0) OR b.reserved<>COALESCE(sum(m.reserved_delta),0) OR b.quarantine<>COALESCE(sum(m.quarantine_delta),0) OR b.damaged<>COALESCE(sum(m.damaged_delta),0)`,
        [req.actor.org_id],
      )
    ).rows;
    return { balanced: rows.length === 0, items: rows };
  });
  app.get('/api/sales', async (request) => {
    const req = request as AuthedRequest;
    if (!req.actor.permissions.some((p) => ['sell', 'returns', 'reports'].includes(p)))
      throw new DomainError('FORBIDDEN', 403);
    const items = (
      await pool.query(
        'SELECT id,total_minor AS "totalMinor",locale,status,created_at AS "createdAt",warehouse_id AS "warehouseId" FROM sales WHERE org_id=$1 AND (cardinality($2::uuid[])=0 OR warehouse_id=ANY($2::uuid[])) ORDER BY created_at DESC LIMIT 100',
        [req.actor.org_id, req.actor.warehouse_ids],
      )
    ).rows;
    return { items: items.map((s) => ({ ...s, totalMinor: Number(s.totalMinor) })) };
  });
  app.get('/api/sales/:id', async (request) => {
    const req = request as AuthedRequest;
    if (!req.actor.permissions.some((p) => ['sell', 'returns', 'reports'].includes(p)))
      throw new DomainError('FORBIDDEN', 403);
    const sale = (
      await pool.query('SELECT * FROM sales WHERE id=$1 AND org_id=$2', [
        uuid.parse((req.params as any).id),
        req.actor.org_id,
      ])
    ).rows[0];
    if (!sale) throw new DomainError('NOT_FOUND', 404);
    warehouseScope(req.actor, sale.warehouse_id);
    const lines = (
      await pool.query(
        'SELECT product_id AS "productId",sku,names,quantity,price_minor AS "priceMinor",returned FROM sale_lines WHERE sale_id=$1',
        [sale.id],
      )
    ).rows;
    return {
      id: sale.id,
      totalMinor: Number(sale.total_minor),
      subtotalMinor: Number(sale.subtotal_minor),
      taxMinor: Number(sale.tax_minor),
      taxRateBps: sale.tax_rate_bps,
      taxInclusive: sale.tax_inclusive,
      taxConfigured: sale.tax_configured,
      locale: sale.locale,
      status: sale.status,
      createdAt: sale.created_at,
      warehouseId: sale.warehouse_id,
      lines: lines.map((l) => ({ ...l, priceMinor: Number(l.priceMinor) })),
    };
  });
}
