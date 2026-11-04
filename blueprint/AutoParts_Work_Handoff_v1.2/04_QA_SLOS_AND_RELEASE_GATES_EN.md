# RELEASE ENGINEERING: FUNCTIONAL CORRECTNESS, PERFORMANCE, SECURITY, RESILIENCE
**Interpretation:** Numeric figures below are **proposed acceptance targets**, NOT observed test results, production commitments or zero-defect guarantees. Work must first agree realistic test hardware, network, volume and user behavior with owner; report actual p50/p95/p99, errors and environment. If a test cannot run, mark NOT TESTED, not PASS.

## Mandatory cross-application quality gate (v1.1)
Run the tests and trust-boundary checks in `09_MANDATORY_TWO_APP_ARCHITECTURE_EN.md` in addition to all tests below. V1 requires Business tablet POS + owner phone acceptance, including last-unit races between two internal sessions; V2 requires store POS versus public checkout stress and proof that Shop cannot access Business data. If deployment is one shared backend, deploy/rollback frontends independently and prove non-destructive migrations. Failure of any stock integrity or permission isolation test is STOP-SHIP.

## Mandatory v1.2 localization release gate
Follow `10_MANDATORY_TRILINGUAL_LANGUAGE_SWITCHER_EN.md`. For BOTH applications independently (V1 Business at its launch and V2 Shop at its launch), verify the always-discoverable header **AR/FR/EN** switcher, full translations and system errors in all three, correct Arabic RTL and bidirectional OEM/SKU handling, safe mid-sale/checkout locale changes, per-user locale preference on shared tablet, accessibility and printing/notifications. Make language selection a mandatory test matrix across screen size and auth role. A broken locale switch that loses a sale/cart, translates identifiers, changes quantities, leaks private data or hides a critical consent/error is **STOP-SHIP**. Attach screenshot and automated E2E evidence for every locale. Report translation coverage, missing content and measured locale-switch render cost.

## 1. Functional release gates (V1 and V2)
**Must pass 100% of these before release** (no exceptions merely because UI looks complete):
- All stock writes hit database transactions; all posted movements have event, actor, trace, unique document and balanced stock projection.
- Permission checks server side: sales staff cannot view cost/privileged supplier contracts; warehouse staff cannot edit prices or approve own disputed adjustments; public customers cannot reach any internal endpoints.
- A barcode/SKU/OE number finds relevant product even across sensible punctuation/spacing normalization; ambiguous OEM cross references are not silently treated as guaranteed fitment.
- No sale when available stock insufficient; no duplicate receipt, reservation, sale deduction, cancellation, refund or stock return when identical request replayed.
- Returned goods cannot become sellable until intake/inspection is confirmed; unreceived POs do not count as physically available.
- Any data import previews a delta/errors, rejects invalid keys, has per-row failure reporting and never destroys existing authoritative balances/verified fitment without authorized process.
- A fitment marked VERIFIED has a real qualifying vehicle variant, linked evidence and reviewer ID; ambiguous/conflicting rows show caution and cannot be displayed as confirmed.
- Database migration forward and rollback strategy tested in staging; backup can be restored into clean staging environment with checksums, critical table counts and business-flow confirmation.
- V2 additionally: checkout stock reservation/refund/shipping/payment webhook ordering is idempotent; paid orders are never inferred from redirect alone; public PII and prices are partitioned from private costs.

## 2. Attack and failure matrix (mandatory automated integration / E2E)
| Test ID | Attack/failure scenario | Expected invariant and evidence |
|---|---|---|
| INV-01 | One unit left; 100 concurrent customers/staff attempt reserve one | Exactly one accepted reservation; no negative stock or orphan balance |
| INV-02 | Request retried 10x after client timeout | One mutation and one business document per idempotency key |
| INV-03 | Employee A sells while Employee B transfers same SKU | Correct serialized outcome and stock per location |
| INV-04 | Two multi-SKU orders lock in opposite order | Deterministic locking; no stuck deadlock; bounded retry with no double sale |
| INV-05 | Cancel + fulfill + expiry event race | One legal terminal state; no over-release or double consume |
| INV-06 | Return processed twice, return inspected as damaged | Inventory increases only once and remains in non-sellable condition |
| INV-07 | Receiving wrong units/pack size, duplicate vendor bill | Validation catches mismatch; no incorrect ledger |
| INV-08 | Manual balance tampering attempted via API | Server rejects client-computed stock; detailed audit |
| DATA-01 | 100k SKU import with duplicates, invalid VIN/aliases, malicious spreadsheet formulas | Preview validation; formula escaping; stable memory; no silent destructive updates |
| DATA-02 | Wrong fitment same make/model/year but different engine | NOT VERIFIED until matching exact variant and qualifiers |
| DATA-03 | Supplier API down or returns revoked data | Existing authorized data remains usable; source freshness shown; no fabricated data |
| SEC-01 | Staff tries guessed URL/object ID outside role/branch | 403 or intentional 404; no data leak; logged |
| SEC-02 | XSS/SQL injection, CSRF, file upload misuse, credential brute force | Defensive controls active, security tests pass, rate limits implemented |
| REL-01 | Database restart during transaction | All-or-nothing mutation; retried request safe; app recovers |
| REL-02 | Import job dies after 50% progress | Resumable safely; records not duplicated |
| REL-03 | Worker replays same outbox event 10 times | External side effects idempotent or deduped |
| REL-04 | Restore backup in staging | Documented RPO/RTO actually measured; verified counts and reservations |
| PAY-01 | V2 payment callback arrives twice/out of order | One financial transition, signature validation, reconciliation |
| PAY-02 | V2 payment confirmed after reservation expiry | Safe exception state; do not create invisible negative stock; refund/manual-resolution flow |
| SHIP-01 | Courier times out after creating a label | Lookup/reconciliation before retry; no duplicate labels or provider charges |
| SHIP-02 | Courier offline after order completed | Order safe, queued dispatch, staff-visible incident, no checkout crash |
| UX-01 | Search on small Android screen, RTL and mixed Arabic/French/LTR SKUs | Legible layout, correct keyboard/scanning, clearly labeled states |
| I18N-01 | On Business tablet, switch FR→AR→EN mid-sale with items/qty and network retry | Visible top-header selector; no lost draft, duplicated sale, altered quantity/price or mixed-script reference corruption |
| I18N-02 | Owner phone switches AR→FR mid-product creation/image upload and receipt | Complete localized screen/errors; unsaved draft/PCS input preserved; correct server-side stock result |
| I18N-03 | Two employees on shared tablet choose different UI locales across sessions | Isolated per-user preference, no session or locale preference leakage; no cross-user privilege changes |
| I18N-04 | Shop guest changes EN→AR→FR during vehicle selection, cart, checkout and tracking | Product/cart/order identity preserved; correct RTL/LTR; exactly-once reservations and charges |
| I18N-05 | AR/FR/EN full critical-path translation coverage, accessible header controls and locale-safe receipts/SEO | Reviewed translation report, keyboard/screen-reader and visual evidence; no misleading fallback or unlocalized safety warnings |
| I18N-06 | Mixed RTL and LTR OEM/SKU/VIN/barcodes, MAD currency, PCS/cartons and dates | Exact technical identifiers, numbers, copy/paste and transaction arithmetic unaffected |

## 3. Initial V1 load/performance acceptance targets
Representative staging seed: **100,000 sellable SKUs, 1,000,000 fitment relations, 10,000 vehicles or suitably proportional sampled variants, 3 warehouses**; use lawful synthetic fixtures for stress, not fake real-company data. Run test both cold and warmed; document database instance/specs, indexes/EXPLAIN, network profile, rate, cache hit rate and duration. Scale targets after actual company volume obtained.
- Search by exact SKU/OE with indexed DB: p95 <= 500 ms backend at 50 requests/s for representative mixed queries; p99 <= 1.5s.
- Vehicle/compatible-part search: p95 <= 900 ms backend at 25 requests/s on representative dataset; no unchecked N+1 loops.
- Stock read by SKU/location: p95 <= 300 ms backend at 50 requests/s.
- Stock mutation under 20 writes/s distributed across SKUs: p95 <= 800 ms without integrity errors. High-contention single-SKU stress must preserve correctness, even when some requests safely fail or queue; do not impose arbitrary latency that encourages oversell.
- Dashboard load: p95 <= 1.5s API with precomputed summary where justified, no unbounded full-table scans.
- User-perceived usability: p75 LCP goal <=2.5s for principal internal screens on an agreed midrange Android/device and measured throttled network; optimize with pagination, progressive loading, local static assets.
- Import 100k synthetic SKUs: bounded memory (record max RSS), documented duration and resumability; long job doesn't block API requests.
- Critical paths fail gracefully under DB pool saturation; collect slow queries, queue depth, lock waits, deadlocks, connection utilization and p95/p99.
- Target zero stock-integrity violations and zero duplicate financial/stock effects in all deterministic concurrency tests. **This does not prove zero defects in untested real-world conditions.**

## 4. Initial V2 load/performance acceptance targets
- Seed 100k published SKU products and 1m fitments or scale to future business; publish only rights-cleared data in live environment.
- Simulate at least 200 active customers and 100 read requests/s during a stable interval; catalog/search APIs p95 <=700ms (cache included, DB-side measured separately); p99 <=2s.
- Simulate 20 order attempts/minute plus 20 concurrent staff stock mutations while testing payment/provider stubs; no double reservation, leaked stock, lost orders, incorrect prices or missed customer events.
- Checkout p95 <=2s for platform-controlled steps **excluding external PSP and courier latency**; external provider durations measured separately; communicate progress/timeout states honestly.
- Target home/category p75 LCP <=2.5s on agreed mobile/slow-network benchmark with representative media.
- Run flash-sales/backpressure tests, DB failover/restart simulation, PSP timeouts, cart replay and abuse flows.

## 5. Service objectives (after monitoring is installed, not promise)
- Propose availability SLO **>=99.9% monthly** for V1 and V2 business-critical services after real hosted production baseline; exclude defined planned maintenance and measure externally (99.9% means ~43.2 minutes/month downtime for a 30-day month).
- Initial disaster-recovery engineering objective: **RPO <= 15 minutes; RTO <= 2 hours**, subject to hosting capabilities, costs, verified backups/WAL and restore drills. If not feasible, report actual measured RPO/RTO and adjust plan before go-live.
- Alert on elevated 5xx and auth abuse, DB storage/CPU/connection saturation, slow queries, unexpected negative/imbalanced ledger projections, stuck jobs, unprocessed payments/shipments and failed backups.
- Prioritize safe degraded mode: no invalid inventory changes when DB is unreachable; no indefinite spinning progress UI; show incident and retry instructions.

## 6. Security release gate
- Use OWASP ASVS 5.0.0 as an auditable checklist; choose an appropriate target control level and document exceptions. Do not claim 'OWASP certified'.
- Dependency security scans, secret scanning, lint, TypeScript strict checking, secure headers, input/output handling, MIME/upload checks, CSRF, IDOR, permission boundary tests, password/session protection and MFA for privileged roles.
- 0 unresolved Critical/High issues in application-controlled security findings before public launch; medium findings have tracked mitigation with accepted risk owner.
- Run manual authorization/logic review for inventory, special price/cost fields, supplier IDs, import approval and payment reconciliation, not just automated scanners.
- Legal and privacy approval gate: CNDP hosting/transfer assessment; minimum collection, documented retention, consent/disclosure where applicable; official payment provider contract.

## 7. Definition of Done and stop-ship
Every change must have business acceptance tests, user scenario, RBAC check, schema migration safety, automated regression, trace/log and rollback plan if applicable. No release with:
- known overselling/negative balance/ledger mismatch;
- incorrect verified-fitment evidence or unsupported marketing claims;
- auth or private pricing/customer leakage;
- unverified payment reconciliation;
- failed restore or no viable backup;
- lost webhooks/outbox actions without recovery;
- legal/contract blockers for public operations;
- incomplete or falsely reported tests.

## 8. Release evidence format (Work must fill with observed data)
Each gate has columns: `Requirement ID | implementation path/commit | test name | execution date | test environment | observed metric | target | PASS/FAIL/NOT TESTED | evidence link | issue owner | remediation | risk accepted by`.
Attach sample test fixtures, load scripts, QA logs, SQL query plans, screenshots, monitoring graphs, backup restore report and rollback rehearsal. Tests themselves must be version-controlled, rerunnable and run in CI where safe.

Sources: https://asvs.owasp.org/ ; https://www.postgresql.org/docs/current/explicit-locking.html ; https://www.postgresql.org/docs/current/transaction-iso.html
