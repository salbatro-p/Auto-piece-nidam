# Blueprint v1.2 traceability and acceptance register

Updated 2026-10-30. This register maps the supplied blueprint to implementation and verification. **NOT TESTED is not PASS.** A named path indicates responsibility/implementation location, not acceptance. `docs/evidence/` contains observed runs when present. Test results are summarized in `ACCEPTANCE_REPORT.md`; unrun/manual requirements remain release blockers. Issue owner is Engineering unless a company reviewer is explicitly named. No residual risk has been accepted by the owner.

## Phase 1 outcomes and shared specification

| ID / source | Requirement | Implementation path | Verification and required evidence | Initial release status |
|---|---|---|---|---|
| P1-01 / 01.1 | Git monorepo, exact lockfile, env, migration, Docker, CI, reproducible setup | root package/lock, scripts, db/migrations, infrastructure, .github | typecheck/build/test logs; fresh environment replay; Docker build | NOT TESTED |
| P1-02 / 01.2,03.A–B | Private installable responsive Business; one PostgreSQL authority, modular monolith | apps/business, apps/api, db | persisted vertical slice; manifest/offline rules; restart | NOT TESTED |
| P1-03 / 01.3,03.C | Invited staff, server RBAC, MFA, sessions, audit; tenant/branch scope | apps/api/src/auth.ts, staff routes, migrations | SEC-01/02 and role matrix; physical handover | NOT TESTED |
| P1-04 / 01.4,03.C vehicles | Make→model→generation→market/year→exact engine/body/equipment variant, aliases/provenance | catalog/vehicle schema and routes | duplicate engine rejection; DATA-02; source review | NOT TESTED |
| P1-05 / 01.5,03.C parts | Canonical products, packaging, exact refs/barcodes, categories, rights media, supplier refs/supersessions/history | product schema/routes, Business catalog | create/edit/search/upload; preserved identifiers; duplicate diagnostics | NOT TESTED |
| P1-06 / 01.6,05 | Auditable legal discovery/import, snapshots, source rights/freshness/confidence/coverage | source registry, import routes, SOURCE_LICENSE_REGISTER.md | authorized fixture import; no unsupported VERIFIED; rights tests | NOT TESTED |
| P1-07 / 01.7,03.D | Indexed exact/normalized multilingual search, variants, filters, pagination and reasons | catalog routes/indexes, Business search | exact SKU/OEM/GTIN AR/FR/EN; accent search; load/EXPLAIN | NOT TESTED |
| P1-08a / 01.8 | Receipt, PCS/carton, multiple warehouses/bins and transfers | inventory domain/routes | INV-03/07; conservation/reconciliation | NOT TESTED |
| P1-08b / 01.8 | Finite reservations, sale/dispatch, cancellation/expiry | inventory domain/routes | INV-01/02/04/05; one terminal transition | NOT TESTED |
| P1-08c / 01.8 | Return intake quarantine, damage, inspection, counts/approved corrections, thresholds | inventory domain/routes | INV-06; self-approval rejected; no silent stock overwrite | NOT TESTED |
| P1-08d / 03.C invariants | Atomic ledger+balance+audit/idempotency, no negatives or phantom available, immutable history | migrations, inventory.ts | integration DB constraints; rollback/failure; reconciliation | NOT TESTED |
| P1-09 / 01.9 | Suppliers, POs/status/discrepancies/lead times, quotes, sales, protected cost, exact MAD/tax/export | procurement/sales/report routes | permission and totals tests; unreceived exclusion; sale receipt | NOT TESTED |
| P1-10 / 01.10 | Stock, low/out, reserved, reorder, daily movement, authorized value, imports/reviews; unavailable historical metrics | dashboard route + view | compare API aggregate with ledger; insufficient history labels | NOT TESTED |
| P1-11 / 01.11,03.H | Original tablet/phone/warehouse UI, scan fallback, accessible controls, AR/FR/EN | apps/business | UX-01 and I18N-01–06; real device camera/USB scanner | NOT TESTED |
| P1-12 / 01.12,03.I,06 | CSV/XLSX mappings, type/duplicate errors, dry-run approval, exceptions, safe export, opening ledger and revert plan | import routes/UI, templates | DATA-01; denied destructive changes; formula escape; resume | NOT TESTED |
| P1-13 / 01.13,03.E–G | Phase 2 public projection/identity/availability/pricing/provider contracts/outbox; Shop absent | apps/shop, packages/contracts, PHASE2_READINESS.md | boundary review; anonymous leakage; replay-safe outbox | NOT TESTED |
| P1-14 / 01.14 | Run local software, demo-only access, real screenshot/E2E evidence; honest deployment state | scripts, tests/e2e, docs/evidence | health check, UI walkthrough and persisted stock | NOT TESTED |
| OPS-01 / 01 reliability | Tracing, health, redacted errors, monitoring, rates, environments, secrets | API middleware, OPERATIONS.md | health/error/attack tests; hosted alert routing verification | NOT TESTED |
| OPS-02 / 01 reliability | Automated backups, verified restore, incident/rollback runbooks | scripts, OPERATIONS.md | REL-04; restore hashes/counts/flow + timings | NOT TESTED |
| OPS-03 / 03.G | Async bounded external adapters, timeouts/retries/circuit breaker/dead-letter, durable progress | integrations/outbox seams | REL-02/03, DATA-03; external adapters remain disabled | NOT TESTED |
| LEGAL-01 / 03.J,05,08 | CNDP/privacy/transfer, media/catalog rights, tax/invoice review; no live data/provider spend | SOURCE_LICENSE_REGISTER.md, release gate | Company legal/accounting/data-license sign-off | NOT TESTED — company review |
| DOC-01 / 01 deliverables | PRD, UX, ADR/ERD, threat/RBAC, source register, OpenAPI, runbooks | docs, API OpenAPI | completeness/source-to-code review | NOT TESTED |

## Two-application architecture addendum (09)

| ID | Requirement | Implementation path | Acceptance evidence | Initial release status |
|---|---|---|---|---|
| A09-01 | Business private tablet/owner phone role experiences; Shop separately deployable | apps/business, apps/shop, ARCHITECTURE.md | distinct packages/no public commerce; role UI screenshots | NOT TESTED |
| A09-02 | One shared backend/ledger; no copying stock or spreadsheet authority | apps/api, db | transactional race/reconciliation; architecture review | NOT TESTED |
| A09-03 | Invite-only, owner MFA, inactivity lock, individual login, shift audit, remote revocation | auth/staff routes and Business session handling | API tests plus real device role-switch/lock | NOT TESTED |
| A09-04 | Owner create part with rights image, localization, supplier/SKU/OEM/barcode, DRAFT→internal approval | product routes and Business catalog | phone product/upload/locale tests; duplicate check | NOT TESTED |
| A09-05 | Explicit receiving preview/confirmation, physical condition and carton conversion | inventory receipt screen/domain | 10PCS carton result, supplier duplicate bill, I18N-02 | NOT TESTED |
| A09-06 | Counter sale authoritative commit or unconfirmed lookup after network loss | POS and sale/idempotency routes | dropped response, same-key lookup/retry, owner refresh | NOT TESTED |
| A09-07 | Count reason/approval, returned quarantine, review notifications | inventory/admin/dashboard | count approval + physical inspection tests | NOT TESTED |
| A09-08 | Offline drafts/read-only, no automatic offline sale | PWA and API client | browser offline test; no queued mutation on reconnect | NOT TESTED |
| A09-09 | Public fields/publishing require rights; private costs/bins/staff remain inaccessible | public seam and API projection | field-level leakage test and forbidden public routes | NOT TESTED |
| A09-10 | Independent non-destructive frontend rollback/migrations | infra, OPERATIONS.md | staging deployment rollback rehearsal | NOT TESTED |
| A09-11 | No live deployment/import/payment/provider account without approval | local-only execution and report | workspace/runtime and deployment record | NOT TESTED |

## Mandatory localization addendum (10)

| ID | Requirement | Implementation path | Acceptance evidence | Initial release status |
|---|---|---|---|---|
| L10-01a | Visible top AR/FR/EN selector at login and every Business screen/dialog; native names | header + packages/i18n | screenshots for each locale/screen group at 390×844 and 1280×800 | NOT TESTED |
| L10-01b | Touch/keyboard/screen-reader operable selector; no mobile/RTL overlap | header/CSS | automated accessibility + keyboard + physical device review | NOT TESTED |
| L10-02a | Immediate no-reload locale change preserves filter/cart/quantity/forms/uploads/session | locale provider + stable component state | I18N-01/02 with DOM/state and DB assertions | NOT TESTED |
| L10-02b | Secure user preference across sign-in/devices; no shared-tablet leakage or other-user forced change | profile locale API/auth | I18N-03; independent contexts | NOT TESTED |
| L10-02c | Explicit preference→supported browser→configurable FR default | locale resolver/settings | resolver cases and owner default change | NOT TESTED |
| L10-03a | Complete UI including errors/validation/offline/dialogs/reports/inventory/status/help | typed dictionaries/backend codes | key coverage and all visible-string audit | NOT TESTED |
| L10-03b | Professionally reviewed AR/FR/EN, critical-message approvals | translation-review evidence | Qualified human reviewer approvals for all locales | NOT TESTED — linguistic review |
| L10-03c | Localized product descriptions/categories/vocabulary with editor/import review/fallback/coverage | translation schema + catalog/import | missing translation visible; exact identifiers unchanged | NOT TESTED |
| L10-03d | Stable IDs, ICU interpolation/plurals, locale dates/numbers, legitimate Arabic fonts | packages/i18n | plural/format unit tests and glyph screenshots | NOT TESTED |
| L10-04a | Document lang/dir, RTL layout/tables/forms/drawers/focus and logical CSS | Business components/style | AR screenshots + DOM direction + manual component audit | NOT TESTED |
| L10-04b | Bidi isolation identifiers/names/prices/quantities; images/barcodes not mirrored | identifier controls + receipt | I18N-06 exact byte/copy/search checks | NOT TESTED |
| L10-04c | WCAG 2.2 AA controls, contrast/focus, zoom/large text, touch/screen reader | Business UI | axe + keyboard/zoom screenshots; manual screen-reader/device | NOT TESTED |
| L10-05a | Locale cannot alter price/stock/tenant/warehouse/permissions/fitment | API ignores UI locale for domain semantics | same-key request locale replay, invariant assertions | NOT TESTED |
| L10-05b | Exact money/units, decimal parsing AR/FR, UTC→Casablanca formatting | format/parse + inventory | numeric tests and receipt equality | NOT TESTED |
| L10-05c | Explicit localized receipts/exports/drafts, numeric consistency; legal text reviewed | receipt/export renderer | AR/FR/EN receipt totals/date assertions; accountant review | NOT TESTED |
| L10-05d | Shop locale SEO/route/cart/customer state preserved; no fallback leak | Phase 2 only | I18N-04 + SEO/publication tests at Phase 2 | NOT TESTED — not released |
| L10-06a | Shared typed package, public/private bundle separation, coverage tooling | packages/i18n and contracts | typecheck, dictionary coverage and bundle review | NOT TESTED |
| L10-06b | Measured switch/render cost, bundle/caching/layout flash on target hardware | browser metrics + performance harness | local timing plus real Android/tablet profiling | NOT TESTED |
| L10-06c | All ten mandatory scenarios, screen×locale×device matrix and evidence | tests/e2e + ACCEPTANCE_REPORT.md | observed tests, screenshots and review record | NOT TESTED |

## QA attack/failure matrix (04)

| Test ID | Required assertion | Evidence owner/location | Initial status |
|---|---|---|---|
| INV-01 | 100 contenders for one unit; exactly one reservation | integration test + reconciliation | NOT TESTED |
| INV-02 | Ten retries produce one mutation/document | integration + E2E response-loss test | NOT TESTED |
| INV-03 | Sale vs transfer serialized and location stock correct | integration test | NOT TESTED |
| INV-04 | Opposite-order multi-SKU requests do not deadlock or double-sell | integration test | NOT TESTED |
| INV-05 | Cancel/fulfill/expiry race one legal terminal state | integration test | NOT TESTED |
| INV-06 | Duplicate damaged return remains non-sellable once | integration test | NOT TESTED |
| INV-07 | Wrong unit/pack and vendor bill duplicate prevented | integration test | NOT TESTED |
| INV-08 | Manual client balance tampering rejected/audited | integration security test | NOT TESTED |
| DATA-01 | 100k import duplicates/invalid data/formulas; memory bounded, no overwrite | load/import scripts + RSS logs | NOT TESTED |
| DATA-02 | Same model/year different engine never conflated | catalog test | NOT TESTED |
| DATA-03 | Supplier outage/revocation preserves safe local use | failure-injection integration | NOT TESTED |
| SEC-01 | Wrong role/branch guessed identifiers denied | API security tests | NOT TESTED |
| SEC-02 | SQLi/XSS/CSRF/upload/brute-force controls | API + browser security tests/audit | NOT TESTED |
| REL-01 | Database restart mid-transaction all-or-nothing, safe retry | failure-injection log | NOT TESTED |
| REL-02 | Import killed at 50% resumes without duplication | import crash drill | NOT TESTED |
| REL-03 | Same outbox event replayed 10× no duplicate external effect | consumer test | NOT TESTED |
| REL-04 | Restore fresh DB, counts/hash/reconciliation/flow and RPO/RTO | backup drill report | NOT TESTED |
| PAY-01/02 | Verified duplicate/order/late-payment transitions | Phase 2 sandbox provider tests | NOT TESTED — Phase 2 |
| SHIP-01/02 | Timeout lookup/reconcile; safe queued courier failure | Phase 2 adapter tests | NOT TESTED — Phase 2 |
| UX-01 | Android search RTL and mixed labels legible and scannable | browser screenshots + physical-device sign-off | NOT TESTED |
| I18N-01 | Tablet FR→AR→EN mid-sale including retry retains all values | tests/e2e/business.spec.ts | NOT TESTED |
| I18N-02 | Phone mid-product upload and receipt retains draft, commits 10PCS | tests/e2e/business.spec.ts | NOT TESTED |
| I18N-03 | Shared-tablet separate staff preferences/session | tests/e2e/business.spec.ts | NOT TESTED |
| I18N-04 | Shop guest full commerce locale preservation | Phase 2 only | NOT TESTED — Phase 2 |
| I18N-05 | Three-locale critical paths/accessibility/receipts reviewed | E2E + coverage + review record | NOT TESTED |
| I18N-06 | Exact OEM/SKU/VIN/barcodes, currency/date/unit arithmetic | format/unit/E2E | NOT TESTED |

## Performance and operations targets (proposed, not observed)

Representative seed: 100,000 SKUs, 1,000,000 fitments, 10,000 variants, 3 warehouses. Record cold/warm runs, machine/network, duration, rates, indexes/plans, p50/p95/p99 and errors. Exact reference search p95≤500ms at 50rps (p99≤1.5s); compatible vehicle search p95≤900ms at 25rps; stock reads p95≤300ms at 50rps; distributed stock writes p95≤800ms at 20rps; dashboard p95≤1.5s. Main-screen LCP p75≤2.5s on agreed device/network. Record 100k import duration/max RSS/restart behavior. Pool saturation and hotspot contention must preserve integrity regardless of latency. None of these targets is passed by a small fixture smoke test.

Hosted availability≥99.9%, RPO≤15min and RTO≤2h require real monitoring and restore drills. Staging migration/rollback, encrypted off-host backups, alerting, privacy/legal review, target-device acceptance, qualified translation approval, physical count and signed company pilot are independent gates. Phase 1 cannot be declared complete while these release gates are untested.
