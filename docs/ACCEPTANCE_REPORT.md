# Phase 1 acceptance report — NOT READY FOR RELEASE

Updated 5 November 2026 (user timezone Europe/Istanbul). Run timestamps below and in JSON evidence are UTC; several local runs occurred on 4 November UTC. AutoParts Business runs locally at http://127.0.0.1:4173 with real PostgreSQL persistence and synthetic data. **Phase 1 is not declared complete. No staging or production deployment, real-company import, provider connection or publication has occurred.** Shop remains Phase 2.

## Observed local results

- Backend, security, domain, localization, pricing and parser tests: **36 passed**, zero failures in the latest log. [Log](evidence/api-test-output.txt), [measured integration cases](evidence/api-integration.json).
- Built Business application: **8 browser tests passed**, 0 failed, 0 skipped. Chromium on Windows, 390×844 phone and 1280×800 tablet emulation, with additional 320px reflow checks. [Browser results](evidence/browser-results.json).
- AR/FR/EN: **429 keys per locale, 100% technical key coverage**; 39 backend domain errors covered. **Professional approval: 0%**. [Coverage](evidence/translation-coverage.json).
- INV-01–08 passed: 100-way last-unit contention, ten identical retries, sale/transfer races, multi-SKU ordering, reservation expiry, quarantine/damage and immutable ledger protections. Warehouse and bin ledgers reconciled.
- New-product image upload + carton receipt produced exactly 10 PCS across language switches; supplier references, replacement evidence and independently approved opening counts passed browser and API tests. [Product/receipt](evidence/owner-product-receipt.json), [import/bins](evidence/browser-import-bins.json), [catalog/opening](evidence/browser-catalog-opening.json).
- Offline switching and expired-session reauthentication preserved a three-piece cart without changing stock. Offline shell AR/FR/EN works and caches only four static assets. [Draft](evidence/offline-session-draft.json), [cache inspection](evidence/offline-shell.json).
- Automated axe checks reported no violations on tested login/device/locale combinations and EN/AR owner dashboards. This is **not** a complete WCAG or screen-reader certification. [Screenshots](evidence/screenshots), [example axe result](evidence/axe-owner-dashboard-ar.json).
- Dependency audit: **0 reported vulnerabilities** at scan time. [Audit](evidence/dependency-audit.json). This does not replace a manual application security review.

## Representative backend measurements

Windows, Node 24.16.0, PostgreSQL 18.4, Intel i7-8850H (12 logical CPUs), approximately 34 GB RAM. Real database; Fastify injection excludes TCP/WAN delay. Synthetic dataset: 100,000 products, 1,000,000 fitments, 10,000 variants, three warehouses. No claim of actual Android, network-throttled LCP, OS-cold cache, sustained soak or hosted availability. [Complete report and plans](evidence/performance.json).

| Scenario | Rate | Observed p95 / p99 ms | p95 target ms | Result |
|---|---:|---:|---:|---|
| exact SKU search, initially unprimed application cache | 50/s | 10.27 / 15.91 | 500 | PASS |
| exact SKU repeated warm set | 50/s | 10.58 / 13.24 | 500 | PASS |
| variant verified fitment filter | 25/s | 51.48 / 53.81 | 900 | PASS |
| product and stock read | 50/s | 8.99 / 9.65 | 300 | PASS |
| receipt writes, 20 per second | 20/s | 26.94 / 28.82 | 800 | PASS |
| dashboard | 2/s | 313.39 / 338.09 | 1500 | PASS |

The earlier exact-search p99 miss is retained in [the pre-fix measurement](evidence/performance-before-exact-search.json). Indexed identifier-first lookup fixed that observed regression. This is not a guarantee against all future performance regressions.

## Recovery and import evidence

100,000 valid imported rows produced exactly 100,000 distinct products after forcibly killing the worker at the committed 50% checkpoint and starting a fresh process. Commit including restart: **30.95 s**; full run including invalid-file validation: **45.74 s**. Peak worker RSS **250.8 MiB**; API RSS **301.4 MiB**. Separate 100,000-row invalid file: three injected errors detected, no products committed. [Import drill](evidence/import-resumption.json).

An isolated PostgreSQL cluster was stopped during a request between balance update and ledger insertion. Recovery took **1.89 s**; the interrupted transaction rolled back and ten same-key retries posted one receipt. [Database restart](evidence/database-restart.json). This test originally exposed an unhandled connection-error crash, now handled without hiding query failures.

A logical backup restored into a new isolated database with identical counts/hashes for all recorded critical tables, one sale deduction under replay, and warehouse/bin reconciliation. [Restore report](evidence/restore-drill.json). These local drills do **not** establish production RPO ≤15 minutes or RTO ≤2 hours.

## Required evidence register

Source base: `faa238ee16a5` plus the exact working source hash in [manifest](evidence/manifest.json): `39fd61ece1e3f89d5bbc621e4cf468ec1a53d2fdad3dc7b49be2f1b340604007`. Each artifact retains its own execution time. The manifest is an integrity index, not a claim that earlier performance runs used later unrelated UI additions.

| Requirement ID | Implementation / revision | Test | Date UTC | Environment | Observed | Target | Status | Evidence | Owner | Remediation | Risk accepted by |
|---|---|---|---|---|---|---|---|---|---|---|---|
| INV-01–08, SEC-01/02 | inventory/auth/db; source manifest | integration suite | see artifact | Local PG, synthetic | Latest suite passes | All assertions | PASS (executed scope) | [API](evidence/api-integration.json) | Engineering | Manual ASVS review still required | Nobody |
| I18N-01/02/03, A09-08 | Business + i18n | Eight browser scenarios | 2026-11-04T21:19:08.207Z | Built Chromium emulation | 8 pass | No lost drafts or stock duplicates | PASS | [Browser](evidence/browser-results.json) | Engineering | Repeat on physical devices | Nobody |
| L10-03b, I18N-05 review | dictionaries/product review | Qualified linguistic review | Not run | AR/FR/EN human review | 0% approved | 100% critical text reviewed | NOT TESTED | [Coverage](evidence/translation-coverage.json) | Company linguistic reviewers | Approve exact message revision | Nobody |
| DATA-01, REL-02 | imports + worker | Kill at 50% | 2026-11-04T21:15:57.271Z | Local 100k fixture | 100k distinct, no invalid writes | Resume without duplicate | PASS | [Import](evidence/import-resumption.json) | Engineering | Repeat staging volume and licensed files | Nobody |
| REL-01 | db/inventory | Immediate PG restart | 2026-11-04T19:45:35.014Z | Separate local cluster | Atomic rollback and one retry effect | All or nothing | PASS | [Restart](evidence/database-restart.json) | Engineering | Hosted failover rehearsal | Nobody |
| REL-04 | restore script | Snapshot restore + sale | 2026-11-04T21:16:40.029Z | Separate local database | Hashes/counts match | Local restore integrity | PASS (local only) | [Restore](evidence/restore-drill.json) | Engineering | Encrypted off-host backup/WAL and staging RPO/RTO | Nobody |
| OPS-01/02, A09-10 | infrastructure/runbooks | Staging rollback and monitoring | Not run | Hosting not provisioned | None | Verified alerts, backup, rollback | NOT TESTED | [Operations](OPERATIONS.md) | Company + Engineering | Choose authorized hosting; then rehearse | Nobody |
| L10-04c/06b, UX-01 | Business | Physical device/scanner/screen reader | Not run | Target devices unavailable | Emulation only | Actual devices and network profile | NOT TESTED | [Screenshots](evidence/screenshots) | Company QA | Tablet/Android/scan/zoom/assistive review | Nobody |
| LEGAL-01 | policies, sources, tax configuration | Legal/accountant/data rights review | Not run | Real company scope | No real data or assumed tax rate | Named company approvals | NOT TESTED | [Source register](SOURCE_LICENSE_REGISTER.md) | Company reviewers | Validate tax/privacy/rights and opening count | Nobody |
| Phase 2 I18N-04/PAY/SHIP | contracts + Shop seam | Public checkout/provider scenarios | Not run | Shop not implemented | No public application | Run at Phase 2 | NOT TESTED | [Readiness](PHASE2_READINESS.md) | Future Phase 2 team | Separate Shop, shared inventory, full locale regression | Nobody |

## Release decision and remaining work

Gate 1's local persisted vertical slice is demonstrated. Gate 2 and Gate 3 remain **partial**: the core modules and local hardening exist, while exhaustive role/screen/locale accessibility review, controlled automotive vocabulary and detailed technical attributes, comprehensive import/source adapter coverage and independent security review need further work. Product-master imports deliberately do not trust supplied translation-approval claims. Opening imports are limited to 500 rows per review and require an existing validated product and warehouse/bin code; branch text is source evidence, while authorization uses the warehouse ID.

Docker and hosted CI definitions have not been executed here. Real-device screen-reader/scan/print/PWA installation, target-network LCP and long-running pool saturation/soak remain NOT TESTED. External outbox provider effects are unbuilt Phase 2 work; local outbox deduplication is not proof of a real payment/courier effect.

Gate 4 requires a separately approved staging/pilot, licensed company records, physically counted and signed opening inventory and trained staff. Gate 5 requires all release gates, named reviewers, monitored backups and **explicit production approval**. No residual risk is marked accepted. This report must not be used as a production go-live approval.
