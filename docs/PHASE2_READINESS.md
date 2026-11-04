# Phase 2 — Shop boundary and readiness

Phase 1 implements Business only. `apps/shop` is an architectural seam, not a released storefront. No public checkout, live payments, courier accounts or customer records are created.

The future Shop must have its own build/deploy, routes, session cookie and customer identity. It may share safe types, validation, design tokens and a public-only i18n dictionary; it must not bundle staff translations containing private data or staff capabilities. The backend remains a modular monolith over the SAME authoritative inventory. Public product projection must explicitly select published rights-cleared fields, hide cost/supplier/bin/staff fields, and expose availability policy rather than unrestricted internal balances.

Reuse stock reserve/release/fulfill and immutable ledger semantics. Cart additions do not reserve by default. Checkout must lock primary stock with finite TTL and idempotency. Payment/shipping adapters must be separate interfaces with signature verification, deduplicated callbacks, reconciliation and outbox delivery. No provider may directly edit balances. Customer language changes cannot recreate orders/reservations or charges.

Before Phase 2 implementation, audit accepted Phase 1 code and pilot evidence. Add customer/consent/address/cart/order/payment/shipment models through additive migrations; create explicit publication state and multilingual safety review; add SEO routes/hreflang; develop sandbox providers; and run POS-versus-checkout last-piece tests. Guest product→cart→checkout→tracking locale tests and public/private field leakage checks become release gates. Current local tests do not validate these unbuilt flows.

Remaining external decisions: authorized catalogue and image redistribution rights; Moroccan selling terms/tax/accounting review; CNDP and hosting transfer assessment; PSP/courier contracts, sandbox credentials and fee approval; supported cities/COD policy; language review; and owner authorization for public release.
