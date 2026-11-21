import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { createPool, ORG_ID, transaction, document, type Actor } from './db.js';
import { passwordHash, protectSecret, permissions } from './auth.js';
import { insertProduct, productSchema } from './catalog.js';
import { lockBalances, movement } from './inventory.js';
export async function seed(pool: Pool) {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.DEMO_MODE !== 'true' ||
    !process.env.DEMO_PASSWORD ||
    !process.env.DEMO_TOTP_SECRET
  )
    throw new Error(
      'Demo seed requires DEMO_MODE=true, isolated environment, DEMO_PASSWORD and DEMO_TOTP_SECRET',
    );
  return transaction(pool, async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(87124522)');
    await c.query("INSERT INTO organizations(id,name,workspace_kind) VALUES($1,$2,'demo') ON CONFLICT DO NOTHING", [
      ORG_ID,
      'AutoParts Morocco — ISOLATED DEMO',
    ]);
    if ((await c.query('SELECT workspace_kind FROM organizations WHERE id=$1', [ORG_ID])).rows[0]?.workspace_kind !== 'demo')
      throw new Error('Demo seed refused for company or unclassified workspace');
    if ((await c.query('SELECT id FROM staff_users WHERE org_id=$1 LIMIT 1', [ORG_ID])).rowCount) {
      console.log('Demo already initialized; existing records preserved');
      return;
    }
    const warehouses = [];
    for (const [code, name] of [
      ['CAS', 'Casablanca · Counter'],
      ['DEP', 'Casablanca · Depot'],
      ['RAB', 'Rabat · Future branch'],
    ])
      warehouses.push(
        (
          await c.query('INSERT INTO warehouses(org_id,code,name) VALUES($1,$2,$3) RETURNING id', [
            ORG_ID,
            code,
            name,
          ])
        ).rows[0].id,
      );
    let owner: any;
    for (const role of [
      'owner',
      'manager',
      'sales',
      'warehouse',
      'buyer',
      'curator',
      'auditor',
      'accountant',
    ]) {
      const row = (
        await c.query(
          'INSERT INTO staff_users(org_id,email,name,role,password_hash,locale,mfa_secret,warehouse_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
          [
            ORG_ID,
            `${role}@demo.local`,
            `Demo ${role}`,
            role,
            passwordHash(process.env.DEMO_PASSWORD!),
            role === 'owner' ? 'en' : role === 'warehouse' ? 'ar' : 'fr',
            ['owner', 'manager'].includes(role) ? protectSecret(process.env.DEMO_TOTP_SECRET!) : null,
            role === 'sales' ? [warehouses[0]] : [],
          ],
        )
      ).rows[0];
      if (role === 'owner') owner = row;
    }
    const actor: Actor = { ...owner, permissions: permissions.owner };
    const source = (
      await c.query(
        "INSERT INTO sources(org_id,name,origin,license,can_store,can_display,can_syndicate,status) VALUES($1,'Original synthetic training data','Local isolated demo','Original synthetic examples. Not real fitment or company stock.',true,false,false,'INTERNAL_APPROVED') RETURNING id",
        [ORG_ID],
      )
    ).rows[0].id;
    const vehicle = (
      await c.query(
        "INSERT INTO vehicles(org_id,make,model,generation,market,year_from,year_to,engine,fuel,transmission,body,source_id,external_id) VALUES($1,'DEMO MAKE','City','Example generation','MA',2018,2024,'DEMO-1.5','DIESEL','MANUAL','HATCHBACK',$2,'SYNTHETIC-001') RETURNING id",
        [ORG_ID, source],
      )
    ).rows[0].id;
    const fixtures = [
      [
        'AP-FLT-001',
        'Oil filter',
        'Filtre à huile',
        'فلتر الزيت',
        'filters',
        8900,
        4800,
        30,
        'DEMO 82 00 768 927',
        '2000000000015',
      ],
      [
        'AP-BRK-002',
        'Front brake pads',
        'Plaquettes de frein avant',
        'وسادات الفرامل الأمامية',
        'brakes',
        34900,
        21000,
        12,
        'DEMO 41060-AX625',
        '2000000000022',
      ],
      [
        'AP-AIR-003',
        'Air filter',
        'Filtre à air',
        'فلتر الهواء',
        'filters',
        12900,
        6900,
        4,
        'DEMO 16546-00Q0D',
        '2000000000039',
      ],
      [
        'AP-SPK-004',
        'Spark plug',
        'Bougie d’allumage',
        'شمعة الإشعال',
        'ignition',
        6500,
        3200,
        48,
        'DEMO 22401-00Q0G',
        '2000000000046',
      ],
      [
        'AP-BEL-005',
        'Accessory belt',
        'Courroie accessoires',
        'حزام الملحقات',
        'belts',
        21500,
        13000,
        0,
        'DEMO 6PK1200',
        '2000000000053',
      ],
      [
        'AP-WIP-006',
        'Wiper blade',
        'Balai d’essuie-glace',
        'شفرة المسّاحة',
        'wipers',
        9900,
        5000,
        8,
        'DEMO W600',
        '2000000000060',
      ],
    ];
    for (const row of fixtures) {
      const [sku, en, fr, ar, category, priceMinor, costMinor, quantity, oem, barcode] = row;
      const id = await insertProduct(
        c,
        actor,
        productSchema.parse({
          sku,
          names: { en, fr, ar },
          descriptions: {
            en: 'Synthetic demonstration part. Compatibility is unverified.',
            fr: 'Pièce de démonstration synthétique. Compatibilité non vérifiée.',
            ar: 'قطعة تجريبية اصطناعية. التوافق غير متحقق منه.',
          },
          brand: 'DEMO',
          oem,
          barcode,
          category,
          packSize: 10,
          priceMinor,
          costMinor,
          reorderLevel: 5,
          status: 'ACTIVE_INTERNAL',
          sourceId: source,
        }),
      );
      await lockBalances(c, actor, [{ productId: id, warehouseId: warehouses[0] }]);
      if (Number(quantity) > 0) {
        const doc = await document(c, actor, 'OPENING_BALANCE', { synthetic: true }, `DEMO-OPEN-${sku}`);
        await movement(c, actor, doc, id, warehouses[0], 'OPENING_BALANCE', 'demo-seed', {
          onHand: Number(quantity),
        });
      }
      await c.query(
        "INSERT INTO fitments(product_id,vehicle_id,status,evidence,source_id) VALUES($1,$2,'REVIEW_REQUIRED','Synthetic fixture, not verified technical compatibility',$3)",
        [id, vehicle, source],
      );
    }
    await c.query(
      "INSERT INTO suppliers(org_id,name,contact,lead_days,notes) VALUES($1,'Demo Parts Supply','No real contact information',3,'Synthetic supplier, no contract')",
      [ORG_ID],
    );
    console.log('Isolated synthetic demo seeded; credentials are read from local environment only');
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = createPool();
  try {
    await seed(pool);
  } finally {
    await pool.end();
  }
}
