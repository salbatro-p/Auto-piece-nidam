# AutoParts Business acceptance

The [22 November local acceptance matrix](LOCAL_PHASE1_2026-11-22.md) covers the Windows company installation, migration 016, language checks and local recovery. Earlier dated observations follow.

## Historical Phase 1 report

## 12 November 2026 — requested local login change

The owner requested email/password-only access in the loopback development preview. Production MFA and the existing enrollment remain intact. This change passed 46 core/API tests, 11 local browser tests, one additional standard-MFA browser test, type checking and build. All 45 original database tables and 2,832 media files remained unchanged. The first browser run exposed a short-viewport logout overflow; the corrected sidebar passed the full rerun. [Policy and rollback](LOCAL_PREVIEW_LOGIN.md); [dated evidence](evidence/local-password-login.json). Earlier measurements below retain their original scope and dates.


Updated 11 November 2026 (user timezone Europe/Istanbul). Run timestamps in JSON evidence are UTC; retained older import/restart artifacts identify their original execution dates. This continues the existing v1.2 project and integrates v1.3. AutoParts Business runs locally at http://127.0.0.1:4173 with real PostgreSQL persistence and synthetic data. **Phase 1 is not declared complete. No staging or production deployment, real-company import, provider connection or publication has occurred.** Shop remains Phase 2.

## Observed local results

- Backend, security, domain, localization, pricing and parser tests: **43/43 passed**, 0 failures in the latest log. [Log](evidence/api-test-output.txt), [measured integration cases](evidence/api-integration.json).
- Built Business application: **10 browser tests passed**, 0 failed, 0 skipped. Chromium on Windows, 390×844 phone and 1280×800 tablet emulation, with additional 320px reflow checks. [Browser results](evidence/browser-results.json).
- AR/FR/EN: **521 keys per locale, 100% technical key coverage**; 45 backend domain errors covered. **Professional approval: 0%**. [Coverage](evidence/translation-coverage.json).
- INV-01–08 passed: 100-way last-unit contention, ten identical retries, sale/transfer races, multi-SKU ordering, reservation expiry, quarantine/damage and immutable ledger protections. Warehouse and bin ledgers reconciled.
- New-product image upload + carton receipt produced exactly 10 PCS across language switches; supplier references, replacement evidence and independently approved opening counts passed browser and API tests. [Product/receipt](evidence/owner-product-receipt.json), [import/bins](evidence/browser-import-bins.json), [catalog/opening](evidence/browser-catalog-opening.json).
- Offline switching and expired-session reauthentication preserved a three-piece cart without changing stock. Offline shell AR/FR/EN works and caches only four static assets. [Draft](evidence/offline-session-draft.json), [cache inspection](evidence/offline-shell.json).
- Expanded automated axe coverage includes nine screens × three languages × two device sizes, product/receipt drafts, login and new photo galleries. Read the current browser result for failures; zero observed violations is **not** complete WCAG or physical screen-reader certification. [Screenshots](evidence/screenshots), [gallery checks](evidence/image-browser.json).
- Dependency audit: **0 reported vulnerabilities** at scan time. [Audit](evidence/dependency-audit.json). This does not replace a manual application security review.
- Saved-runtime resume check: **PASS**, 2026-11-11T14:52:19.969Z. Existing migration checksums/record counts, authenticated reconciliation and AR/FR/EN phone header checked without reseeding. [Resume evidence](evidence/runtime-resume.json).

## Moroccan business dates

Pinned Casablanca timezone data: **2026f**; transition/day-boundary checks **PASS** across 71 transitions. The installed Node and PostgreSQL timezone data lagged the current Moroccan rule. The shared formatter and dashboard now use the same bundled rules, with UTC timestamps preserved and the saved sale timestamp returned on initial receipt and replay. Browser receipt assertions compare AR/FR/EN against that instant. [Timezone policy and primary sources](BUSINESS_TIMEZONE.md), [boundary evidence](evidence/business-timezone.json), [receipt assertions](evidence/sale-response-loss.json).

## v1.3 image-system evidence

Rights-controlled private image files, exact SKU/manufacturer snapshots, five distinct media categories, immutable reviews, independently gated public selection, source/expiry/revocation checks, exact vehicle filtering, responsive galleries, and coverage/review queues are implemented. Changing license terms invalidates the old approval. Product/vehicle applicability is rechecked on reads. Image presence never creates a fitment.

Excel+ZIP batch: **1000 rows**, 900 staged, 50 duplicates, 50 errors; **151.7 s**, **252.1 MiB** peak combined test-process RSS against a 512 MiB bound. Restart at row 500, same-row replay and unchanged stock passed. No automatic approvals. [Batch evidence](evidence/image-batch-1000.json).

Phone/tablet AR/FR/EN gallery, alt text, RTL, broken-image fallback and lost-upload-response recovery: [browser evidence](evidence/image-browser.json). CSV+ZIP preview/retry evidence: **executed; see artifact**. [Bulk browser](evidence/image-bulk-browser.json). The coverage report describes **synthetic fixtures only**, not the company’s real catalogue: [itemized synthetic coverage](evidence/image-coverage-synthetic.json). No real company product photographs, supplier license grants, or worldwide diagram coverage were supplied or claimed.

Protected media restore: **33 objects**, matching file hashes **true**, authenticated restored thumbnail **true**. Legacy BLOB uploads are retained pending explicit matching/migration and review. New imports are private files rather than unbounded database BLOBs.

## Representative backend measurements

Windows, Node 24.16.0, PostgreSQL 18.4, Intel i7-8850H (12 logical CPUs), approximately 34 GB RAM. Real database; Fastify injection excludes TCP/WAN delay. Synthetic dataset: 100,000 products, 1,000,000 fitments, 10,000 variants, three warehouses. No claim of actual Android, network-throttled LCP, OS-cold cache, sustained soak or hosted availability. [Complete report and plans](evidence/performance.json).

| Scenario | Rate | Observed p95 / p99 ms | p95 target ms | Result |
|---|---:|---:|---:|---|
| exact SKU search, initially unprimed application cache | 50/s | 10.78 / 16.56 | 500 | PASS |
| exact SKU repeated warm set | 50/s | 12.34 / 14.42 | 500 | PASS |
| variant verified fitment filter | 25/s | 19.86 / 23.8 | 900 | PASS |
| product and stock read | 50/s | 11.74 / 15.23 | 300 | PASS |
| receipt writes, 20 per second | 20/s | 24.89 / 28.78 | 800 | PASS |
| dashboard | 2/s | 180.19 / 244.92 | 1500 | PASS |
| catalog list plus bounded thumbnail reads | 2/s | 198.45 / 226.53 | 900 | PASS |

The earlier exact-search p99 miss is retained in [the pre-fix measurement](evidence/performance-before-exact-search.json). Indexed identifier-first lookup fixed that observed regression. This is not a guarantee against all future performance regressions.

The initial v1.3 [load run](evidence/performance-v13-before-query-review.json) and [intermediate run](evidence/performance-v13-before-selective-filters.json) are also retained. Query plans identified optional-filter predicates that prevented selective vehicle lookup, repeated dashboard work and connection startup costs. The revised queries, pending-review index, bounded dashboard memory and eight prepared connections now have **PASS** for the latest measured backend scenarios above. These are local service timings, not page-load or physical-device measurements.

Local pool-pressure drill: **PASS**. 3000 requests in 300.0 seconds, 100 simultaneous requests per burst. Observed 30 connections and up to 227 queued acquisitions; the queue drained after every burst. 150 distinct receipts from 300 concurrent write/retry requests had exactly 150 pieces of stock effect. Peak test-process RSS 245.43 MiB, zero unexpected database disconnects and reconciled warehouse/bin ledgers. [Pressure evidence](evidence/pool-soak.json). This five-minute burst profile does not establish multi-hour staging stability or hosted availability.

## Recovery and import evidence

100,000 valid imported rows produced exactly 100,000 distinct products after forcibly killing the worker at the committed 50% checkpoint and starting a fresh process. Commit including restart: **30.95 s**; full run including invalid-file validation: **45.74 s**. Peak worker RSS **250.8 MiB**; API RSS **301.4 MiB**. Separate 100,000-row invalid file: three injected errors detected, no products committed. [Import drill](evidence/import-resumption.json).

An isolated PostgreSQL cluster was stopped during a request between balance update and ledger insertion. Recovery took **5.13 s**; the interrupted transaction rolled back and ten same-key retries posted one receipt. [Database restart](evidence/database-restart.json). This test originally exposed an unhandled connection-error crash, now handled without hiding query failures.

A logical backup restored into a new isolated database with identical counts/hashes for all recorded critical tables, one sale deduction under replay, and warehouse/bin reconciliation. [Restore report](evidence/restore-drill.json). These local drills do **not** establish production RPO ≤15 minutes or RTO ≤2 hours.

## Required evidence register

Source base: `1e2121a9b3a5` plus the exact working source hash in [manifest](evidence/manifest.json): `5b14f253c31d88abdaac80204f70863b426fd892f6058756967fe5d26f8baca8`. Each artifact retains its own execution time. The manifest is an integrity index, not a claim that earlier performance runs used later unrelated UI additions.

| Requirement ID | Implementation / revision | Test | Date UTC | Environment | Observed | Target | Status | Evidence | Owner | Remediation | Risk accepted by |
|---|---|---|---|---|---|---|---|---|---|---|---|
| INV-01–08, SEC-01/02 | inventory/auth/db; source manifest | integration suite | 2026-11-11T14:41:01.200Z | Local PG, synthetic | 43 pass, 0 fail | All assertions | PASS (executed scope) | [API](evidence/api-integration.json) | Engineering | Manual ASVS review still required | Nobody |
| I18N-01/02/03, A09-08 | Business + i18n | Business and image browser scenarios | 2026-11-11T14:47:01.640Z | Built Chromium emulation | 10 pass | No lost drafts or stock duplicates | PASS | [Browser](evidence/browser-results.json) | Engineering | Repeat on physical devices | Nobody |
| IMG-01–10 | media/discovery/import modules + migrations 012–014 | Rights, variants, 1k batch, browser, thumbnail load | 2026-11-11T14:43:36.571Z | Local synthetic fixtures | See individual artifacts | All tests + lawful company pilot coverage | PARTIAL — real content/device gates remain | [Batch](evidence/image-batch-1000.json), [images](evidence/image-browser.json), [load](evidence/performance.json) | Engineering + company | Authorized originals/rights, fitment review, target devices | Nobody |
| L10-03b, I18N-05 review | dictionaries/product review | Qualified linguistic review | Not run | AR/FR/EN human review | 0% approved | 100% critical text reviewed | NOT TESTED | [Coverage](evidence/translation-coverage.json) | Company linguistic reviewers | Approve exact message revision | Nobody |
| DATA-01, REL-02 | imports + worker | Kill at 50% | 2026-11-04T21:15:57.271Z | Local 100k fixture | 100k distinct, no invalid writes | Resume without duplicate | PASS | [Import](evidence/import-resumption.json) | Engineering | Repeat staging volume and licensed files | Nobody |
| REL-01 | db/inventory | Immediate PG restart | 2026-11-06T21:07:00.862Z | Separate local cluster | Atomic rollback and one retry effect | All or nothing | PASS | [Restart](evidence/database-restart.json) | Engineering | Hosted failover rehearsal | Nobody |
| REL-04 | restore script | Snapshot restore + sale | 2026-11-11T14:52:16.894Z | Separate local database | Hashes/counts match | Local restore integrity | PASS (local only) | [Restore](evidence/restore-drill.json) | Engineering | Encrypted off-host backup/WAL and staging RPO/RTO | Nobody |
| OPS-01 / pool pressure | pool-soak script + API | Five-minute concurrent bursts and duplicate receipts | 2026-11-07T01:52:53.299Z | Local 100k/1m synthetic database | 3000 requests; see queue/memory/integrity assertions | Bounded pool and exactly-once effects | PASS (local bounded drill) | [Pressure](evidence/pool-soak.json) | Engineering | Extended staging soak and target-host sizing | Nobody |
| OPS-01/02, A09-10 | infrastructure/runbooks | Staging rollback and monitoring | Not run | Hosting not provisioned | None | Verified alerts, backup, rollback | NOT TESTED | [Operations](OPERATIONS.md) | Company + Engineering | Choose authorized hosting; then rehearse | Nobody |
| L10-04c/06b, UX-01 | Business | Physical device/scanner/screen reader | Not run | Target devices unavailable | Emulation only | Actual devices and network profile | NOT TESTED | [Screenshots](evidence/screenshots) | Company QA | Tablet/Android/scan/zoom/assistive review | Nobody |
| LEGAL-01 | policies, sources, tax configuration | Legal/accountant/data rights review | Not run | Real company scope | No real data or assumed tax rate | Named company approvals | NOT TESTED | [Source register](SOURCE_LICENSE_REGISTER.md) | Company reviewers | Validate tax/privacy/rights and opening count | Nobody |
| Phase 2 I18N-04/PAY/SHIP | contracts + Shop seam | Public checkout/provider scenarios | Not run | Shop not implemented | No public application | Run at Phase 2 | NOT TESTED | [Readiness](PHASE2_READINESS.md) | Future Phase 2 team | Separate Shop, shared inventory, full locale regression | Nobody |

## Release decision and remaining work

Gate 1's local persisted vertical slice is demonstrated. Gate 2 and Gate 3 remain **partial**: core modules, technical attributes, image workflows and local hardening exist, while qualified automotive vocabulary/translation review, licensed business content, actual target-device accessibility/performance and independent security review remain required. Optional supplier/diagram adapters cannot be validated without an authorized provider and licensed data. Product-master imports deliberately do not trust supplied translation-approval claims. Opening imports are limited to 500 rows per review and require an existing validated product and warehouse/bin code; branch text is source evidence, while authorization uses the warehouse ID.

Docker and hosted CI definitions have not been executed here. Real-device screen-reader/scan/print/PWA installation, target-network LCP and extended multi-hour staging saturation/soak remain NOT TESTED. External outbox provider effects are unbuilt Phase 2 work; local outbox deduplication is not proof of a real payment/courier effect.

Gate 4 requires a separately approved staging/pilot, licensed company records, physically counted and signed opening inventory and trained staff. Gate 5 requires all release gates, named reviewers, monitored backups and **explicit production approval**. No residual risk is marked accepted. This report must not be used as a production go-live approval.
