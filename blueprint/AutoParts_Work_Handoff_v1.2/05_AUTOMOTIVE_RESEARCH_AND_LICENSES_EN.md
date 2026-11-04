# AUTOMOTIVE WORLDWIDE RESEARCH & FITMENT DATA ACQUISITION PROGRAM
**Objective:** Build a broadly useful, legally defensible, traceable make/model/variant/part catalog that reflects actual Moroccan demand while supporting international expansion. A world-wide comprehensive vehicle-to-part database is NOT something Work can truthfully create by merely browsing web search; premium datasets, supplier contracts, data cleaning and manual confirmation are necessary.

## Localization rule v1.2
Catalog research should collect legally usable AR/FR/EN product names, vehicle aliases and descriptions when available, preserving original branded references and provenance. Locale labels/translation do not imply verified compatibility. Link translation review state to product-publication gating as described in `10_MANDATORY_TRILINGUAL_LANGUAGE_SWITCHER_EN.md`.

## 1. Four layers that must never be confused
1. **Vehicle name list:** make and model names; does not prove generation or engine.
2. **Vehicle variant catalog:** platform, production dates, market, engine code, transmission, body and trim/equipment; does not prove a particular part fits.
3. **Product catalog:** manufacturer, part number, specifications, packaging and images; does not prove a vehicle linkage.
4. **Fitment link:** product-to-specific-variant with axle/side/equipment/VIN/production qualifiers and evidence; only reviewed high-confidence records can be labeled verified.

## 2. Source evaluation tiers
- **Tier 0 — company evidence:** invoices/purchase lists/stock counts from authorized users, actual sold SKU history. Highest priority for product assortment and demand, **not** automatic fitment proof.
- **Tier 1 — OEM/manufacturer published catalogs and authorized supplier extracts:** evidence with issue date; determine permitted import, storage, internal/public display. Provide importer and mapping.
- **Tier 2 — licensed TecDoc / TecAlliance APIs or packages:** evaluate quote, geographic coverage, internal vs public distribution rights, update cadence, VIN regions, access caps and model-year accuracy. Official service: https://www.tecalliance.net/products/cards/tecdoc-catalogue and https://www.tecalliance.net/products?solution=catalogue-ecommerce ; OneDB API requires customer access: https://developer.tecalliance.cn/en/introduction/index.html . Do not use without permission.
- **Tier 3 — geographic standards datasets:** Auto Care ACES/PIES and related VCdb/PCdb/Qdb for supported markets and licensing, primarily relevant to North America; source: https://www.autocare.org/data-standards . Do not assume Moroccan fitment coverage.
- **Tier 4 — public vehicle metadata:** NHTSA vPIC, official local vehicle-maker catalogs, Morocco sales datasets; useful for certain make/model data but NOT a parts-fitment oracle. NHTSA: https://vpic.nhtsa.dot.gov/api/ . Verify coverage/terms and update date.
- **Tier 5 — community/open metadata:** inspect individual license, contributor quality, provenance, geography and refresh; lower confidence until validated.
- Exclude unauthorized scraping of protected commercial catalogs, license-violating redistribution, and unapproved product photos.

## 3. Country/geography plan
Wave A: verify what the company physically stocks and sells in Casablanca; identify its key OEM/aftermarket brands, top 100–500 SKUs and frequent customer vehicles. Wave B: Morocco-wide current and circulating fleet including Dacia/Renault/Peugeot/Hyundai/VW/Opel and older/imported/van models; measure demand with actual sales and official market data, not only latest new-car rankings. Wave C: Europe, North Africa, Asia and North America variants where there is verifiable catalog coverage or business demand. Wave D: expand worldwide by paid data agreements and measured coverage gaps. Do not equate large make/model count with confirmed compatibility.

## 4. Automated research pipeline (implement as an auditable job)
`SOURCE_REGISTER -> RIGHTS_CHECK -> AUTHORISED_FETCH -> RAW_SNAPSHOT(hash,timestamp) -> PARSE -> NORMALISE -> MATCH_CANONICAL_ENTITY -> VALIDATE -> REVIEW_QUEUE -> PUBLISH_VERIFIED -> SCHEDULE_RECHECK`.
- Every source entry: URL, provider, type, country, language, license, whether commercial storage/display/API access allowed, permitted number of calls, data retention terms, version/date, content hash, latest verification and review owner.
- Every vehicle import: market, generation, VIN/year constraints when known, aliases, engine code; reject duplicate variant claims unless manually merged with evidence.
- Every part import: exact manufacturer brand+part number, cross-ref type and direction, product specifications, package qty, original source ID, media rights. No blind fuzzy SKU merge.
- Every fitment: product_id, vehicle_variant_id, qualifiers, sourcing, review state, verified date, data source permitted use. Missing qualifiers -> `REVIEW_REQUIRED`, not `VERIFIED`.
- Handle conflicting supplier sources by freezing verification pending review, retaining both claims and audit notes.
- Version each imported record and changes; dashboard for outdated catalog references and source update breakage.

## 5. Fitment decision policy
`UNRESEARCHED` = unknown; `SOURCE_CLAIMED` = source claims link but not operationally verified; `REVIEW_REQUIRED` = requires qualified checking; `VERIFIED` = reviewed evidence and exact variant constraints; `CONFLICTED` = contradictory sources; `REJECTED` = disproven.
- AI may assist category matching, Arabic/French translation, duplicate suggestions and extracting candidate model aliases, but may not approve final fitment automatically.
- **Safety-sensitive items** (brakes, steering, suspension, wheel attachment, airbag-related electrical, EV HV parts) require category-appropriate additional confirmation and explicit limitations. Do not issue fitting/safety guarantees beyond evidence.
- A part replacement/supersession/OEM number alone is not universal proof of equivalence. Installation/compatibility may require trim, production date, engine, rotor diameter, side and axle.
- Record staff correction feedback and later source reconciliation; do not let user comments immediately overwrite verified manufacturer claims.

## 6. Minimum useful deliverables in V1
(a) source/rights matrix; (b) vehicle make/model/generation/variant table sourced and deduplicated; (c) parts taxonomy to subcategory; (d) product/SKU master for chosen pilot sample; (e) fitment evidence UI plus review queue; (f) importers and repeated update jobs; (g) coverage dashboard with counts by country/make/generation/variant/category and confidence; (h) gaps prioritized by actual company demand.

## 7. Quantitative quality reporting
Show, per provenance/market: `unique makes`, `unique models`, `generations`, `engine-specific variants`, `total products`, `products with >=1 fitment`, `fitment links by VERIFIED/CLAIMED/UNRESOLVED`, `percentage with licensing rights for public display`, `duplicate/conflict rate`, `records stale > source update policy`, `source API error rate`, and `internal vs public eligible data`.
An honest 2,000 high-quality fitments for items that are actually sold are more valuable to the company than 2 million undocumented and inaccurate associations.

## 8. Known official links for confirmation
TecAlliance TecDoc: https://www.tecalliance.net/products/cards/tecdoc-catalogue
TecDoc Web Service: https://www.tecalliance.net/products?solution=catalogue-ecommerce
Auto Care data standards: https://www.autocare.org/data-standards
NHTSA vPIC: https://vpic.nhtsa.dot.gov/api/
CNDP Morocco: https://www.cndp.ma/formalites/
Moroccan consumer ministry: https://www.mcinet.gov.ma/en/content/rights-guaranteed-consumers
