# Blueprint v1.2/v1.3 traceability and acceptance register

Updated 2026-11-07 (Europe/Istanbul). This register extends the existing project with the supplied v1.3 image addendum. **NOT TESTED is not PASS.** A named path indicates implementation location, not acceptance. `docs/evidence/` contains observed runs when present. Test results are summarized in `ACCEPTANCE_REPORT.md`; unrun/manual requirements remain release blockers. Issue owner is Engineering unless a company reviewer is explicitly named. No residual risk has been accepted by the owner.

## Phase 1 outcomes and shared specification

| ID / source | Requirement | Implementation path | Verification and required evidence | Current requirement status |
|---|---|---|---|---|
| P1-01 / 01.1 | Git monorepo, exact lockfile, env, migration, Docker, CI, reproducible setup | root package/lock, scripts, db/migrations, infrastructure, .github | typecheck/build/test logs; fresh environment replay; Docker build | PARTIAL — implemented/local evidence; full release gate pending |
| P1-02 / 01.2,03.A–B | Private installable responsive Business; one PostgreSQL authority, modular monolith | apps/business, apps/api, db | persisted vertical slice; manifest/offline rules; restart | PARTIAL — implemented/local evidence; full release gate pending |
| P1-03 / 01.3,03.C | Invited staff, server RBAC, MFA, sessions, audit; tenant/branch scope | apps/api/src/auth.ts, staff routes, migrations | SEC-01/02 and role matrix; physical handover | PARTIAL — implemented/local evidence; full release gate pending |
| P1-04 / 01.4,03.C vehicles | Make→model→generation→market/year→exact engine/body/equipment variant, aliases/provenance | catalog/vehicle schema and routes | duplicate engine rejection; DATA-02; source review | PARTIAL — implemented/local evidence; full release gate pending |
| P1-05 / 01.5,03.C parts | Canonical products, packaging, exact refs/barcodes, categories, rights media, supplier refs/supersessions/history | product schema/routes, Business catalog | create/edit/search/upload; preserved identifiers; duplicate diagnostics | PARTIAL — implemented/local evidence; full release gate pending |
| P1-06 / 01.6,05 | Auditable legal discovery/import, snapshots, source rights/freshness/confidence/coverage | source registry, import routes, SOURCE_LICENSE_REGISTER.md | authorized fixture import; no unsupported VERIFIED; rights tests | PARTIAL — implemented/local evidence; full release gate pending |
| P1-07 / 01.7,03.D | Indexed exact/normalized multilingual search, variants, filters, pagination and reasons | catalog routes/indexes, Business search | exact SKU/OEM/GTIN AR/FR/EN; accent search; load/EXPLAIN | PARTIAL — implemented/local evidence; full release gate pending |
| P1-08a / 01.8 | Receipt, PCS/carton, multiple warehouses/bins and transfers | inventory domain/routes | INV-03/07; conservation/reconciliation | PASS — local executed scope; see acceptance evidence |
| P1-08b / 01.8 | Finite reservations, sale/dispatch, cancellation/expiry | inventory domain/routes | INV-01/02/04/05; one terminal transition | PASS — local executed scope; see acceptance evidence |
| P1-08c / 01.8 | Return intake quarantine, damage, inspection, counts/approved corrections, thresholds | inventory domain/routes | INV-06; self-approval rejected; no silent stock overwrite | PASS — local executed scope; see acceptance evidence |
| P1-08d / 03.C invariants | Atomic ledger+balance+audit/idempotency, no negatives or phantom available, immutable history | migrations, inventory.ts | integration DB constraints; rollback/failure; reconciliation | PASS — local executed scope; see acceptance evidence |
| P1-09 / 01.9 | Suppliers, POs/status/discrepancies/lead times, quotes, sales, protected cost, exact MAD/tax/export | procurement/sales/report routes | permission and totals tests; unreceived exclusion; sale receipt | PARTIAL — implemented/local evidence; full release gate pending |
| P1-10 / 01.10 | Stock, low/out, reserved, reorder, daily movement, authorized value, imports/reviews; unavailable historical metrics | dashboard route + view | compare API aggregate with ledger; insufficient history labels | PARTIAL — implemented/local evidence; full release gate pending |
| P1-11 / 01.11,03.H | Original tablet/phone/warehouse UI, scan fallback, accessible controls, AR/FR/EN | apps/business | UX-01 and I18N-01–06; real device camera/USB scanner | PARTIAL — implemented/local evidence; full release gate pending |
| P1-12 / 01.12,03.I,06 | CSV/XLSX mappings, type/duplicate errors, dry-run approval, exceptions, safe export, opening ledger and revert plan | import routes/UI, templates | DATA-01; denied destructive changes; formula escape; resume | PARTIAL — implemented/local evidence; full release gate pending |
| P1-13 / 01.13,03.E–G | Phase 2 public projection/identity/availability/pricing/provider contracts/outbox; Shop absent | apps/shop, packages/contracts, PHASE2_READINESS.md | boundary review; anonymous leakage; replay-safe outbox | PARTIAL — implemented/local evidence; full release gate pending |
| P1-14 / 01.14 | Run local software, demo-only access, real screenshot/E2E evidence; honest deployment state | scripts, tests/e2e, docs/evidence | health check, UI walkthrough and persisted stock | PASS — local executed scope; see acceptance evidence |
| OPS-01 / 01 reliability | Tracing, health, redacted errors, monitoring, rates, environments, secrets | API middleware, OPERATIONS.md | health/error/attack tests; hosted alert routing verification | PARTIAL — implemented/local evidence; full release gate pending |
| OPS-02 / 01 reliability | Automated backups, verified restore, incident/rollback runbooks | scripts, OPERATIONS.md | REL-04; restore hashes/counts/flow + timings | PARTIAL — implemented/local evidence; full release gate pending |
| OPS-03 / 03.G | Async bounded external adapters, timeouts/retries/circuit breaker/dead-letter, durable progress | integrations/outbox seams | REL-02/03, DATA-03; external adapters remain disabled | PARTIAL — implemented/local evidence; full release gate pending |
| LEGAL-01 / 03.J,05,08 | CNDP/privacy/transfer, media/catalog rights, tax/invoice review; no live data/provider spend | SOURCE_LICENSE_REGISTER.md, release gate | Company legal/accounting/data-license sign-off | NOT TESTED — company review |
| DOC-01 / 01 deliverables | PRD, UX, ADR/ERD, threat/RBAC, source register, OpenAPI, runbooks | docs, API OpenAPI | completeness/source-to-code review | PARTIAL — implemented/local evidence; full release gate pending |

## Two-application architecture addendum (09)

| ID | Requirement | Implementation path | Acceptance evidence | Current requirement status |
|---|---|---|---|---|
| A09-01 | Business private tablet/owner phone role experiences; Shop separately deployable | apps/business, apps/shop, ARCHITECTURE.md | distinct packages/no public commerce; role UI screenshots | PARTIAL — implemented/local evidence; full release gate pending |
| A09-02 | One shared backend/ledger; no copying stock or spreadsheet authority | apps/api, db | transactional race/reconciliation; architecture review | PASS — local executed scope; see acceptance evidence |
| A09-03 | Invite-only, owner MFA, inactivity lock, individual login, shift audit, remote revocation | auth/staff routes and Business session handling | API tests plus real device role-switch/lock | PARTIAL — implemented/local evidence; full release gate pending |
| A09-04 | Owner create part with rights image, localization, supplier/SKU/OEM/barcode, DRAFT→internal approval | product routes and Business catalog | phone product/upload/locale tests; duplicate check | PASS — local executed scope; see acceptance evidence |
| A09-05 | Explicit receiving preview/confirmation, physical condition and carton conversion | inventory receipt screen/domain | 10PCS carton result, supplier duplicate bill, I18N-02 | PASS — local executed scope; see acceptance evidence |
| A09-06 | Counter sale authoritative commit or unconfirmed lookup after network loss | POS and sale/idempotency routes | dropped response, same-key lookup/retry, owner refresh | PASS — local executed scope; see acceptance evidence |
| A09-07 | Count reason/approval, returned quarantine, review notifications | inventory/admin/dashboard | count approval + physical inspection tests | PASS — local executed scope; see acceptance evidence |
| A09-08 | Offline drafts/read-only, no automatic offline sale | PWA and API client | browser offline test; no queued mutation on reconnect | PASS — local executed scope; see acceptance evidence |
| A09-09 | Public fields/publishing require rights; private costs/bins/staff remain inaccessible | public seam and API projection | field-level leakage test and forbidden public routes | PASS — local executed scope; see acceptance evidence |
| A09-10 | Independent non-destructive frontend rollback/migrations | infra, OPERATIONS.md | staging deployment rollback rehearsal | NOT TESTED |
| A09-11 | No live deployment/import/payment/provider account without approval | local-only execution and report | workspace/runtime and deployment record | PASS — local executed scope; see acceptance evidence |

## Mandatory localization addendum (10)

| ID | Requirement | Implementation path | Acceptance evidence | Current requirement status |
|---|---|---|---|---|
| L10-01a | Visible top AR/FR/EN selector at login and every Business screen/dialog; native names | header + packages/i18n | screenshots for each locale/screen group at 390×844 and 1280×800 | PARTIAL — implemented/local evidence; full release gate pending |
| L10-01b | Touch/keyboard/screen-reader operable selector; no mobile/RTL overlap | header/CSS | automated accessibility + keyboard + physical device review | PARTIAL — implemented/local evidence; full release gate pending |
| L10-02a | Immediate no-reload locale change preserves filter/cart/quantity/forms/uploads/session | locale provider + stable component state | I18N-01/02 with DOM/state and DB assertions | PASS — local executed scope; see acceptance evidence |
| L10-02b | Secure user preference across sign-in/devices; no shared-tablet leakage or other-user forced change | profile locale API/auth | I18N-03; independent contexts | PASS — local executed scope; see acceptance evidence |
| L10-02c | Explicit preference→supported browser→configurable FR default | locale resolver/settings | resolver cases and owner default change | PASS — local executed scope; see acceptance evidence |
| L10-03a | Complete UI including errors/validation/offline/dialogs/reports/inventory/status/help | typed dictionaries/backend codes | key coverage and all visible-string audit | PARTIAL — implemented/local evidence; full release gate pending |
| L10-03b | Professionally reviewed AR/FR/EN, critical-message approvals | translation-review evidence | Qualified human reviewer approvals for all locales | NOT TESTED — linguistic review |
| L10-03c | Localized product descriptions/categories/vocabulary with editor/import review/fallback/coverage | translation schema + catalog/import | missing translation visible; exact identifiers unchanged | PARTIAL — implemented/local evidence; full release gate pending |
| L10-03d | Stable IDs, ICU interpolation/plurals, locale dates/numbers, legitimate Arabic fonts | packages/i18n | plural/format unit tests and glyph screenshots | PARTIAL — implemented/local evidence; full release gate pending |
| L10-04a | Document lang/dir, RTL layout/tables/forms/drawers/focus and logical CSS | Business components/style | AR screenshots + DOM direction + manual component audit | PARTIAL — implemented/local evidence; full release gate pending |
| L10-04b | Bidi isolation identifiers/names/prices/quantities; images/barcodes not mirrored | identifier controls + receipt | I18N-06 exact byte/copy/search checks | PASS — local executed scope; see acceptance evidence |
| L10-04c | WCAG 2.2 AA controls, contrast/focus, zoom/large text, touch/screen reader | Business UI | axe + keyboard/zoom screenshots; manual screen-reader/device | PARTIAL — implemented/local evidence; full release gate pending |
| L10-05a | Locale cannot alter price/stock/tenant/warehouse/permissions/fitment | API ignores UI locale for domain semantics | same-key request locale replay, invariant assertions | PASS — local executed scope; see acceptance evidence |
| L10-05b | Exact money/units, decimal parsing AR/FR, UTC→Casablanca formatting | format/parse + inventory | numeric tests and receipt equality | PASS — local executed scope; see acceptance evidence |
| L10-05c | Explicit localized receipts/exports/drafts, numeric consistency; legal text reviewed | receipt/export renderer | AR/FR/EN receipt totals/date assertions; accountant review | PARTIAL — implemented/local evidence; full release gate pending |
| L10-05d | Shop locale SEO/route/cart/customer state preserved; no fallback leak | Phase 2 only | I18N-04 + SEO/publication tests at Phase 2 | NOT TESTED — not released |
| L10-06a | Shared typed package, public/private bundle separation, coverage tooling | packages/i18n and contracts | typecheck, dictionary coverage and bundle review | PASS — local executed scope; see acceptance evidence |
| L10-06b | Measured switch/render cost, bundle/caching/layout flash on target hardware | browser metrics + performance harness | local timing plus real Android/tablet profiling | PARTIAL — implemented/local evidence; full release gate pending |
| L10-06c | All ten mandatory scenarios, screen×locale×device matrix and evidence | tests/e2e + ACCEPTANCE_REPORT.md | observed tests, screenshots and review record | PARTIAL — implemented/local evidence; full release gate pending |

## QA attack/failure matrix (04)

| Test ID | Required assertion | Evidence owner/location | Current status |
|---|---|---|---|
| INV-01 | 100 contenders for one unit; exactly one reservation | integration test + reconciliation | PASS — local executed scope; see acceptance evidence |
| INV-02 | Ten retries produce one mutation/document | integration + E2E response-loss test | PASS — local executed scope; see acceptance evidence |
| INV-03 | Sale vs transfer serialized and location stock correct | integration test | PASS — local executed scope; see acceptance evidence |
| INV-04 | Opposite-order multi-SKU requests do not deadlock or double-sell | integration test | PASS — local executed scope; see acceptance evidence |
| INV-05 | Cancel/fulfill/expiry race one legal terminal state | integration test | PASS — local executed scope; see acceptance evidence |
| INV-06 | Duplicate damaged return remains non-sellable once | integration test | PASS — local executed scope; see acceptance evidence |
| INV-07 | Wrong unit/pack and vendor bill duplicate prevented | integration test | PASS — local executed scope; see acceptance evidence |
| INV-08 | Manual client balance tampering rejected/audited | integration security test | PASS — local executed scope; see acceptance evidence |
| DATA-01 | 100k import duplicates/invalid data/formulas; memory bounded, no overwrite | load/import scripts + RSS logs | PASS — local executed scope; see acceptance evidence |
| DATA-02 | Same model/year different engine never conflated | catalog test | PASS — local executed scope; see acceptance evidence |
| DATA-03 | Supplier outage/revocation preserves safe local use | failure-injection integration | PARTIAL — implemented/local evidence; full release gate pending |
| SEC-01 | Wrong role/branch guessed identifiers denied | API security tests | PASS — local executed scope; see acceptance evidence |
| SEC-02 | SQLi/XSS/CSRF/upload/brute-force controls | API + browser security tests/audit | PARTIAL — implemented/local evidence; full release gate pending |
| REL-01 | Database restart mid-transaction all-or-nothing, safe retry | failure-injection log | PASS — local executed scope; see acceptance evidence |
| REL-02 | Import killed at 50% resumes without duplication | import crash drill | PASS — local executed scope; see acceptance evidence |
| REL-03 | Same outbox event replayed 10× no duplicate external effect | consumer test | PARTIAL — implemented/local evidence; full release gate pending |
| REL-04 | Restore fresh DB, counts/hash/reconciliation/flow and RPO/RTO | backup drill report | PARTIAL — implemented/local evidence; full release gate pending |
| PAY-01/02 | Verified duplicate/order/late-payment transitions | Phase 2 sandbox provider tests | NOT TESTED — Phase 2 |
| SHIP-01/02 | Timeout lookup/reconcile; safe queued courier failure | Phase 2 adapter tests | NOT TESTED — Phase 2 |
| UX-01 | Android search RTL and mixed labels legible and scannable | browser screenshots + physical-device sign-off | PARTIAL — implemented/local evidence; full release gate pending |
| I18N-01 | Tablet FR→AR→EN mid-sale including retry retains all values | tests/e2e/business.spec.ts; sale-response-loss.json | PASS — local browser and database assertions |
| I18N-02 | Phone mid-product upload and receipt retains draft, commits 10PCS | tests/e2e/business.spec.ts; owner-product-receipt.json | PASS — local browser and database assertions |
| I18N-03 | Shared-tablet separate staff preferences/session | tests/e2e/business.spec.ts; browser-results.json | PASS — independent local browser sessions |
| I18N-04 | Shop guest full commerce locale preservation | Phase 2 only | NOT TESTED — Phase 2 |
| I18N-05 | Three-locale critical paths/accessibility/receipts reviewed | E2E + coverage + review record | PARTIAL — automated checks passed; qualified human and physical device review pending |
| I18N-06 | Exact OEM/SKU/VIN/barcodes, currency/date/unit arithmetic | format/unit/E2E; api-test-output.txt | PASS — local identifier/format/arithmetic assertions |

## Mandatory v1.3 image system

All image fixtures below are generated software-test pixels/textures, not company product photographs. Real company inventory, exact item photography, supplier grants and technical review have not been supplied. The stock-prioritized coverage screen exposes omissions; there is no claim of real pilot or worldwide coverage.

| ID | Requirement and implementation | Executed evidence | Release status |
|---|---|---|---|
| IMG-01 | Exact SKU + manufacturer part snapshots; duplicate cross-SKU dispute queue | IMG-EXACT-RIGHTS API case | PASS — local synthetic scope |
| IMG-02 | Independent side/axle/engine/equipment and fitment evidence checks | IMG-EXACT-RIGHTS, IMG-VARIANTS-COVERAGE | PASS — local synthetic scope |
| IMG-03 | Private authenticated media; separate usable_public_media projection | API anonymous/staff denial; public/internal rights assertions | PARTIAL — Shop/CDN is Phase 2 and untested |
| IMG-04 | Expiry/revocation and license version invalidate display and publication | API rights/variant cases | PASS — local source and license gates |
| IMG-05 | CSV/XLSX + ZIP exact mapping, row diagnostics, bounded processing and restart | image-batch-1000.json; image-bulk-browser.json | PASS — synthetic 1,000-row and browser retry scope |
| IMG-06 | Multi-angle staged upload, progress, request lookup and safe retry | image-browser.json; image-bulk-browser.json | PARTIAL — response loss passed; physical camera/Android still required |
| IMG-07 | Make/model/generation/year/market/engine/equipment/category filtering | IMG-VARIANTS-COVERAGE and exact variant API fixtures | PASS — synthetic evidence, real technical review pending |
| IMG-08 | AR/FR/EN galleries, alt text, identifiers, RTL, broken-image fallback | six gallery axe reports/screenshots; 10/10 complete browser suite | PARTIAL — emulation passed; actual device/linguistic review pending |
| IMG-09 | Private 320px thumbnails, lazy loading, at most six concurrent benchmark image reads | performance.json: 30 textures, combined list+thumbnail p95 647.90 ms ≤900 ms; all seven backend scenarios pass | PARTIAL — representative backend passed; physical device/network LCP remains untested |
| IMG-10 | Separate licensed diagram view, exact applicability and truthful unavailable state | IMG-VARIANTS-COVERAGE; vehicle gallery implementation | PASS — local synthetic gate; real provider coverage absent |

Media schema migrations 012–014 are additive; legacy bytes remain review-required until explicitly matched and converted. New media uses protected files. The restore drill includes rights, review/evidence and ingest checkpoint tables plus referenced private files. Current server storage retention does not automatically garbage-collect orphaned files.

## Performance and operations targets

Observed local load results are in [performance.json](evidence/performance.json); use its actual PASS/FAIL rather than older measurements. Transport is Fastify injection with real PostgreSQL, without network or target-device timing. Initial search and v1.3 load failures are retained. See [ACCEPTANCE_REPORT.md](ACCEPTANCE_REPORT.md) for the complete evidence register, recovery/import measurements, actual limitations and remaining gates.

Representative seed: 100,000 SKUs, 1,000,000 fitments, 10,000 variants, 3 warehouses. Record cold/warm runs, machine/network, duration, rates, indexes/plans, p50/p95/p99 and errors. Exact reference search p95≤500ms at 50rps (p99≤1.5s); compatible vehicle search p95≤900ms at 25rps; stock reads p95≤300ms at 50rps; distributed stock writes p95≤800ms at 20rps; dashboard p95≤1.5s. Main-screen LCP p75≤2.5s on agreed device/network. Record 100k import duration/max RSS/restart behavior. Pool saturation and hotspot contention must preserve integrity regardless of latency. None of these targets is passed by a small fixture smoke test.

Hosted availability≥99.9%, RPO≤15min and RTO≤2h require real monitoring and restore drills. Staging migration/rollback, encrypted off-host backups, alerting, privacy/legal review, target-device acceptance, qualified translation approval, physical count and signed company pilot are independent gates. Phase 1 cannot be declared complete while these release gates are untested.
