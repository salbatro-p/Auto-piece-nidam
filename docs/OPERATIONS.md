# Operations, deployment and rollback

## Environment separation

Local runtime uses an isolated PostgreSQL cluster on loopback and synthetic records. Production deployment is explicitly prohibited without owner approval. Staging must have distinct DB, credentials, object storage, cookie domain and hostname; never connect a test seed to a live database. Native PostgreSQL 18.4 is available on this development machine. Update and retest against the current approved PostgreSQL 18 maintenance release before production; container configuration targets 18.6. Docker execution is not available in the current environment and is NOT TESTED.

## Startup and diagnostics

Use the root README and package scripts as the executable setup contract. The database migration precedes seed and server startup. Verify readiness, login, stock read and a demo receipt/sale, then run reconciliation. Persist only authorized synthetic evidence in `docs/evidence/`; keep credentials and raw backups under ignored local runtime paths. Logs use request IDs. An unresolved client timeout must remain unresolved until request-status lookup or idempotent retry confirms the committed document.

## Backup and restore policy

Before a schema change or approved import: pause destructive administrative work, create a consistent PostgreSQL backup, record UTC timestamp, hash and critical table counts, and restrict access. Production backups require encryption, off-host copies and retention approved for the chosen region. A local unencrypted development dump is not a production backup policy.

Restore into a NEW empty isolated database. Verify dump hash, migration version, products/staff/reservations/ledger counts, balance reconciliation, an authenticated stock read, and one receive/reserve/sale/return test. Never test restore over production. Capture elapsed restore time and data cutoff; RPO ≤15 minutes and RTO ≤2 hours remain objectives until measured with the real hosted backup/WAL configuration. A local restore drill cannot establish hosted RPO or failover behavior.

## Incident response

### v1.3 protected media recovery

Persist `MEDIA_STORAGE_DIR` separately from application build output. It must not be a public web root. A consistent database snapshot identifies the immutable content-addressed source/display/thumbnail files that must accompany each backup. `scripts/restore-drill.mts` now copies those exact files, records individual hashes, restores into a new database/private directory and tests an approved thumbnail through the authenticated API. License records, media reviews, fitment evidence and image ingestion checkpoints are included in critical table checks. Do not delete legacy database bytes until the matching private objects have been written and verified; explicit image matching performs this migration and keeps the asset review-required.

The container definition uses a dedicated `media-data` volume at `/var/lib/autoparts/media`, created with ownership for the unprivileged API user. A container replacement must retain both this volume and the PostgreSQL volume. For a host bind mount, provision equivalent write access for that user. Include the private media volume in the consistent backup procedure. This container configuration has been reviewed in source; Docker is unavailable here, so container rebuild/restart persistence is still NOT TESTED.

Schema migrations use a dedicated bounded ten-minute statement timeout and thirty-second lock timeout for large evidence backfills. API transactions retain their fifteen-second statement/five-second lock limits. A failed migration rolls back its transaction; successful migration messages are emitted only after commit. Rehearse on the actual staging volume before any approved upgrade. Orphaned private objects from rolled-back uploads are retained safely; automated garbage collection is not enabled.

The Business process prepares eight authenticated database connections before startup readiness and retains a minimum of eight in its thirty-connection pool. This avoids a new authentication burst on the first busy counter search. Dashboard aggregation has a transaction-local 16 MB `work_mem` budget; it does not alter other pooled queries. Include concurrent report memory, pool limits and source/warehouse volume in staging sizing.

For a suspected ledger discrepancy, stop writes to affected locations, retain request IDs, run reconciliation, compare immutable movements and documents, and involve the owner. Never fix a balance directly with SQL. Apply an approved compensating correction only after the cause is understood. For duplicate requests, look up the original idempotency result; do not invent a fresh key. For lost connection, retry with the same key and payload. For auth compromise, revoke sessions, reset affected credentials/MFA through a controlled recovery flow, and inspect redacted audit events.

For database outage, UI remains draft/read-only and reports unconfirmed writes. On recovery, check readiness and reconcile before resuming. For supplier failure, continue authorized local catalog operation; queue/review imports without granting new rights or fitment. For outbox failure, preserve pending events and retry idempotently; future external consumers need delivery deduplication and dead-letter review.

## Monitoring to provision before pilot

Track API availability/error rate and request latency, authentication failures, PostgreSQL disk/CPU/connections/lock waits/deadlocks, stock reconciliation mismatches, pending/expired reservations, import queue/error counts, outbox retries and backup age. Production alert recipients, delivery channels and thresholds are not configured here. Proposed availability 99.9% is not an observed service level.

## Migration and rollback

Use additive migrations and compatible API contracts. Take/verify backup before applying. Revert a frontend/API artifact independently only while the retained schema remains backward-compatible. Do not drop columns or delete posted stock to undo a release. A migration that changes semantics needs a forward compensation or a coordinated maintenance restore with owner approval and explicit reconciliation of post-backup transactions. Phase 2 may not require a destructive change to the Business sale path.

## Pilot go/no-go

Require passing local and representative staging evidence; real tablet/Android acceptance in AR/FR/EN; qualified translation review; validated rights and fitment; company-specific privacy/tax/hosting approval; physical count and signed opening balances; trained invited staff; backup restoration and rollback rehearsal; monitoring owners; and explicit pilot/production approval. Do not silently replace existing recordkeeping. Run a reconciled parallel pilot before cutover.
