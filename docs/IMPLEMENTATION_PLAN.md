# Existing AutoParts Business work — v1.3 continuation

Updated 6 November 2026 (Europe/Istanbul). Same repository, same `codex/phase1` branch and authoritative PostgreSQL. This extends the existing plan/traceability; it is not a replacement project. User authorization covers local development and synthetic testing. Production/public deployment, real providers and paid licenses remain unapproved.

## Inspected checkpoint

Original base `faa238e`; preserved continuation checkpoint `1cce7b0`. Native PostgreSQL uses the isolated 55432 cluster, not the user's other databases. Local Business/API addresses remain 4173/4310. Both services were recovered without resetting existing records.

- Implemented: invited staff/MFA/RBAC; trilingual POS/catalog/inventory/procurement/admin; exact MAD tax snapshots; quotes/receipts; stock ledger, bins, reservations, returns/count approval; resumable product imports; supplier references and replacement chains; independently approved opening inventory; protected CSV exports; shared Phase 2 contracts.
- Latest core suite: **40/40 passed**, including v1.3 exact image rights, engine/equipment, diagrams, coverage, 1,000-image Excel/ZIP import and technical-attribute review. Expanded baseline browser suite passed **8/8** after fixing keyboard-focusable scrollable tables. A separate staged-image/gallery/RTL browser test passed; the combined ten-scenario suite is now being rerun after new bulk UI work.
- Technical attributes now persist, export/import and invalidate translation approval when changed. Versioned rights, private file storage, thumbnail galleries, approval/rejection/matching, legacy-upload conversion, exact vehicle filters, missing/disputed/low-resolution collection queues and CSV/XLSX+ZIP staged imports are implemented. Public media selection has a separate fail-closed SQL view; Shop is still Phase 2.
- The 1,000-image synthetic batch produced 900 staged assets, 50 duplicate results and 50 rejected rows; resumed across an API restart at row 500. Peak combined test-process RSS 302.4 MiB; no automatic approval or stock change. Real company coverage remains unavailable.
- Restore drill now includes 41 critical tables, license/review/import provenance and protected media files; file hashes and an authenticated restored thumbnail passed. Representative 100k-product/1m-fitment performance rerun is in progress with 30 generated texture images and bounded thumbnail reads.
- Interrupted bulk UI testing exposed stale retry state inside a sequential batch. The mutation helper now updates its pending-request reference immediately and prevents concurrent double submissions; the combined browser retest must verify this fix before claiming that workflow passed.
- Subsequent CSV/ZIP browser retry test passed (one write for the interrupted first row, one staged asset, one duplicate and two row errors). The first combined ten-test run had **6 pass, 2 fail, 2 not run**: French phone catalog buttons partly obscured by sticky navigation, plus a test selector that clicked before async search completed. Navigation scroll/focus spacing and exact-row test selection were corrected; a fresh combined run is required.
- The first v1.3 representative load run failed cold-search p99, variant search and dashboard targets; the failure is retained in `performance-v13-before-query-review.json`. Component query plans were captured. Dashboard aggregation now shares a single scoped balance summary, and migration 014 indexes only fitments awaiting review. Re-measure without concurrent browser tests before accepting performance.
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
