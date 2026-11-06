# 11 — MANDATORY VEHICLE-SPECIFIC PART IMAGE SYSTEM (v1.3)
**Project:** AutoParts Morocco | **Owner-approved scope:** V1 Business now, V2 public Shop later. **Priority:** Mandatory requirement; supersedes any weaker v1.2 phrasing suggesting that supporting one product-photo upload is sufficient.

## A. Exact user outcome and strict scope
When an authorized employee selects a vehicle (make, model, generation, production year, market and relevant engine/variant/equipment) and a part category, AutoParts Business must return the **company's relevant products**, displaying for each:
1. Product name (AR/FR/EN), category, part brand, manufacturer part number and internal SKU, stock/PCS and price according to role.
2. Image gallery of the **exact commercial item identified by its supplier/manufacturer part number**, only where matched and reviewed. Label image provenance and image category without cluttering cashier UX. Multiple angles where actually available.
3. Source-backed fitment status and qualifiers, including axle/side, brake size or equipment variant when relevant. Show `VERIFIED` distinctly from `CLAIMED`, `REVIEW_REQUIRED`, and `UNKNOWN`. Do not imply that a similar-looking part fits a vehicle.
4. Optional **licensed technical exploded-view diagrams** or part location drawings **for the selected vehicle variant**, as a separate tab; clearly state exact vehicle and diagram applicability, diagram provider and rights. Do not promise diagrams for all cars unless the company obtains licensed coverage.
5. Clear `IMAGE_UNAVAILABLE` / `FITMENT_NOT_VERIFIED` states with an owner/admin workflow to supply evidence; never silently use a near-match, AI-generated replica, unsourced web image or 'illustrative' picture presented as the exact SKU.

This is a **working, rights-respecting in-company parts catalogue**, not a guarantee of every part/photo for every car worldwide. V1 pilot begins with stocked company SKUs and the best-supported Moroccan makes/variants. The software and importer must scale to broader licensed catalogs over time. Data collection and actual image coverage cannot exceed lawful available sources and company-supplied data.

## B. Product and media distinctions (non-negotiable)
- `EXACT_PRODUCT_PHOTO`: a photograph linked to manufacturer part number AND approved product/SKU; source/rights/review documented; correct packaging and vehicle-specific differences where important.
- `GENERIC_CATEGORY_ILLUSTRATION`: optional education-only image, clearly labeled not representative of exact inventory item. Never the hero image if user assumes it is exact.
- `VEHICLE_PHOTO`: vehicle identity/reference, not a product photo and not evidence of parts compatibility.
- `EXPLODED_DIAGRAM`: manufacturer/supplier-catalog technical illustration with explicit license, technical figure identifier, platform/engine/variant scope and diagram callouts as available. Never infer a corresponding sellable SKU from visual appearance alone.
- `COMPANY_ORIGINAL_PHOTO`: photo taken by authorized staff of a SKU in stock; store camera/original metadata as allowed, do not leak sensitive EXIF/location or staff identifiers.

## C. Data model
Implement or adapt these logical entities, with migration and audit evidence:
- `product_media`: media_id, product_id, sku_id, manufacturer_id, manufacturer_part_number, kind, object_key, checksum, source_id, source_url_optional, license_record_id, internal_display_permitted, public_display_permitted, attribution_text, view_angle, dimensions, mime_type, file_size, state, reviewed_by, reviewed_at, created_at.
- `vehicle_media` and `diagram_media`: media_id, vehicle_variant_id / platform plus explicit constraints, provider, illustration_id, callouts, rights flags, status, attribution.
- `media_source_license`: source type (company/supplier/paid catalog/other), terms/version/proof, permitted use, expiry/revocation, territory, attribution and download/redistribution constraints.
- `image_ingest_job`: source file/import, OCR/identifier suggestions (review only), dedup checksums, preview diff, errors and audit trail.
- Fitment remains separate in `fitments` and `fitment_evidence` with variant qualifiers, reviewer and provenance. The presence of an image is NEVER fitment proof.

Enforce reference normalization and conflict review. A supplier SKU may map to a manufacturer reference through explicit cross-references only, with evidence. Keep images on object storage or protected media service, not as unbounded database BLOBs. Provide thumbnail and modern responsive formats; preserve original appropriately. Restrict private media via authorization; do not use publicly accessible object URLs for internal-only assets. Provide safe upload limits, MIME/content validation, malware/abuse safeguards and EXIF stripping where appropriate.

## D. Media ingestion and enrichment
1. Staff / owner camera capture with multiple angles, staged upload, product matching and duplicate warnings; show upload progress and resume/retry without duplicate assets. Do not interrupt a counter sale with long image processing.
2. Bulk import photos zipped or as a CSV manifest, Excel manifest, or supplier feed. Each image must map to exact SKU/manufacturer number; route ambiguous mappings to a review queue. Support rights evidence and separate internal/public approval.
3. Work can discover reputable suppliers and authorized image APIs, but **must not scrape copyrighted competitor catalogs** or represent web-search images as freely reusable. Avoid paid license commitments without explicit owner approval.
4. Manual photo review includes correct physical item, orientation/variant/left-right, reference number, source licensing and safe public status. Record who approved and what changed.
5. Create a missing-photo and poor-quality review queue prioritizing the company's top selling SKUs and pilot catalogue. Offer owner a straightforward workflow to photograph the remaining parts.
6. For technical diagrams, offer optional provider adapters; if none licensed, deliver diagram-ready data structures and a truthful `NOT_AVAILABLE` UI without substituting fabricated drawings.

## E. UX requirements (tablet, owner phone, later Shop)
- Prominent product image on search results and product cards, quick gallery zoom, variant badges, technical specs, SKU/barcode/OE/manufacturer refs, stock by location, evidence-backed fitment, role-controlled costs.
- Filter path `Make → Model → Generation → Year/Market → Engine/variant → Category` and searchable part number; allow skipping unavailable filters but refuse definitive 'compatible' claims without enough attributes.
- AR/FR/EN language switch at top of both applications; localized image labels and statuses; preserve serial numbers and part identifiers unchanged. Correct RTL and accessibility alt text.
- Show exact-match status and warnings near photos without claiming a photo certifies compatibility.
- Fast progressive images with thumbnails, lazy loading, responsive sizes, secure caching and bounded image requests on midrange Android tablets. Preserve readable UI when images fail or connection is slow.
- V2 customer Shop uses only `APPROVED_PUBLIC` media; owner/staff remain able to see internal-only source and audit records behind authentication.

## F. Acceptance criteria — do not mark complete without evidence
**Functional:** Demonstrate end-to-end flows using manufacturer-part-number-verified photos supplied or authorized by company/supplier. For the pilot catalog, create a coverage report `total_stocked_SKUs | with_approved_exact_photo | with_verified_vehicle_fitment | with_rights_for_public | missing_photo | disputed_match`, including itemized omissions. If 100% image coverage is unavailable, disclose precisely why and give an actionable collection list; **do not invent images or claim full coverage**. A usable V1 photo ingestion and exact vehicle-filtered browsing workflow is mandatory even if business-side photographic content is incomplete.

**Quality tests:**
- IMG-01: Two distinct manufacturer numbers for visually similar parts; their photos cannot silently cross-link.
- IMG-02: A left/right, front/rear or engine variant mismatch must be blocked/reviewed; no 'confirmed' fitment from image similarity.
- IMG-03: Internal image unauthorized for public cannot appear in Shop APIs/CDN/cache.
- IMG-04: License revoked/expired or missing rights → prevent publishing and show review task; internal display also respects license.
- IMG-05: Mixed Excel+zip batch of 1,000 synthetic photos with duplicates, broken files and ambiguous mappings → no mass incorrect assignment; bounded memory, per-row results and repeat-safe retry.
- IMG-06: Mobile/tablet camera upload disrupted and resumed, part draft/PCS/session retained, wrong MIME rejected, malware/security checks applied.
- IMG-07: Same vehicle model/year but different engines/equipment → return only correct verified matches, with image and supplier part number tied to exact SKU.
- IMG-08: AR/FR/EN + RTL gallery, technical part numbers, alt text and broken-image fallback work on tablet and phone.
- IMG-09: At scale, search/list screens meet existing latency targets with representative thumbnail load, no blocking full-resolution image requests.
- IMG-10: Diagram used only when rights and vehicle applicability verified; absent/unsupported diagrams shown honestly rather than fabricated.

**Evidence:** running UI recording/screenshots, supplier rights matrix, seed/demo and business-provided image labels, migration/DB definitions, file ingestion logs, test scripts/results, image coverage dashboard, release gate PASS/FAIL/NOT TESTED, and unresolved data/license actions. Never call tests PASS if not executed.

## G. Deliverable boundary
V1 must ship an operational image-aware parts catalog and rights-controlled photo pipeline suitable for company-supplied inventory, plus verified vehicle-part search. **It cannot magically supply a full worldwide collection of correct photos and exploded diagrams without licensed sources, supplier content, and company inventory data.** V2 reuses shared data and separates public approval. No live publication or third-party subscription purchase without owner approval.
