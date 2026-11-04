import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { type Actor, audit, DomainError, hash, transaction, warehouseScope } from './db.js';
import {
  type AuthedRequest,
  localeSchema,
  passwordHash,
  protectSecret,
  requirePermission,
  roleSchema,
  totp,
} from './auth.js';
import { mutation } from './inventory.js';
import { insertProduct, productSchema } from './catalog.js';
const uuid = z.string().uuid();
export function registerOperations(app: FastifyInstance, pool: Pool) {
  app.get('/api/suppliers', async (request) => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor, 'suppliers');
    return {
      items: (
        await pool.query(
          'SELECT id,name,contact,lead_days AS "leadDays",notes FROM suppliers WHERE org_id=$1 ORDER BY name',
          [actor.org_id],
        )
      ).rows,
    };
  });
  mutation(
    app,
    pool,
    '/api/suppliers',
    'suppliers',
    z
      .object({
        name: z.string().min(2).max(200),
        contact: z.string().max(500).default(''),
        leadDays: z.number().int().min(0).max(365).default(0),
        notes: z.string().max(1000).default(''),
      })
      .strict(),
    async (c, actor, d) =>
      (
        await c.query(
          'INSERT INTO suppliers(org_id,name,contact,lead_days,notes) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [actor.org_id, d.name, d.contact, d.leadDays, d.notes],
        )
      ).rows[0],
  );
  app.get('/api/purchases', async (request) => {
    const actor = (request as AuthedRequest).actor;
    if (!actor.permissions.some((p) => ['purchases', 'receive'].includes(p)))
      throw new DomainError('FORBIDDEN', 403);
    const rows = (
      await pool.query(
        'SELECT p.id,p.reference,p.status,p.supplier_id AS "supplierId",s.name AS "supplierName",p.warehouse_id AS "warehouseId",p.created_at AS "createdAt" FROM purchase_orders p JOIN suppliers s ON s.id=p.supplier_id WHERE p.org_id=$1 AND (cardinality($2::uuid[])=0 OR p.warehouse_id=ANY($2::uuid[])) ORDER BY p.created_at DESC LIMIT 100',
        [actor.org_id, actor.warehouse_ids],
      )
    ).rows;
    const lines = (
      await pool.query(
        'SELECT purchase_id,product_id AS "productId",quantity,received,cost_minor AS "costMinor" FROM purchase_lines WHERE purchase_id=ANY($1::uuid[])',
        [rows.map((r) => r.id)],
      )
    ).rows;
    return {
      items: rows.map((p) => ({
        ...p,
        lines: lines
          .filter((l) => l.purchase_id === p.id)
          .map(({ purchase_id, costMinor, ...line }) => ({
            ...line,
            ...(actor.permissions.includes('costs') ? { costMinor: Number(costMinor) } : {}),
          })),
      })),
    };
  });
  mutation(
    app,
    pool,
    '/api/purchases',
    'purchases',
    z
      .object({
        supplierId: uuid,
        warehouseId: uuid,
        reference: z.string().min(2).max(100),
        lines: z
          .array(
            z
              .object({
                productId: uuid,
                quantity: z.number().int().min(1).max(1000000),
                costMinor: z.number().int().min(0).max(100000000),
              })
              .strict(),
          )
          .min(1)
          .max(100),
      })
      .strict(),
    async (c, actor, d) => {
      warehouseScope(actor, d.warehouseId);
      const valid = (
        await c.query(
          'SELECT s.id FROM suppliers s JOIN warehouses w ON w.org_id=s.org_id WHERE s.id=$1 AND w.id=$2 AND s.org_id=$3',
          [d.supplierId, d.warehouseId, actor.org_id],
        )
      ).rowCount;
      if (!valid) throw new DomainError('NOT_FOUND', 404);
      const r = (
        await c.query(
          'INSERT INTO purchase_orders(org_id,supplier_id,warehouse_id,reference,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [actor.org_id, d.supplierId, d.warehouseId, d.reference, actor.id],
        )
      ).rows[0];
      for (const line of d.lines) {
        if (
          !(
            await c.query('SELECT id FROM products WHERE id=$1 AND org_id=$2', [line.productId, actor.org_id])
          ).rowCount
        )
          throw new DomainError('NOT_FOUND', 404);
        await c.query(
          'INSERT INTO purchase_lines(purchase_id,product_id,quantity,cost_minor) VALUES($1,$2,$3,$4)',
          [r.id, line.productId, line.quantity, line.costMinor],
        );
      }
      return { id: r.id, status: 'ORDERED' };
    },
  );
  mutation(
    app,
    pool,
    '/api/purchases/:id/cancel',
    'purchases',
    z.object({}).strict(),
    async (c, actor, _d, req) => {
      const id = uuid.parse((req.params as any).id);
      const po = (
        await c.query('SELECT * FROM purchase_orders WHERE id=$1 AND org_id=$2 FOR UPDATE', [
          id,
          actor.org_id,
        ])
      ).rows[0];
      if (!po) throw new DomainError('NOT_FOUND', 404);
      warehouseScope(actor, po.warehouse_id);
      if (po.status !== 'ORDERED') throw new DomainError('INVALID_PURCHASE', 409);
      await c.query("UPDATE purchase_orders SET status='CANCELLED' WHERE id=$1", [id]);
      return { id, status: 'CANCELLED' };
    },
  );
  mutation(
    app,
    pool,
    '/api/imports/preview',
    'imports',
    z.object({ sourceId: uuid, rows: z.array(z.unknown()).min(1).max(10000) }).strict(),
    async (c, actor, d) => {
      const source = (
        await c.query('SELECT can_store FROM sources WHERE id=$1 AND org_id=$2', [d.sourceId, actor.org_id])
      ).rows[0];
      if (!source?.can_store) throw new DomainError('SOURCE_RIGHTS_REQUIRED', 409);
      const seen = new Set<string>();
      const errors: { row: number; code: string }[] = [];
      const rows: any[] = [];
      for (let i = 0; i < d.rows.length; i++) {
        const parsed = productSchema.safeParse(d.rows[i]);
        if (!parsed.success) {
          errors.push({ row: i + 1, code: 'VALIDATION_ERROR' });
          continue;
        }
        const data = parsed.data;
        if (Object.values(data.names).some((v) => /^[=+@\-\t\r]/.test(v)) || /^[=+@\-\t\r]/.test(data.sku)) {
          errors.push({ row: i + 1, code: 'FORMULA_REJECTED' });
          continue;
        }
        if (seen.has(data.sku)) {
          errors.push({ row: i + 1, code: 'DUPLICATE_SKU' });
          continue;
        }
        seen.add(data.sku);
        rows.push({ ...data, sourceId: d.sourceId });
      }
      const existing = new Set(
        (
          await c.query('SELECT sku FROM products WHERE org_id=$1 AND sku=ANY($2::text[])', [
            actor.org_id,
            [...seen],
          ])
        ).rows.map((r) => r.sku),
      );
      for (let i = 0; i < d.rows.length; i++) {
        const sku = (d.rows[i] as any)?.sku;
        if (existing.has(sku)) errors.push({ row: i + 1, code: 'SKU_EXISTS' });
      }
      if (!actor.permissions.includes('costs') && rows.some((r) => r.costMinor || r.priceMinor))
        errors.push({ row: 0, code: 'FORBIDDEN' });
      const id = (
        await c.query(
          'INSERT INTO import_jobs(org_id,source_id,created_by,rows,errors,checksum) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
          [
            actor.org_id,
            d.sourceId,
            actor.id,
            JSON.stringify(rows),
            JSON.stringify(errors),
            hash(JSON.stringify(d.rows)),
          ],
        )
      ).rows[0].id;
      return { id, errors, valid: errors.length === 0, total: d.rows.length, rows: rows.slice(0, 20) };
    },
  );
  mutation(
    app,
    pool,
    '/api/imports/:id/commit',
    'imports',
    z.object({}).strict(),
    async (c, actor, _d, req) => {
      const id = uuid.parse((req.params as any).id);
      const job = (
        await c.query('SELECT * FROM import_jobs WHERE id=$1 AND org_id=$2 FOR UPDATE', [id, actor.org_id])
      ).rows[0];
      if (!job) throw new DomainError('NOT_FOUND', 404);
      if (job.status === 'COMMITTED') return { id, status: 'COMMITTED', count: job.committed_ids.length };
      if (job.status !== 'PREVIEW' || job.errors.length) throw new DomainError('IMPORT_INVALID', 409);
      if (!actor.permissions.includes('costs') && job.rows.some((r: any) => r.costMinor || r.priceMinor))
        throw new DomainError('FORBIDDEN', 403);
      const ids: string[] = [];
      for (const row of job.rows) ids.push(await insertProduct(c, actor, productSchema.parse(row)));
      await c.query("UPDATE import_jobs SET status='COMMITTED',committed_ids=$2 WHERE id=$1", [id, ids]);
      return { id, status: 'COMMITTED', count: ids.length };
    },
  );
  mutation(
    app,
    pool,
    '/api/imports/:id/revert',
    'imports',
    z.object({}).strict(),
    async (c, actor, _d, req) => {
      const id = uuid.parse((req.params as any).id);
      const job = (
        await c.query('SELECT * FROM import_jobs WHERE id=$1 AND org_id=$2 FOR UPDATE', [id, actor.org_id])
      ).rows[0];
      if (!job || job.status !== 'COMMITTED') throw new DomainError('IMPORT_INVALID', 409);
      await c.query('SELECT id FROM products WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[job.committed_ids]);
      const touched = (
        await c.query('SELECT 1 FROM stock_movements WHERE product_id=ANY($1::uuid[]) LIMIT 1', [
          job.committed_ids,
        ])
      ).rowCount;
      if (touched) throw new DomainError('IMPORT_HAS_MOVEMENTS', 409);
      if (
        (
          await c.query('SELECT 1 FROM products WHERE id=ANY($1::uuid[]) AND version<>1 LIMIT 1', [
            job.committed_ids,
          ])
        ).rowCount
      )
        throw new DomainError('IMPORT_HAS_CHANGES', 409);
      await c.query("UPDATE products SET status='ARCHIVED',version=version+1 WHERE id=ANY($1::uuid[])", [
        job.committed_ids,
      ]);
      await c.query("UPDATE import_jobs SET status='REVERTED' WHERE id=$1", [id]);
      return { id, status: 'REVERTED' };
    },
  );
  app.get('/api/imports', async (request) => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor, 'imports');
    return {
      items: (
        await pool.query(
          'SELECT id,status,errors,jsonb_array_length(rows) AS total,created_at AS "createdAt",checksum FROM import_jobs WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100',
          [actor.org_id],
        )
      ).rows,
    };
  });
  app.get('/api/audit', async (request) => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor, 'audit');
    return {
      items: (
        await pool.query(
          'SELECT a.id,a.action,a.object_id AS "objectId",a.data,a.request_id AS "requestId",a.created_at AS "createdAt",u.name AS "actorName" FROM audit_events a LEFT JOIN staff_users u ON u.id=a.actor_id WHERE a.org_id=$1 ORDER BY a.id DESC LIMIT 200',
          [actor.org_id],
        )
      ).rows,
    };
  });
  app.get('/api/staff', async (request) => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor, 'staff');
    return {
      items: (
        await pool.query(
          'SELECT id,name,email,role,locale,active,warehouse_ids AS "warehouseIds" FROM staff_users WHERE org_id=$1 ORDER BY name',
          [actor.org_id],
        )
      ).rows,
    };
  });
  mutation(
    app,
    pool,
    '/api/staff/invitations',
    'staff',
    z
      .object({
        email: z.string().email().max(200),
        name: z.string().min(2).max(100),
        role: roleSchema,
        warehouseIds: z.array(uuid).max(50),
      })
      .strict(),
    async (c, actor, d) => {
      const warehouses = (
        await c.query('SELECT id FROM warehouses WHERE org_id=$1 AND id=ANY($2::uuid[])', [
          actor.org_id,
          d.warehouseIds,
        ])
      ).rows;
      if (warehouses.length !== new Set(d.warehouseIds).size) throw new DomainError('FORBIDDEN', 403);
      if (d.role === 'owner') throw new DomainError('FORBIDDEN', 403);
      const token = randomBytes(32).toString('hex');
      const row = (
        await c.query(
          "INSERT INTO invitations(org_id,email,name,role,warehouse_ids,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,now()+interval '24 hours',$7) RETURNING id",
          [actor.org_id, d.email.toLowerCase(), d.name, d.role, d.warehouseIds, hash(token), actor.id],
        )
      ).rows[0];
      return { id: row.id, token };
    },
  );
  app.post('/api/auth/invitation-info',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async request=>{
    const d=z.object({token:z.string().length(64)}).strict().parse(request.body);
    const row=(await pool.query('SELECT email,name,role,expires_at AS "expiresAt" FROM invitations WHERE token_hash=$1 AND expires_at>now() AND accepted_at IS NULL',[hash(d.token)])).rows[0];
    if(!row)throw new DomainError('INVITATION_INVALID',400);return row;
  });
  mutation(app,pool,'/api/staff/:id/access','staff',z.object({active:z.boolean()}).strict(),async(c,actor,d,req)=>{
    const id=uuid.parse((req.params as any).id);if(id===actor.id)throw new DomainError('FORBIDDEN',403);
    if(!(await c.query('UPDATE staff_users SET active=$3 WHERE id=$1 AND org_id=$2 RETURNING id',[id,actor.org_id,d.active])).rowCount)throw new DomainError('NOT_FOUND',404);
    if(!d.active)await c.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1',[id]);return {id,active:d.active};
  });
  app.post('/api/auth/accept-invitation',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}}, async (request) => {
    const d = z
      .object({
        token: z.string().length(64),
        password: z.string().min(12).max(200),
        locale: localeSchema,
        mfaSecret: z
          .string()
          .regex(/^[A-Z2-7]{32}$/)
          .optional(),
        totp: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
      })
      .strict()
      .parse(request.body);
    return transaction(pool, async (c) => {
      const invitation = (
        await c.query(
          'SELECT * FROM invitations WHERE token_hash=$1 AND expires_at>now() AND accepted_at IS NULL FOR UPDATE',
          [hash(d.token)],
        )
      ).rows[0];
      if (!invitation) throw new DomainError('INVITATION_INVALID', 400);
      if (
        ['owner', 'manager'].includes(invitation.role) &&
        (!d.mfaSecret || !d.totp || totp(d.mfaSecret) !== d.totp)
      )
        throw new DomainError('MFA_REQUIRED', 400);
      const row = (
        await c.query(
          'INSERT INTO staff_users(org_id,email,name,role,password_hash,locale,mfa_secret,warehouse_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
          [
            invitation.org_id,
            invitation.email,
            invitation.name,
            invitation.role,
            passwordHash(d.password),
            d.locale,
            d.mfaSecret ? protectSecret(d.mfaSecret) : null,
            invitation.warehouse_ids,
          ],
        )
      ).rows[0];
      await c.query('UPDATE invitations SET accepted_at=now() WHERE id=$1', [invitation.id]);
      return { id: row.id };
    });
  });
  mutation(app, pool, '/api/staff/:id/revoke', 'staff', z.object({}).strict(), async (c, actor, _d, req) => {
    const id = uuid.parse((req.params as any).id);
    if (id === actor.id) throw new DomainError('FORBIDDEN', 403);
    const row = (await c.query('SELECT id FROM staff_users WHERE id=$1 AND org_id=$2', [id, actor.org_id]))
      .rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 404);
    await c.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1', [id]);
    return { id, revoked: true };
  });
  mutation(
    app,
    pool,
    '/api/settings',
    'staff',
    z.object({ defaultLocale: localeSchema }).strict(),
    async (c, actor, d) => {
      await c.query('UPDATE organizations SET default_locale=$2 WHERE id=$1', [
        actor.org_id,
        d.defaultLocale,
      ]);
      return d;
    },
  );
  app.get('/api/requests/:key', async (request) => {
    const actor = (request as AuthedRequest).actor;
    const key = z
      .string()
      .max(100)
      .parse((request.params as any).key);
    const row = (
      await pool.query('SELECT response FROM idempotency WHERE org_id=$1 AND actor_id=$2 AND key=$3', [
        actor.org_id,
        actor.id,
        key,
      ])
    ).rows[0];
    return row ? { status: 'COMMITTED', response: row.response } : { status: 'UNKNOWN' };
  });
  app.get('/api/dashboard', async (request) => {
    const actor = (request as AuthedRequest).actor;
    const scope = [actor.org_id, actor.warehouse_ids];
    const [stock, products, sales, imports, fitments, activity] = await Promise.all([
      pool.query(
        'SELECT coalesce(sum(b.on_hand),0)::integer AS "onHand",coalesce(sum(b.reserved),0)::integer reserved,coalesce(sum(b.on_hand-b.reserved),0)::integer available,coalesce(sum(b.quarantine),0)::integer quarantine,coalesce(sum(b.damaged),0)::integer damaged,coalesce(sum(b.on_hand*p.cost_minor),0) AS "inventoryValueMinor" FROM inventory_balances b JOIN products p ON p.id=b.product_id WHERE b.org_id=$1 AND (cardinality($2::uuid[])=0 OR b.warehouse_id=ANY($2::uuid[]))',
        scope,
      ),
      pool.query(
        `SELECT count(*)::integer AS "productCount",count(*) FILTER(WHERE coalesce(s.available,0)=0)::integer AS "outOfStock",count(*) FILTER(WHERE coalesce(s.available,0)>0 AND coalesce(s.available,0)<=p.reorder_level)::integer AS "lowStock" FROM products p LEFT JOIN (SELECT product_id,sum(on_hand-reserved) available FROM inventory_balances WHERE (cardinality($2::uuid[])=0 OR warehouse_id=ANY($2::uuid[])) GROUP BY product_id) s ON s.product_id=p.id WHERE p.org_id=$1 AND p.status<>'ARCHIVED'`,
        scope,
      ),
      pool.query(
        'SELECT count(*)::integer AS "salesToday",coalesce(sum(total_minor),0) AS "salesTodayMinor" FROM sales WHERE org_id=$1 AND (created_at AT TIME ZONE \'Africa/Casablanca\')::date=(now() AT TIME ZONE \'Africa/Casablanca\')::date AND (cardinality($2::uuid[])=0 OR warehouse_id=ANY($2::uuid[]))',
        scope,
      ),
      pool.query(
        "SELECT count(*)::integer AS pending FROM import_jobs WHERE org_id=$1 AND status='PREVIEW'",
        [actor.org_id],
      ),
      pool.query(
        "SELECT count(*)::integer AS pending FROM fitments f JOIN products p ON p.id=f.product_id WHERE p.org_id=$1 AND f.status IN ('REVIEW_REQUIRED','SOURCE_CLAIMED')",
        [actor.org_id],
      ),
      pool.query(
        'SELECT m.id,m.kind,p.sku,m.on_hand_delta AS "quantityDelta",m.created_at AS "createdAt" FROM stock_movements m JOIN products p ON p.id=m.product_id WHERE m.org_id=$1 AND (cardinality($2::uuid[])=0 OR m.warehouse_id=ANY($2::uuid[])) ORDER BY m.created_at DESC LIMIT 8',
        scope,
      ),
    ]);
    const result = {
      ...stock.rows[0],
      ...products.rows[0],
      ...sales.rows[0],
      pendingImports: imports.rows[0].pending,
      pendingFitments: fitments.rows[0].pending,
      recentMovements: activity.rows,
      slowMoving: null,
      historyAvailable: false,
    };
    if (!actor.permissions.includes('costs')) delete result.inventoryValueMinor;
    else result.inventoryValueMinor = Number(result.inventoryValueMinor);
    result.salesTodayMinor = Number(result.salesTodayMinor);
    return result;
  });
  app.get('/api/reports/stock.csv', async (request, reply) => {
    const actor = (request as AuthedRequest).actor;
    requirePermission(actor, 'reports');
    const locale = localeSchema.parse((request.query as any).locale ?? actor.locale);
    const labels = {
      en: ['SKU', 'Name', 'Warehouse', 'On hand', 'Reserved', 'Available'],
      fr: ['SKU', 'Nom', 'Entrepôt', 'En stock', 'Réservé', 'Disponible'],
      ar: ['رمز الصنف', 'الاسم', 'المستودع', 'المخزون', 'المحجوز', 'المتاح'],
    };
    const rows = (
      await pool.query(
        'SELECT p.sku,p.names,w.name,b.on_hand,b.reserved,b.on_hand-b.reserved AS available FROM inventory_balances b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id WHERE b.org_id=$1 AND (cardinality($2::uuid[])=0 OR b.warehouse_id=ANY($2::uuid[])) ORDER BY p.sku,w.name',
        [actor.org_id, actor.warehouse_ids],
      )
    ).rows;
    const esc = (v: unknown) => {
      let s = String(v ?? '');
      if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csv = [
      labels[locale],
      ...rows.map((r) => [
        r.sku,
        r.names[locale] || r.names.fr || r.names.en || r.names.ar,
        r.name,
        r.on_hand,
        r.reserved,
        r.available,
      ]),
    ]
      .map((row) => row.map(esc).join(','))
      .join('\r\n');
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="stock-${locale}.csv"`);
    return '\uFEFF' + csv;
  });
}
