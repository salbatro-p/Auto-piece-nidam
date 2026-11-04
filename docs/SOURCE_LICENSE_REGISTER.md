# Source, rights and reference review

Reviewed 2026-10-29. This register records discovery and approval requirements; it grants no license. No live third-party dataset has been imported.

| Source | Purpose and verified observation | Store internally | Public display/syndication | Current decision |
|---|---|---|---|---|
| Owner's company records | Actual assortment, counts, purchase documents; none supplied | Owner authorization and minimum data needed | Separate product/media rights review | Not supplied; no fabricated stock |
| [TecAlliance TecDoc](https://www.tecalliance.net/solutions/tecdoc) | Official portfolio includes standardized vehicle/parts data and catalogue/ecommerce solutions | Contract/API entitlement required | Contract must explicitly cover fields, images, territories and distribution | Discovery only; no access or rights claimed |
| [Auto Care ACES/PIES](https://www.autocare.org/data-standards) | Official page distinguishes fitment exchange and product information standards; reference databases require subscription | Subscription and terms review | Separate permitted-use review | Not connected; no Moroccan coverage inferred |
| [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/) | Manufacturer-submitted VIN/specification metadata; API has traffic controls | Verify applicable terms and record source/version | Review republication terms | Candidate vehicle metadata only; not part fitment proof |
| Supplier/OEM extract | Exact product data and documented qualifiers | Written supplier grant required | Written storage/display/syndication scope required | No authorized extract received |
| Company product photo | Owner-supplied authorized media | Store private with rights declaration and hash | Publication rights must be explicit | No real photos received |
| Synthetic fixtures | Test products/variants/images created for this project | Isolated demo/testing | Must not market as real stock or fitment | Demo only |
| Blueprint workbook | Market-research seeds, taxonomy, import headers | Reference use within this project | Does not authorize republishing source claims | Reviewed; not loaded as real inventory |

For each operational source retain provider URL, access type, country/market, languages, grant evidence, internal/public/syndication flags, license expiry, update policy, request caps, source timestamp/hash, importer version, review owner and last review. Revocation blocks new publication and creates a review task. Cached licensed data is retained or removed according to the actual contract; do not assume perpetual rights.

## Workbook inspection evidence

File: `blueprint/AutoParts_Work_Handoff_v1.2/07_REFERENCE_AutoParts_Morocco_Data_Foundation_v0_1.xlsx`. SHA-256: `168891943d24c57044badb6a74849e379020078d0c4a2b36ed5929e0ed834040`.

Read using openpyxl, without editing the source. Nonempty data rows excluding header: START_HERE 10; Brands_MA 25; Models_MA_Seed 49; Part_Taxonomy 100; Sources_Licenses 11; Execution_Plan 8. Vehicle_Variants, Products_Import, Fitment_Import, Locations_Stock, Stock_Movements and Suppliers_Import each have zero data rows. Thus the workbook supplies no real stock, product, supplier, exact variant or verified fitment. Model rows are market-research seeds, not validated fleet demand. Third-party sales ranking rows were not promoted to verified facts or imported.

## Fitment and acquisition policy

Stages: register → explicit rights → authorized fetch → immutable hashed snapshot → normalize identifiers → validate schema → duplicate/conflict review → exact variant/evidence review → approval → freshness recheck. Vehicle names, vehicle variants, products, and fitment links remain different entity classes. Matching OEM text alone does not prove equivalence. Unknown engine or missing production/side/axle qualifiers prevents verified fitment. Contradiction creates CONFLICTED state. Safety-sensitive categories require qualified additional review.

Prioritize the company's counted SKUs, then documented Moroccan demand, then licensed wider coverage. Report actual product/variant/fitment counts by state, source, market, freshness and public rights. Global completeness is not claimed.

## Legal and release dependencies

The [CNDP formalities portal](https://www.cndp.ma/formalites/) distinguishes declarations, prior authorizations and foreign-transfer requests. Hosting location, staff personal data, processors, retention, backups and transfer requirements need a company-specific assessment before live hosting. The [Moroccan consumer ministry](https://www.mcinet.gov.ma/en/content/rights-guaranteed-consumers) describes information, choice and withdrawal protections under law 31-08; future public sales need reviewed terms and product-specific exceptions. Local tax/accounting review remains required for invoices. These are unresolved release approvals, not claims of legal compliance.
