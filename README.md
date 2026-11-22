# AutoParts Morocco — private Business, shared commerce backend

[Windows company setup and recovery](docs/WINDOWS_COMPANY_GUIDE_AR.md) · [Local Phase 1 acceptance, 22 November 2026](docs/LOCAL_PHASE1_2026-11-22.md)

Working local Phase 1 software based on the supplied v1.2 blueprint and v1.3 additions. **Development and acceptance testing are in progress; this is not a production release.** Phase 2 Shop has its own application boundary and public contracts, but is not launched.

Business: <http://127.0.0.1:4173/>. API: <http://127.0.0.1:4310/api/health>. Both bind locally. The synthetic demo is isolated from other PostgreSQL installations and from real company inventory.

Catalog reference imports, internally reviewed illustrations, and the initial real model-year sample are documented in the [catalog operator guide](docs/GLOBAL_CATALOG_GUIDE.md) and [requirement matrix](docs/GLOBAL_CATALOG_TRACEABILITY.md).

Use the top-bar search or Ctrl+K / Cmd+K to find parts, vehicles, suppliers and bins. The owner overview provides task shortcuts, and guided registration is in the catalog. See the [workspace guide and acceptance record](docs/WORKSPACE_ACCEPTANCE.md) and the [isolated HTTPS staging guide](docs/STAGING_PILOT.md).

## Start the local application on Windows

Requires Node 24 and PostgreSQL 18 binaries. This workstation has PostgreSQL at `D:/PostgreSQL/New folder/bin`. The setup script reads `.local/postgres-path.txt` when the isolated data directory has been moved to another drive.

```powershell
npm ci
npm run setup:local
npm run db:migrate
npm run db:seed
```

Run these in separate terminals:

```powershell
npm run dev:api
npm run build
npm run preview:business
```

Read `.local/DEMO-ACCESS.md` for the generated local demonstration credentials. Owner and manager require an authenticator code; `npm run demo:otp` displays the current **local demo** code. Never put credentials in commits, screenshots or chat. Accounts and stock are synthetic. Seeding an existing demo does not reset its transactions.

For editing with automatic reload use `npm run dev:business` instead of the preview. Browser acceptance uses the built preview, including its real service worker and content security policy. On this workstation, if the default temporary directory is inaccessible, set `TEMP` and `TMP` to `D:\dipoo\AutoPartsMorocco-local-20261104\tmp` in the terminal before running Node tools.

## Implemented workflows

- Always-visible Arabic, French and English controls; RTL; per-user language preferences; language changes preserve current drafts, images, carts and sessions. System dialogs have their own accessible language controls.
- Invited staff, scoped roles, privileged MFA, session locking, access revocation, immutable audit records and server-side authorization.
- Trilingual catalog, exact SKU/OEM/barcode search, manufacturer identity, translation review records, rights-checked sources, exact vehicle variants and evidence-based fitment review.
- v1.3 exact-reference image galleries, separate vehicle/diagram media, private thumbnails, versioned rights and explicit internal/public review. Revoked, expired or changed license terms stop previously approved display until reviewed again. Legacy uploads remain unapproved and can be matched/migrated through the review screen.
- Make → model → generation → production year/market → engine/equipment filtering, with exact variant selection before verified results. Separate diagram view states clearly when no licensed diagram is available.
- Photo collection report prioritizes stocked SKUs by recent sales and highlights missing, disputed and low-resolution photos. Multi-angle upload shows progress and resumes unknown outcomes without duplicate assets. CSV/Excel manifests plus ZIP photos are previewed, processed per row and recoverable by selecting the same files/license after reopening.
- Receipts in pieces or cartons, reservations, sales, warehouse and bin transfers, quarantined returns, inspection, counts with a different approver and ledger reconciliation.
- Suppliers, purchase orders, protected cost fields, printable quotations and receipts, exact MAD tax arithmetic and explicit unconfigured-tax state.
- Shared, pinned Moroccan timezone data for receipts and daily sales, including the September 2026 change. Stored instants stay UTC; receipt creation dates come from the saved sale. See [business timezone policy](docs/BUSINESS_TIMEZONE.md).
- Supplier references with concurrent-edit protection; source-reviewed replacement chains with cycle prevention and withdrawal. Replacement references do not establish vehicle compatibility.
- CSV/XLSX opening-count previews, a different authorized approver, and atomic opening ledger entries. Previous movements prevent an opening import. Up to 500 rows per counted file; quantities are pieces.
- A streamed trilingual product-master CSV export and locale-selected stock exports. Spreadsheet formula prefixes are escaped; import identifier columns as text in spreadsheet software to preserve leading zeros.
- CSV/XLSX preview and approval, separate localized columns, template mapping, durable 100,000-row imports with restart checkpoints and safe compensation. Claimed imported translation reviews require explicit catalog approval.
- Private responsive PWA shell. Offline stock writes are not queued. Lost-response recovery uses the authoritative request result before retrying an idempotent mutation.

## Verification

```powershell
npm run typecheck
npm run build
npm test
npm run test:e2e
npm audit
```

The API suite creates and drops its own isolated test database. Browser tests use the synthetic local demo and leave auditable demo transactions. Load and restore drills retain separately named local databases for inspection:

```powershell
node --env-file=.env --import=tsx scripts/performance.mts
node --env-file=.env --import=tsx scripts/import-benchmark.mts
node --env-file=.env --import=tsx scripts/restore-drill.mts
node --env-file=.env --import=tsx scripts/database-restart-drill.mts
```

For the five-minute pool-pressure drill, set `BENCHMARK_DATABASE` to the isolated `autoparts_load_...` database produced by the performance script, then run `node --env-file=.env --import=tsx scripts/pool-soak.mts`. The drill rejects unmarked or nonlocal databases. It sends 30 bursts of 100 simultaneous requests, checks duplicate receipt outcomes, bounded connections/memory, and full warehouse/bin reconciliation. It changes only synthetic stock in that separate load database. This bounded drill is not a multi-hour staging soak.

Observed evidence is in [docs/evidence](docs/evidence). Consult [acceptance status](docs/ACCEPTANCE_REPORT.md), [requirement traceability](docs/TRACEABILITY.md) and the [Arabic image-workflow guide](docs/BUSINESS_MEDIA_GUIDE_AR.md). Browser emulation does not substitute for testing the company's actual tablets, phones, scanners or screen readers. Authored translations have not been professionally approved. Tax settings and real opening stock require company review.

Run `node scripts/verify-evidence.mjs` to check that the saved source and evidence files still match their recorded hashes. This verifies artifact integrity; it does not rerun tests or turn an untested release gate into a pass.

## Application boundaries

`apps/business` is the private staff interface. `apps/api` is the authoritative backend. PostgreSQL stores the ledger, reservations, catalog and financial snapshots. `packages/i18n` is shared localization; `packages/contracts` defines public projection and future payment/shipping boundaries. `apps/shop` is reserved for the separate Phase 2 public application. It must never receive Business bundles or unrestricted product records.

Images are held under `MEDIA_STORAGE_DIR` (default `.local/media`), outside public static hosting. The API authorizes every request and strips EXIF/location metadata while generating WebP source/display/thumbnail variants. Back up this directory with the matching database snapshot; the restore drill verifies every referenced file. Photo ZIPs are limited to 64 MB compressed/256 MB expanded, 10,000 manifest rows, and 4 MB per photo. Keep SKU/manufacturer identifiers as text. New assets always require review; a photograph never creates a verified fitment record.

No production deployment, external provider connection, public publication or real-company import has been performed. Docker and CI definitions are supplied; running them in their target environments remains an acceptance task.
