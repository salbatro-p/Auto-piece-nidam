# SHARED ENGINEERING SPECIFICATION — V1 + V2
Version 1.0 | 2026-10-28 | Casablanca, Morocco

## Mandatory v1.1 architecture addendum
This document must be read together with `09_MANDATORY_TWO_APP_ARCHITECTURE_EN.md`. The private Business application has tablet POS and owner mobile interfaces; a separate public Shop storefront is introduced only in V2. Both must use one canonical inventory domain and DB; no dual-master stock or loose asynchronous stock synchronization. On conflict, the v1.1 addendum controls.

## Mandatory v1.2 internationalization addendum
Treat `10_MANDATORY_TRILINGUAL_LANGUAGE_SWITCHER_EN.md` as binding for both apps. Shared typed i18n/RTL packages and domain-localized names/descriptions; a permanently accessible **top-header AR/FR/EN selector** in Business (V1) and Shop (V2); instant safe locale change; per-user or guest preferences, no cross-user shared-tablet leakage; complete locale dictionaries, bidi isolation of OEM/barcode values, locale-safe MAD/PCS/date formatting and verified translated content. Locale must NEVER affect stock, pricing, fitment evidence or authorization. Implement and measure the contract for all three locales.

## A. Business scope and boundaries
**V1:** private employees-only multi-warehouse spare-parts operating platform, mobile and desktop. No public checkout. Company is legal owner of its inventory, prices and catalog rights. **V2:** public one-seller retail, possible B2B trades, logistics and payments. Future **V3 optional:** multi-vendor marketplace, contract/commission settlement and marketplace governance; don't pre-build the whole V3.

**Critical separation:** `automotive_catalog` defines vehicle/part identity and fitment; `inventory` defines actual quantity; `commerce` defines customer intent, price and payment; `integrations` define third-party delivery/source access. None may assume the others' correctness from a cached screen.

## B. Default reference stack and deployment
- Monorepo `apps/web-internal`, `apps/web-public` (introduced in V2), `apps/api`, `packages/domain`, `packages/ui`, `packages/shared-types`, `infrastructure`, `docs`, `tests`.
- TypeScript strict, Next.js React responsive PWA(s), NestJS REST/OpenAPI, PostgreSQL supported stable major pinned in lockfiles, database migration framework. Use reliable, maintained dependencies; select and document versions after a current compatibility check.
- PostgreSQL primary for transactional ledger, constraints, search trigram/full-text and catalog. Optional Redis for short-lived cache/queue if warranted; never the authoritative stock store. Job queue with durable progress and repeat-safe handlers; an in-Postgres queue is acceptable at launch if operationally simpler.
- Private object storage with signed upload access and content-type checks; authorized product media served via CDN only in V2. Local Docker Compose, staging and production separate credentials, migrations in CI/CD.
- TLS, network restrictions, secrets manager or equivalent, monitoring/structured JSON logs, OpenTelemetry-compatible traces, error-alert routing, encrypted backups, automated restore tests.
- Plan hosting region and processors only after CNDP privacy/transfer assessment for any employee/customer personal data. Evaluate data processing agreements and sub-processors.

## C. Core data dictionary / table groups
Every primary entity gets a surrogate ID, created/updated timestamps, version/soft deletion when appropriate; identifiers constrained by company and warehouse, and all locale/timezone assumptions documented. All money uses exact decimal or integral minor units (avoid floats). IDs need not leak sensitive sequential information publicly.

### Staff and tenant organization
`organizations(org_id, name, ...)`, `branches`, `warehouses(warehouse_id,branch_id,...)`, `storage_bins(warehouse_id, aisle, shelf, rack)`, `staff_users`, `roles`, `permissions`, `role_grants`, `sessions`, `mfa_factors`, `audit_events(actor_id, action, object_type, object_id, before_after_redacted, timestamp, correlation_id)`.
V1 supports ONE organization, with proper organization ID boundary to avoid painful future expansion. Distinguish staff access and V2 public customers; do not let public roles inherit staff capabilities.

### Vehicles
`makes`, `models(make_id)`, `generations(model_id, platform, start_year,end_year)`, `engine_specs(engine_code, displacement, fuel, power, engine_family)`, `vehicle_variants(generation_id, engine_id, body, gearbox, drive, market, production_from, production_to, equipment, manufacturer_variant_ref)`, `vehicle_identifiers(source, external_id, variant_id)`, `vehicle_aliases(locale, alias, reviewed)`. Store year ranges inclusive/exclusive consistently, variants market-specific, nullable unknown engines not silently equivalent to any engine.

### Parts, identifiers and evidence
`categories(parent_id, ...)`, `brands`, `products(product_id,brand_id,manufacturer_part_number,category_id,normalized_specs)`, `sellable_skus(sku_id,product_id,organization_id,pack_units,unit,active)`, `product_identifiers(product_id,type,raw_value,normalized_value,issuer,source_id)`, `product_media(product_id,storage_ref,usage_license)`, `suppliers`, `supplier_items(supplier_id,product_id,ref,price,lead_time)`, `part_substitutions(from_part,to_part,substitution_type,qualifiers,evidence)`.
Part identity must not collapse genuine manufacturer-brand differences merely because OEM references match. Store superseded and cross-referenced numbers as relationships, not as unconditional equivalence.
`fitments(fitment_id, product_id, vehicle_variant_id, axle, position, side, equipment_conditions, date_or_vin_constraints, status, reviewed_by, last_verified_at)`, `fitment_evidence(fitment_id, source_record_id, excerpt, access_type, rights, source_date, evidence_attachment_hash)`. Enforce status workflow (UNRESEARCHED, SOURCE_CLAIMED, REVIEW_REQUIRED, VERIFIED, CONFLICTED, REJECTED). Verified states require reviewer and evidence. No user-visible definitive recommendation if fitment is unverified.

### Authoritative inventory
`inventory_balances(org_id,sku_id,warehouse_id,bin_id,condition,on_hand,reserved,version)` with CHECK `on_hand >= 0`, `reserved >= 0` and `reserved <= on_hand` for sellable inventory; condition such as SELLABLE/QUARANTINE/DAMAGED/RETURNED.
`stock_movements(movement_id,doc_id,sku_id,from_bin,to_bin,qty_delta,condition,kind,actor_id,occurred_at,idempotency_key)` append-only; `stock_reservations(reservation_id,sku_id,warehouse_id,qty,expires_at,source_order_id,status,idempotency_key)`, `stock_counts`/`count_lines`, `stock_adjustments` and approvals, `inventory_transfer_orders`. Use explicit unit conversion and avoid fractional pieces where SKU counts are discrete. `purchase_orders`, `po_lines`, `goods_receipts`, `sales_orders`, `sales_order_lines`, `returns`, `return_inspections`, `supplier_credit_notes` as needed.

**Invariant 1:** Every committed quantity change is one atomic transaction containing both ledger entry and balance change. Never trust client-sent `new_stock`.
**Invariant 2:** `available = on_hand(SELLABLE) - reserved`; quarantined, damaged and unreceived PO goods do not contribute.
**Invariant 3:** Protected reservation operation uses atomic conditional update (e.g. `UPDATE ... SET reserved=reserved+quantity WHERE on_hand-reserved >= quantity RETURNING ...`) plus same-transaction reservation and unique idempotency record. Use row locking as appropriate. Multi-SKU updates acquire locks in deterministic sorted order to avoid deadlock; retry only transient DB errors with bounded backoff.
**Invariant 4:** Confirmed sale or shipment consumes reservation *exactly once*, adjusts on-hand and reserved; on cancel/expiry release reservation once; returns increase stock only after physical receipt and inspection. Never issue a silent negative-stock override.
**Invariant 5:** Corrections are compensating records with reason, approver, linkage. Direct deletion/editing of posted movements is forbidden. Reconciliation jobs compare balance projection to movement ledger, alerting on any mismatch.
**Invariant 6:** Unique foreign reference + company + idempotency key prevent duplicate import, receipt, order, refund, webhook and integration side effects.

### V2 customer/finance/fulfillment
`customers`, `customer_vehicles`, `addresses`, `carts`, `cart_lines`, `price_lists`, `promotions`, `orders`, `order_lines(price_and_tax_snapshot)`, `payment_intents`, `payment_events`, `refunds`, `shipments`, `shipment_packages`, `carrier_tracking_events`, `returns`, `cod_settlements`, `outbox_events`, `external_provider_mapping`.
Do not copy payment card data into any owned table. Only store PSP tokens, state, masked payment method references where permitted. Customer addresses/phone are PII; policy-controlled retention and access.

## D. V1 screens and jobs-to-be-done
1. **Secure login / staff invite / personal profile:** role, language, branch access, session and MFA. Admin invitation cannot be self-registered.
2. **Dashboard:** low stock, unavailable, pending purchases, latest sales, reservations, review queue, trends clearly marked if insufficient data.
3. **Universal search:** ref/OEM/SKU/barcode/vehicle selectors; keyboard wedge or phone camera; robust normalized full/partial lookup; show why match occurred.
4. **Vehicle explorer:** make > model > generation > years > engine > trim > compatible-verified products; unknown engine triggers warning, not false match.
5. **Product detail:** brand, photos/license, specs, stock by branch/bin, available/reserved/quarantine, cost only with privileges, verified fitment, substitutes, ledger history and supplier info.
6. **Receiving:** create PO, receive discrepancies, scan and confirm quantity/bin, duplicate-detection and attached supplier document.
7. **Sell/quote/reserve:** quote, confirm SKU + availability, atomic reserve, complete sale, cancel and release, print/export document; do not allow oversell.
8. **Stock transfer / cycle count / returns:** scan and move, freeze/count policy, approvals, inspection status and compensating history.
9. **Suppliers and reports:** lead times, supplier part numbers, import/export, reorder decisions, errors and stock accuracy.
10. **Catalog curator and admin:** source records, review queue, fitment evidence, field-level corrections, audit export, staff permission matrix.

## E. V2 public screens and features
Landing page, mobile category browse, vehicle selector/My Garage, search suggestions, automotive filters, product listing/details with verified fitment and source restrictions, wishlists (optional), basket, secure checkout, COD/e-payment, order tracking, returns/refunds, B2B garage accounts, promotions, customer service, content/legal pages. Build professional error and zero-results states. Staff stays in a separate protected interface and API permission boundary.

## F. API contract examples (to refine as OpenAPI before coding)
- `POST /auth/login`, `POST /staff/invitations`, `GET /me`;
- `GET /vehicles/makes`, `GET /vehicles/models?make_id`, `GET /vehicles/variants?model_id&year&engine`, `GET /parts/search?q&vehicle_variant_id&fitment_status`, `GET /parts/{sku_id}`;
- `GET /warehouses/{id}/stock?sku_id`, `POST /inventory/receipts`, `POST /inventory/reservations`, `POST /inventory/reservations/{id}/release`, `POST /inventory/transfers`, `POST /inventory/counts`, `POST /sales/orders`;
- `POST /imports/validate`, `POST /imports/commit`, `GET /imports/{job_id}/report`, `GET /audit/events`;
- V2: `GET /shop/products`, `POST /cart/lines`, `POST /checkout`, `POST /payments/{provider}/webhook`, `POST /shipping/{provider}/webhook`, `GET /orders/{public_id}`.
Every write request: validated input, ownership permission, idempotency key, immutable audit, consistent response status; writes should be documented with error codes `INSUFFICIENT_STOCK`, `UNKNOWN_VARIANT`, `FITMENT_UNVERIFIED`, `DUPLICATE_REQUEST`, etc. Webhook endpoints require signatures/replay prevention and must be throttled appropriately.

## G. System integration pattern
- Inside the monolith use explicit modules/interfaces: Auth, Catalog, Fitment, Inventory, Procurement, Company Sales, Reporting, Public Commerce, Payments, Shipping, Import, Admin.
- Use one transaction for internal consistency, **transactional outbox** for async side effects. Process workers with idempotent handlers, retry queue and dead-letter state; track every replay.
- External APIs: adapters with per-provider credentials in secrets, minimal scoped permissions, timeout, bounded retry, circuit breaker and queue fallback.
- Use event types `StockReceived`, `ReservationPlaced`, `ReservationReleased`, `SaleConfirmed`, `OrderPlaced`, `PaymentVerified`, `ShipmentCreated`, `ReturnAccepted`, `CatalogPublished`. State transitions must be defined and tested. Never call a remote provider while holding a DB inventory lock.
- For cache/index invalidation, asynchronous public read models may be stale, but checkout must always check transactional primary for available stock and final price.

## H. Navigation / visual design requirements
- Original modern design language: neutral surfaces, brand-accent color configurable, generous yet data-dense list controls; no copying site assets.
- `Dashboard | Search | Vehicles | Parts | Inventory | Purchases | Sales | Suppliers | Reports | Admin` for V1; compact bottom tabs/mobile fast actions for stock search and receiving.
- Search bar omnipresent; barcode scanner handoff; keyboard-first SKU entry; saved recent searches; correct AR RTL inside product ref LTR spans; French UX suited to Morocco but changeable per employee.
- WCAG-conscious contrast, touch target size, focus states, screen-reader labels, loading/skeleton/empty/error states, resilient low-bandwidth retries with explicit outcome; offline mode is READ-ONLY/draft until consistent conflict-safe queue is separately implemented.
- Release via staged PWA install; native app not required to satisfy V1/V2 core scope.

## I. Data import / provenance design
Canonical read path: source registry -> raw authorized snapshot (hash + timestamp) -> staging -> schema/type/license validation -> identifier normalization -> duplicate and conflict matching -> human review -> staged diff & dry run -> approved commit -> audit and error report. Split vehicle metadata imports from verified fitment. Preserve old references and code changes. Large imports use chunking, resume/cancel, memory bounds, rate limits, batch upserts and metrics. No destructive full refresh or silent overwrite.

## J. Legal, data and operation boundaries
- Morocco CNDP 09-08 and cross-border transfer analysis; verify data processing notice/consent requirements, providers, retention and backup location. Assess country of hosting and third-party AI/transcription/logging processors.
- Prior to public V2, review Moroccan consumer law 31-08, clear selling terms, returns/withdrawal exceptions, warranty, tax invoice details, product safety and regulated items with local qualified counsel/accountant.
- Copyright and terms: only supplier/OE/TecDoc data licensed for the intended use and redistribution. No site-wide unscrupulous scraping or automatic republishing. Provenance for every publication.
- Privacy by design: do not collect VIN, plate or full phone/contact information when not necessary; apply retention policies and access logs.
