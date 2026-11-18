# AutoParts Business workspace delivery

19 November 2026. Existing project on the official repository. The baseline is `0f9508c`. The design follows the owner's screenshot for the order of global search, three destinations and priority actions. The [benchmark](WORKSPACE_BENCHMARK.md) documents the official material studied and the design choices.

## What staff can do

- **Owner.** Open Overview on a phone, see actual stock and today's sales, then open missing photographs or counts awaiting review directly from the attention panel. Purchases, supplier activity and permissions remain on their own screens.
- **Counter.** Use top-bar Search or Ctrl+K / Cmd+K, then type or scan SKU, OEM or barcode. Exact identifier results are separate from related text. Opening a part displays scoped quantities, recorded shelves and compatibility evidence. Use **Find in counter sale**, add the item, then confirm. The same in-session cart remains available across search, vehicle browsing and navigation. Existing sale retry and receipt rules still apply.
- **Warehouse.** Start in Inventory. Search shelves by code or open **Shelf locations** for a known part. The locator groups physical quantities by warehouse and records quarantine and damage separately. The stock receipt, counts, returns and bin transfer screens use their existing backend and approval rules.
- **Catalog.** Open **Guided product registration** in Catalog. Work through identity, technical specifications, photos, references, stock handoff and review. An exact identifier warning lists existing SKUs. Resume text fields from the same browser session. The photo selection survives language switching while the form is open. Select the file again after a reload. Choosing stock intake preselects the newly saved product in a separate receipt review.
- **Vehicles.** Use Catalog's exact vehicle selector and category filter, or find an exact variant via workspace search. Open the fitment evidence on a part. Original category visuals retain their labels and exact-product photos keep their priority.

The source boundary stays private. The existing six vPIC records are real US model-year observations. Real company products, exact photos and verified fitment coverage still depend on the authorized inputs in the [catalog delivery](GLOBAL_CATALOG_DELIVERY.md).

## Release gates

| Gate | Result | Executed evidence and limitation |
|---|---|---|
| SAFE-01 | PASS | Verified Git clone from the bundle, isolated restore of 49 tables and sequence values, 2,844 preserved media files, and saved configuration. Live hashes matched. |
| UX-01 | PASS | Role-filtered groups, direct search from the header, and every retained navigation route exercised in the browser suite. |
| UX-02 | PASS | Three scripted lookup interactions from Overview, then two sale actions from known stock. Receipt and lost-response retry verified. |
| UX-03 | PASS | 320 px, 390 px and tablet Chromium checks. Owner stock, attention and task shortcuts visible. |
| UX-04 | PASS | Shelf lookup, receipt handoff, guided intake, carton receipt and warehouse scope exercised. Exact shelf geometry is unavailable. |
| UX-05 | PASS | Shared workspace tokens and existing field, button, table, modal, status and notification components. Light mode tested. Dark mode NOT TESTED. |
| UX-06 | PASS | Loading, empty, warning, validation, retry and stock confirmation states checked. Candidate failure details are recorded in the evidence. |
| UX-07 | PASS | AR/FR/EN compilation, layout direction, translated dialogs and retained POS/intake drafts. Professional automotive terminology approval remains NOT TESTED. |
| UX-08 | PASS | Chromium axe checks, keyboard command, modal focus, 320 px reflow and reduced-motion mode. Physical assistive technology remains NOT TESTED. |
| UX-09 | PASS | Search, part inspection, shelf locator, guided intake and owner attention were executed through the application. |
| UX-10 | PASS | Legacy catalog, POS, media, imports and stock regression executed on isolated data. |
| INV-01 | PASS | Receipt once, sale retry once, validation, reservations and concurrent inventory regression. |
| SEC-01 | PASS | Anonymous search denied, supplier and identifier routes permission-gated, warehouse scope obeyed, and prior auth/MFA regression passed. |
| PERF-01 | PASS | Before/after Chromium observation. The lookup is slightly slower and retains the same three interactions from Overview. Two sale actions met the target. See actual timings in evidence. |
| DATA-01 | PASS | Real model-year references and synthetic inventory remain identified separately. No extra real records or fitment claims added. |
| OPS-01 | PASS | Built using the existing Windows setup and installed the tested build on the local preview. Backend health and protected endpoints checked. |
| STAGE-01 | BLOCKED | Isolated HTTPS compose and gateway settings statically validated. Host, DNS, approval and on-host runtime verification are pending. |
| REG-01 | PASS | Core/API regression and final browser rerun recorded in the evidence. |

## Evidence and caveats

The [machine-readable results](evidence/workspace-delivery.json) record the exact timing samples, source revision, preservation and test counts. Tests used isolated PostgreSQL and media copies on Windows with Chromium. Device dimensions and reduced motion were emulated. There were no staff usability sessions, real device scans, physical printer tests or satisfaction scores. Running the measurement script produces repeatable evidence. The double-click and interrupted-response cases are covered in the existing API and browser suites.

Representative views from the same scripted tasks:

| Screen | Before | After |
|---|---|---|
| Owner phone | [Screenshot](evidence/screenshots/workspace-before-phone-overview.png) | [Screenshot](evidence/screenshots/workspace-after-phone-overview.png) |
| Owner tablet | [Screenshot](evidence/screenshots/workspace-before-tablet-overview.png) | [Screenshot](evidence/screenshots/workspace-after-tablet-overview.png) |
| Part details | [Screenshot](evidence/screenshots/workspace-before-tablet-part.png) | [Screenshot](evidence/screenshots/workspace-after-tablet-part.png) |
| Tablet POS | [Screenshot](evidence/screenshots/workspace-before-tablet-pos.png) | [Screenshot](evidence/screenshots/workspace-after-tablet-pos.png) |

## Recovery and access

The update uses the existing schema. Roll back application behavior by serving the verified prior build from the protected checkpoint or rebuilding `0f9508c` in an isolated copy, then restarting the API and preview with the saved environment. Keep database and media recovery separate and verified before any switch. The database dump and private files stay in the protected local backup.

On this workstation, open the [local preview](http://127.0.0.1:4173/) and sign in as `owner@demo.local` using the existing local access guide. Phone and tablet users away from the workstation need the approved HTTPS staging URL. Follow the [staging runbook](STAGING_PILOT.md) once the host and deployment have been approved.
