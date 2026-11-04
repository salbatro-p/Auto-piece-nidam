import type { Pool } from 'pg';
import { transaction } from './db.js';
/** Durable internal consumer only. No external providers are enabled in Phase 1. */
export async function processOutbox(pool: Pool) {
  return transaction(pool, async (c) => {
    const events = (
      await c.query(
        'SELECT id FROM outbox_events WHERE processed_at IS NULL ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED',
      )
    ).rows;
    for (const event of events) {
      await c.query(
        "INSERT INTO event_deliveries(event_id,consumer) VALUES($1,'business-read-invalidation') ON CONFLICT DO NOTHING",
        [event.id],
      );
      await c.query('UPDATE outbox_events SET processed_at=now(),attempts=attempts+1 WHERE id=$1', [
        event.id,
      ]);
    }
    return { processed: events.length };
  });
}
