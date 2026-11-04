# AutoParts Business — Phase 1 product contract

Date: 2026-10-29. Source: owner-supplied AutoParts Morocco v1.2 blueprint. This is the implementation contract, not a release certificate.

## Scope and users

Build one private Business PWA for a shared counter tablet, owner smartphone, and warehouse desktop. Serve it from the same authoritative modular API and PostgreSQL inventory domain that the separate Shop frontend will eventually use. Phase 2 Shop is deliberately not launched. Public customers never inherit staff sessions or roles.

The owner creates a draft product, records permitted images and provenance, enters three localized names/descriptions, sets explicit piece/carton conversion, and activates internal sale. A warehouse operator receives actual units into a specified location. A salesperson searches exact or normalized identifiers, creates a quote/reservation, sells only available stock, and retrieves an authoritative receipt. Managers review counts and inspect returns. Auditors read immutable history. Buyers manage supplier purchases. Curators review variants and fitment evidence.

## Non-negotiable invariants

1. Every inventory quantity change commits with ledger, actor, document, idempotency record and audit/outbox evidence in one database transaction.
2. Available stock is sellable on hand minus reserved. Quarantined, damaged and incoming stock are excluded. No negative balance or over-reservation.
3. Retry after timeout returns the original result or an explicit unresolved state; it cannot create a second movement.
4. Language changes presentation only. AR is RTL; FR and EN are LTR. The top language selector remains available on login and all screen groups. Drafts, uploads, sessions, prices and quantities survive switching.
5. A verified fitment needs an exact variant, source/evidence and human reviewer. Demo models, OEM similarities and translated text do not establish compatibility.
6. Costs, staff records, supplier terms and precise locations stay behind staff authorization. Public publication is explicit, rights-gated and unimplemented in Phase 1.

## Information architecture

Login → role-aware Dashboard / POS / Catalog / Vehicles / Inventory / Purchases / Suppliers / Imports / Audit / Team. Each workflow uses the global top header and language selector. Phone navigation wraps/scrolls without hiding the selector; tablet POS gives search and cart side-by-side. Errors have stable codes and localized text. Identifier fields use bidirectional isolation.

## Data and output

Money is integral MAD minor units; quantities are integral pieces after explicit conversion. Timestamps are UTC at rest and Africa/Casablanca in the interface. Product translations include review state and visible fallback. Receipts are operational records and are not certified Moroccan accounting invoices. Initial records are explicitly synthetic. No workbook stock or compatibility is inferred.

## Scope order

Gate 0: traceability, architecture, threat model and source register. Gate 1: persisted authenticated product→receive→reserve→sell→return→audit loop in three languages. Gate 2: supporting modules and operations. Gate 3: automated concurrency/security/load/recovery and device/language evidence. Gates 4–5: explicitly approved staging, physical reconciliation, staff pilot, then separate production approval. A local implementation does not satisfy the pilot gate.

## Open company decisions

Company brand, actual warehouses/users/SKUs/counts, licensed suppliers, reviewed translations, tax rules, hosting/data location and budget remain owner inputs. None blocks isolated synthetic development. These inputs block real-data onboarding and production release. No paid account, real employee invitation, live integration or production deployment is authorized by this PRD.
