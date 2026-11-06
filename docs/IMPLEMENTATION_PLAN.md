# Existing AutoParts Business work — v1.3 continuation

Updated 6 November 2026 (Europe/Istanbul). Same repository, same `codex/phase1` branch and authoritative PostgreSQL. This extends the existing plan/traceability; it is not a replacement project. User authorization covers local development and synthetic testing. Production/public deployment, real providers and paid licenses remain unapproved.

## Inspected checkpoint

Base commit `faa238e` plus preserved uncommitted implementation. Native PostgreSQL uses the isolated 55432 cluster, not the user's other databases. Local Business/API addresses remain 4173/4310. Service health must be rechecked after the usage interruption before tests resume.

- Implemented: invited staff/MFA/RBAC; trilingual POS/catalog/inventory/procurement/admin; exact MAD tax snapshots; quotes/receipts; stock ledger, bins, reservations, returns/count approval; resumable product imports; supplier references and replacement chains; independently approved opening inventory; protected CSV exports; shared Phase 2 contracts.
- Latest recorded core suite: 36/36 passed. Earlier complete browser run: 8/8 passed on the built app. Expanded 54-screen accessibility run subsequently failed on six phone purchase/audit combinations because scrollable tables lacked keyboard focus; this remains a real outstanding issue, not a pass.
- New technical-attribute editor/model is in progress; it typechecks, but persistence/review regression tests remain to be added. Existing performance/import/recovery reports are retained with their original execution dates.
- Report/manifest must be regenerated only after current verification; the existing generated acceptance report is a snapshot, not current proof for untested changes.

## v1.3 source comparison

Read the supplied resume document and new image addendum. Compared every archive entry to v1.2. Files 01–06, 08–09 and the start guide add image-specific obligations; the existing three-language addendum is unchanged. The supplied workbook is unchanged and does not supply actual company products/photos/fitment. Originals are preserved in `blueprint/AutoParts_Work_Handoff_v1.3` beside v1.2.

## Implementation order and impact

1. **Stabilize checkpoint.** Preserve a Git checkpoint including explicit known failures. Fix keyboard focus on scrollable tables, finish technical-attribute review/export behavior, run current core and browser regressions. No resetting seed data.
2. **Media authority and storage.** Add rights/license lifecycle, exact SKU/manufacturer snapshots, media kind/state, versioned human review, immutable provenance and separate fitment evidence. Retain legacy uploads as review-required; migrate bytes into private bounded object/file storage with thumbnails/display derivatives. Never silently approve existing images.
3. **Exact vehicle browsing.** Add make/model/generation/year/market/engine/category filters against existing variants. Verified filtering must consult evidence and source rights; similar photos never establish fitment. Add localized galleries, zoom, manufacturer references and broken/missing states. Diagrams are separate and show unavailable unless rights and exact applicability are approved.
4. **Photo collection and bulk ingestion.** Owner/staff multi-angle camera/file upload with progress, idempotent resume and exact-reference validation. ZIP plus CSV/XLSX manifests are staged with checksum deduplication, per-row errors and ambiguous-reference review. License and photo approval remain separate from stock. Build missing/disputed/poor-quality queues and itemized pilot coverage.
5. **v1.3 acceptance.** Implement IMG-01–10 tests, including 1,000 synthetic photo rows, malformed/duplicate/mismatched files, expiry/revocation, cross-tenant/public denial, equipment variants, language changes during upload and gallery accessibility. Measure list/thumbnail behavior alongside existing representative search and stock tests. Preserve failures and corrective evidence.
6. **Remaining Phase 1 and handoff.** Reconcile full v1.2/v1.3 traceability, finish local business workflow gaps, run recovery and security checks appropriate to changed domains, update runnable setup/OpenAPI/architecture/operations and evidence. Do not mark Phase 1 complete while release gates remain unmet.

## External release gates and approvals

Continue locally with clearly labeled synthetic photos/vehicles. Actual exact-product photo coverage requires company originals or authorized supplier images and license evidence. Real fitment requires source-backed technical review. Qualified AR/FR/EN review, physical tablet/Android/scanner/screen-reader acceptance, accounting/privacy review, real opening counts and approved staging/hosting are still required. No paid account or production deployment is authorized.

No extra user action is required for the current local implementation. Work can continue while this chat's execution is active and tools/credits permit; no unattended wakeup or credit-replenishment monitor has been configured or promised.
