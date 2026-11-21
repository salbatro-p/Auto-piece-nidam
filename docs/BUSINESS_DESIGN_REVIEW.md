# Business workspace design review

This iteration starts at `ab36038` on the official main branch. The captures below use the built Business app from `1704501`, Chromium and a newly seeded, isolated PostgreSQL database. All catalog records in these captures are synthetic. The reproducible checks and final run are linked from [pull request 9](https://github.com/salbatro-p/Auto-piece-nidam/pull/9).

## Visual evidence

| Workflow | Captures |
| --- | --- |
| Owner on a 390 × 844 phone | [العربية](evidence/atelier/phone-ar.png) · [Français](evidence/atelier/phone-fr.png) · [English](evidence/atelier/phone-en.png) |
| Owner at the counter | [1024 px](evidence/atelier/dashboard-1024.png) · [1280 px](evidence/atelier/dashboard-1280.png) · [1536 px](evidence/atelier/dashboard-1536.png) |
| Inspect an exact search result | [Catalog on tablet](evidence/atelier/catalog-1024.png) · [Part details](evidence/atelier/part-1024.png) |
| Inspect media and rights | [320 px gallery](evidence/atelier/gallery-320.png) · [French photo intake with a local test file](evidence/atelier/media-intake-fr.png) |
| Earlier dashboard | [Previous main, 1280 px full-page capture](evidence/atelier/before-dashboard-en.png) |

## Software engineering

**Verified.** The changes use the current catalog responses and authorization checks. UI state still owns the active search, cart and draft. The new visual path exercises keyboard focus, both catalog layouts, the current SKU, three languages and the jump from a product to its compatibility evidence. All test data lives outside the company's inventory. API integration covers loss of a sale response, concurrent inventory operations, role and warehouse boundaries, MFA, and media rights.

**Review.** The theme introduces shared surface, type, spacing, radius and depth values. The build reports an increase from 151.18 to 152.08 kB of compressed entry JavaScript and from 14.42 to 16.32 kB of compressed CSS. The additional stylesheet still participates in an older cascade. Navigation and modal changes deserve screenshot coverage when shared styles change. The build retains its existing warning about the entry chunk exceeding 500 kB before compression.

## Counter and warehouse operations

**Verified.** Search and creation are the first catalog actions. The table remains the default for scanning many rows. Exact results place the part name, SKU, available stock and MAD price alongside their image state. Opening a part brings available, reserved and physical stock together before longer reference sections. A worker can jump directly to the photo gallery or vehicle compatibility. Staff see the tools available to their role.

**Trade-off.** Photo administration and export take one disclosure action from the catalog. The dashboard still links directly to photo collection. A single-column phone catalog favors identifying each part and requires more scrolling through broad searches. Time saved during a real shift and staff preference require observation in a shop.

## Interaction and accessibility

**Verified.** The language control stays at the top and follows the current dialog. The 320 px check follows the active product through all three languages and both evidence shortcuts. The captured gallery shows its heading and add-photo control below the language bar. The full regression also checks retained uploads and sale drafts, role isolation, keyboard behavior, offline reauthentication and automated accessibility findings.

**Corrections from inspection.** A contrast failure exposed stock units with a fixed gray foreground on colored badges. The units now inherit their status color. A tablet screenshot exposed a price breaking inside the decimal amount. The table keeps its price together. The single-result card now groups identity on the information side of the card. Horizontal scrolling remains appropriate inside operational tables on narrow screens.

## Artistic direction

**Observed.** The owner dashboard uses an ivory canvas, sand navigation and one champagne search area. A custom brake rotor illustration gives the dashboard a recognizable automotive subject. A pleated filter symbol indicates the category in an empty photo slot. Labels distinguish a category graphic from an approved image. Color remains available for stock and review status. The Arabic composition mirrors the navigation and the placement of the illustration.

**Judgment.** The owner screen has a clearer visual identity while keeping search and stock legible. The detail view is more restrained so that workers can read or copy a reference quickly. The underlying UI still uses some legacy accent colors in specialist forms. Hardware glare, camera handling, physical tablet ergonomics and customer preference need device and shop trials. These captures do not establish a national ranking.

## Reproduction and recovery

Use a disposable local database, its own media directory and the synthetic test configuration in the repository workflow. Run `npm run typecheck`, `npm run build`, `npm test` and `npm run test:e2e`. The added test is `tests/e2e/atelier.spec.ts`. The hosted workflow retains the detailed browser report, accessibility JSON and screenshots in the acceptance artifact.

To roll back this iteration, revert the merged pull request on a branch, rerun the same checks, and rebuild the Business frontend. This iteration adds no database migration.
