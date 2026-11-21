import { randomBytes } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { z } from 'zod';
import { localeSchema } from './auth.js';
import { createPool, hash, ORG_ID, transaction } from './db.js';

const label = z.string().trim().min(2).max(100);
const setupSchema = z.object({
  database: z.string().min(1).max(63),
  company: label,
  locale: localeSchema,
  owner: z.object({ name: label, email: z.string().trim().email().max(200).toLowerCase() }).strict(),
  warehouses: z.array(z.object({ code: z.string().trim().regex(/^[A-Z0-9_-]{1,30}$/), name: label }).strict()).min(1).max(50),
}).strict().refine(s => new Set(s.warehouses.map(w => w.code)).size === s.warehouses.length);

export async function prepareCompany(pool: Pool, input: unknown, token: string, renew = false) {
  const setup = setupSchema.parse(input);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid activation token');
  return transaction(pool, async client => {
    // Serialize both installation tools before either examines the database.
    await client.query('SELECT pg_advisory_xact_lock(87124522)');
    if ((await client.query('SELECT current_database() AS name')).rows[0].name !== setup.database)
      throw new Error('Database name does not match setup file');
    if (renew) {
      const renewed = await client.query(
        `UPDATE invitations i SET token_hash=$1, expires_at=now()+interval '24 hours'
         FROM organizations o WHERE o.id=i.org_id AND o.workspace_kind='company' AND o.name=$2
         AND i.org_id=$3 AND i.email=$4 AND i.role='owner' AND i.created_by IS NULL AND i.accepted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM staff_users WHERE org_id=i.org_id)`,
        [hash(token), setup.company, ORG_ID, setup.owner.email],
      );
      if (!renewed.rowCount) throw new Error('No matching unclaimed owner invitation');
    } else {
      if ((await client.query('SELECT 1 FROM organizations LIMIT 1')).rowCount)
        throw new Error('Setup requires an empty migrated database');
      await client.query("INSERT INTO organizations(id,name,default_locale,workspace_kind) VALUES($1,$2,$3,'company')",
        [ORG_ID, setup.company, setup.locale]);
      for (const warehouse of setup.warehouses) {
        const row = await client.query('INSERT INTO warehouses(org_id,code,name) VALUES($1,$2,$3) RETURNING id',
          [ORG_ID, warehouse.code, warehouse.name]);
        await client.query("INSERT INTO warehouse_bins(org_id,warehouse_id,code,is_default) VALUES($1,$2,'RECEIVING',true)",
          [ORG_ID,row.rows[0].id]);
      }
      await client.query(`INSERT INTO invitations(org_id,email,name,role,warehouse_ids,token_hash,expires_at,created_by)
        VALUES($1,$2,$3,'owner','{}',$4,now()+interval '24 hours',NULL)`,
        [ORG_ID,setup.owner.email,setup.owner.name,hash(token)]);
    }
    await client.query("INSERT INTO audit_events(org_id,action,data,request_id) VALUES($1,$2,'{}',gen_random_uuid()::text)",
      [ORG_ID,renew ? 'OWNER_INVITATION_RENEWED' : 'COMPANY_INITIALIZED']);
  });
}

async function main() {
  const [configPath, ticketPath, flag, ...extra] = process.argv.slice(2);
  if (!configPath || !ticketPath || extra.length || (flag !== undefined && flag !== '--renew'))
    throw new Error('Usage: setup-company <company.json> <new private ticket file> [--renew]');
  if (process.env.DEMO_MODE !== 'false' || process.env.LOCAL_PREVIEW_PASSWORD_ONLY === 'true' ||
      !/^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY ?? ''))
    throw new Error('Company setup requires private mode and a valid MFA encryption key');
  const config = setupSchema.parse(JSON.parse(await readFile(configPath,'utf8')));
  const token = randomBytes(32).toString('hex');
  // Exclusive creation + sync before commit prevent overwriting an existing ticket or losing
  // the only copy of a committed invitation. On an uncertain commit, the ticket remains available.
  const ticket = await open(ticketPath,'wx',0o600);
  try { await ticket.writeFile(token+'\n'); await ticket.sync(); } finally { await ticket.close(); }
  const pool = createPool();
  try { await prepareCompany(pool,config,token,flag === '--renew'); } finally { await pool.end(); }
  console.log('Owner invitation ready in the specified private file. Valid for 24 hours.');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    const messages = [
      'Database name does not match setup file', 'No matching unclaimed owner invitation',
      'Setup requires an empty migrated database', 'Company setup requires private mode and a valid MFA encryption key',
      'Usage: setup-company <company.json> <new private ticket file> [--renew]',
    ];
    const filesystem: Record<string,string> = {
      EACCES: 'Setup cannot access the configuration or ticket file with this operating-system account.',
      ENOENT: 'Configuration file or ticket directory is missing.',
      EEXIST: 'Ticket file already exists. Choose a new private path.',
    };
    const code = (error as NodeJS.ErrnoException)?.code ?? '';
    const message = error instanceof Error && messages.includes(error.message) ? error.message : filesystem[code];
    console.error(message ?? 'Company setup did not complete. Check the configuration, migration state and database access.');
    process.exitCode=1;
  });
}
