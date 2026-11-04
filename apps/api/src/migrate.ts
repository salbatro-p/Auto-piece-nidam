import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool, hash, transaction } from './db.js';
import type { Pool } from 'pg';
export async function migrate(pool: Pool) {
  const dir = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));
  await transaction(pool, async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(87124521)');
    await c.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const name of (await readdir(dir)).filter((v) => v.endsWith('.sql')).sort()) {
      const sql = await readFile(`${dir}/${name}`, 'utf8');
      const row = (await c.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name])).rows[0];
      if (row) {
        if (row.checksum !== hash(sql)) throw new Error(`Migration checksum changed: ${name}`);
        continue;
      }
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, hash(sql)]);
      console.log(`Applied ${name}`);
    }
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = createPool();
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}
