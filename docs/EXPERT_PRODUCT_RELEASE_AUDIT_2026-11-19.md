# AutoParts Morocco — Independent engineering, operational UX and art-direction audit
**Date:** 19 November 2026. **Inspected baseline:** main at `fadeb478d6958d0f5495eb0fc409922be93999a9` after merged PR #4 and #5. **New candidate:** PR #6 (part-photo shortcut).  
**Evidence:** repository implementation; official CI run #44450185183 on main **success**; actual Playwright screenshots `docs/evidence/screenshots/gallery-tablet-en.png`, `upload-retry-ar.png`, `phone-product-draft-ar.png` from run #44448945865. No live external hosting or physical staff tests. This is an audit of a demo/pilot, **not a production certification**.

## Executive verdict: visible progress, but not yet 'Top 1'
The product has a real private operational architecture and increasingly coherent visual direction, but the decisive competitive gap is still **trusted real automotive data, physical workflows and verified merchant deployment**, not the number of gradients or fancy charts. A claim of global leading design requires outcome evidence and competitor task testing; none is available yet.

### Critical truth constraints
- Current database coverage and images in evidence are **synthetic/demo**. The global catalog report indicates six official Honda model-year records and **zero real verified part fitment relationships**; new licensed supplier image count **zero**. Do not treat fixture photos as company stock.
- A Github code repository and `127.0.0.1:4173` are not an externally accessible commerce app. Staging `docs/STAGING_PILOT.md` is still **blocked** until an approved host, domain/DNS and secure credentials are available.
- AR, FR and EN UI support is implemented, but no professional Moroccan dialect/technical linguistic sign-off has occurred.
- Automated accessibility/browser screenshots cannot replace real barcode-scanner, Android/iOS tablet, printer, warehouse and staff testing.

## 1. Principal software-engineering review
**Verified positives:** TypeScript React frontend, separate API, PostgreSQL as inventory authority, permissions, MFA, transaction/idempotency tests and persistent media rights workflow. Current main push CI succeeded after photo-intake merge (#44450185183), and previous PR #5 head passed. No source or database edits were made to company records in this review.

**Risks to close:**
1. Four interdependent style sheets (`styles.css`, `refinements.css`, `workspace.css`, `premium.css`) plus many literal colors create specificity drift, make UI regressions expensive and hinder component ownership. Migrate one component family per PR into semantic tokens, keeping screenshots and CSS diff tests. Do not mass-rewrite CSS without a rollback plan.
2. Client product state may be stale after approved media upload/review: `ProductVisual` derives from decorated `mediaId` while the gallery separately reloads. Verify product hero refresh after media approval rather than concluding that thumbnail status updates live.
3. The product-details modal contains many modules (shelf, gallery, replacements, suppliers, attributes, transactions, fitments). Load expensive panels only when expanded and measure real latency; avoid hiding critical stock and confidence.
4. Regression gates must include sale idempotency after response loss, stock concurrency, upload retries, MFA, staff permission scoping, bidi identifiers and the global search. No test expectation should be weakened to make CI green.
5. Avoid shipping staging artifacts or secrets into public GitHub. Conduct secret/history and image-license checks before production.
6. Make diagnostics explicit: release commit, database/schema version, media object store health, and backup verification timestamp. Do not expose private diagnostics to cashier role.

## 2. Operations & information architecture review
**Observed positives:** Role-adaptive nav, SKU/OEM barcode search, compact vs visual overview, guided intake, inventory/sales workstreams, rights-aware gallery, per-role controls.
**Priority gaps:**
- For counter sale, optimize the sequence `scan/search → exact identity → verify fitment if relevant → location and stock → quantity → price → checkout`. Any decorative elements should not distract from stock or sale confirmation.
- For owner, show exceptions and decisions above vanity KPI cards: negative-stock alerts, unverified SKU, pending supplier intake, count approvals, stale media.
- For warehouse, photo capture must remain integrated with SKU confirmation, barcode and bin location, but uploading media must never directly increment quantities.
- Add a one-step gallery jump from part identity (PR #6) while retaining explicit warning that an image alone is **not** fitment evidence.
- Add explicit evidence trails for substitutions, OEM cross-references and engine market variants; do not auto-approve equivalents based on visual resemblance.
- On checkout and stock posting, measure completed tasks and retries, not just endpoint speed.

## 3. Visual design & artistic direction review (actual screenshots)
**Observed:** Deep navy navigation with a lighter content plane is more coherent than the earlier plain white dashboard. Teal highlights provide practical visual emphasis; compact globe language chooser is much better balanced than the previous triple language bar.
**Observed visual shortcomings:**
1. `gallery-tablet-en.png`: the modal occupies most of a 1280×863 viewport, with many compact text labels and a large informational stack. The primary product image/placeholder can be mistaken for the main visual object while lower stock/media actions are below fold. Keep hero informational, use progressive disclosure and one-step gallery access.
2. `upload-retry-ar.png`: photo preview is useful and literal, but uploader contains multiple dense blocks and long Arabic explanatory text; some text appears small and the modal scroll continues below the viewport. Elevate capture action, preview and status; keep license information available without burying the practical task.
3. Technical SKU combines Arabic/Latin/digits. Use isolated LTR identifiers and copy affordances without breaking text or copy order. Keep exact value in clipboard.
4. Decorative category imagery must be visibly generic. Exact product photo needs a license, approved media record and explicit SKU/manufacturer matching. No near-copy AI brand visuals.
5. Body 11–12px and captions are too small for stressed counter work or warehouse lighting. Target practical readability on target tablets, not merely AA minimum pass.
6. High-contrast verification is especially important on light blue/gray subtitles and tertiary actions; run WCAG checks on open dialogs and camera/photo flows.
7. Every modal should preserve usable content scrolling, one obvious primary action, focus escape/return, and no accidental off-screen buttons at 320/390px.

**Art direction recommendation:** technical editorial precision, real photographed product details, clean neutral surfaces with restrained warm accents, product-specific material cues, readable automotive identifiers. Avoid fake 3D parts, redundant cards, novelty animations and rainbow UI components.

## 4. Photos, licensing, fitment and automotive data trust
**Confirmed implementation:** Product photography upload now previews actual selected bytes locally before upload; metadata/provenance, licenses and review gates exist. No paid source rights magically appear from a screenshot.
**Release blockers:** representative real company SKU export; at least 3 original owned images of one SKU showing part face, reference/label and connector or mounting side; company owner approval of rights; supplier license for external feeds; independently sourced engine/year/market fitment evidence and review. Keep `verified`, `unknown` and `needs review` separate.

## 5. Security/reliability review
The API's `catalog.ts` only returns purchase cost to roles with `costs` permission, and the product image choice uses `usable_internal_media` for primary photos. Still validate access control independently for catalog/media endpoints and ensure no secrets leak via photos/EXIF, API errors, localStorage, screenshots or exported reports. Keep owner MFA and audit logs. Rehearse isolated restore with matching app/schema/media versions.

## 6. Ranked next acceptance gates
| Rank | Acceptance gate | Observable pass |
|---|---|---|
| P0 | User can inspect exact owned SKU photograph, identifier and rights state in Business | Photo captured on real target device, linked to correct SKU, reviewed and displayed; image alone not fitment proof |
| P0 | Critical counter transaction stays correct | 2 real staff roles complete SKU→sale and receipt/intake on actual shop hardware without lost or duplicate transactions |
| P0 | Approved private HTTPS staging | Dedicated host + DNS + isolated DB/media, MFA, TLS, gateway and owner approval; real external device access tested |
| P0 | Real fitment provenance | At least one manufacturer/engine/market combination with source/evidence, reviewed; unknown variants never promoted |
| P1 | Product details hierarchy | Photo gallery reachable directly from hero; focused and scrolled into view in AR/FR/EN on phone/tablet |
| P1 | Typography & screen density | Key data readable at target tablets and 320/390px phones; no clipping, sufficient contrast/touch targets |
| P1 | Sustainable frontend styling | Shared semantic tokens and tested component variants replacing duplicate CSS rules progressively |
| P1 | Owner overview efficiency | Above-fold compact critical workflow and measured throughput; alerts grounded in recorded transactions |
| P2 | Competitive benchmark | Timed staff evaluations vs Odoo POS, PartsTech and relevant commercial catalogs, comparing only accessible functions |

## 7. Measured vs unmeasured
**Measured/confirmed:** existing CI pass on main #44450185183; actual browser screenshots from #44448945865; code review of media upload, catalog permissions and part details.  
**Not measured:** real paid supplier ingestion, mobile network hosted latency, staff task times, real merchant inventory, international catalog completeness, physical barcode/printer integration, external staging and competitor superiority.  
**Do not present this audit as a sign-off on those unmeasured requirements.**

## 8. Safe execution next
Merge PR #6 only if its **final head** CI passes and screenshots are reviewed. Then prioritize a **single true vertical slice** using actual company input: verified SKU photo + accurate product/price/stock + search + sale + receipt on shop tablet. Parallelize new vehicle catalog adapters only after licensing and source data are available. Do not consume credits fabricating fake products or claiming full global coverage.
