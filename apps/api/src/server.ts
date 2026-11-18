import { createPool } from './db.js';
import { createApp } from './app.js';
import { expireReservations } from './inventory.js';
import { processOutbox } from './worker.js';
import { processImportChunk } from './imports.js';
import { processCatalogFeed } from './catalog-feeds.js';
import { processOriginalVisual } from './original-visuals.js';
const pool = createPool();
const app = await createApp(pool, { logger: true });
let running = false;
const timer = setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await expireReservations(pool);
    await processOutbox(pool);
  } catch {
    app.log.error({ code: 'WORKER_FAILED' }, 'Background work failed');
  } finally {
    running = false;
  }
}, 15000);
timer.unref();
let importing = false;
const importTimer = setInterval(async () => {
  if (importing) return;
  importing = true;
  try {
    await processImportChunk(pool);
    await processCatalogFeed(pool);
  } catch {
    app.log.error({ code: 'IMPORT_WORKER_FAILED' }, 'Import processing interrupted');
  } finally {
    importing = false;
  }
}, 250);
importTimer.unref();
let rendering = false;
const visualTimer = setInterval(async () => {
  if (rendering) return;
  rendering = true;
  try {
    await processOriginalVisual(pool);
  } catch {
    app.log.error({ code: 'WORKER_FAILED' }, 'Visual rendering interrupted');
  } finally {
    rendering = false;
  }
}, 1000);
visualTimer.unref();
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, async () => {
    clearInterval(timer);
    clearInterval(importTimer);
    clearInterval(visualTimer);
    await app.close();
    await pool.end();
    process.exit(0);
  });
await app.listen({ port: Number(process.env.API_PORT ?? 4310), host: process.env.API_HOST ?? '127.0.0.1' });
