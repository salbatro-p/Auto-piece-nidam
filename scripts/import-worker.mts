import { createPool } from '../apps/api/src/db.js';
import { processImportChunk } from '../apps/api/src/imports.js';
const pool = createPool();
let peak = process.memoryUsage().rss;
try {
  for (;;) {
    const result = await processImportChunk(pool);
    peak = Math.max(peak, process.memoryUsage().rss);
    if (result.paused) throw new Error('Import unexpectedly paused');
    const row = (
      await pool.query('SELECT processed,total,status FROM bulk_import_jobs WHERE id=$1', [
        process.env.IMPORT_JOB_ID,
      ])
    ).rows[0];
    if (row.processed >= Number(process.env.STOP_AT ?? Infinity) && row.status !== 'COMMITTED') {
      process.send?.({ checkpoint: row.processed, peakRssBytes: peak });
      await new Promise(() => {});
    }
    if (row.status === 'COMMITTED') {
      process.send?.({ complete: true, processed: row.processed, peakRssBytes: peak });
      break;
    }
  }
} finally {
  await pool.end();
  process.disconnect?.();
}
