# DATA ONBOARDING TEMPLATE — COMPANY INPUTS (AR/FR/EN)

### v1.3 images intake (additional import sheet / upload form)
`sku | manufacturer_brand | manufacturer_part_number | supplier_reference | image_file_or_authorized_url | image_kind (EXACT_PRODUCT / GENERIC_CATEGORY / VEHICLE_PHOTO / EXPLODED_DIAGRAM) | view_angle | image_source_name | rights_evidence | rights_internal | rights_public | required_credit | verified_by | review_status | notes`.
Work must implement bulk image association with dry-run, collision detection, supplier SKU vs manufacturer part number validation, source rights audit and missing-image report. Never infer compatibility from filename, picture resemblance, or search result title. See `11_MANDATORY_VEHICLE_SPECIFIC_PART_IMAGES_EN.md`.

The app **CAN** be prototyped with clearly labeled demo inventory even if the company currently has no Excel, Sheets or ERP. For reliable real production inventory, a physical count + signed opening balances + validated product master are mandatory. Work must not make up real quantities or prices.

## الحد الأدنى للبدء العملي
أول ما يتوفر لدى الشركة: قوائم الفواتير، صور الملصقات، ملفات Excel/Google Sheets، أسماء الموردين، لائحة القطع التي تباع بكثرة، أو جرد فعلي. استخرج البيانات بشكل آمن مع معاينة وتصحيح قبل الإدخال. الشركة ليست ملزمة بتوفير جميعها لبدء تطوير نسخة تجريبية. لا تطلب كلمات مرور أو معلومات بنكية في المحادثة.

## Language and localized product fields — MANDATORY v1.2
Both applications must expose the top-header AR/FR/EN selector. For import templates, support separate optional columns `name_ar`, `name_fr`, `name_en`, `description_ar`, `description_fr`, `description_en`, `translation_review_status_ar/fr/en` for approved public-facing text, where commercial rights permit. Manufacturer/OEM/SKU/EAN identifiers must never be machine translated or reformatted. Missing localized product text must be visible to catalog editors with an explicitly tracked fallback; core safety/fitment warnings must be reviewed in each public locale before publishing. See `10_MANDATORY_TRILINGUAL_LANGUAGE_SWITCHER_EN.md`.

## 1. Product master — Produits / لائحة السلع
| Column | Meaning / شرح | Required | Example ONLY (fictional) |
|---|---|---|---|
| `sku` | Internal unique reference / مرجع داخلي | YES | DEMO-001 |
| `brand` | Manufacturer/aftermarket maker / العلامة | YES | DEMO-BRAND |
| `manufacturer_part_no` | Official manufacturer part number | YES when available | TEST-REF-01 |
| `name_fr` | French display name | YES | Filtre (exemple) |
| `name_ar` | Arabic display name | optional | فلتر (مثال) |
| `category_path` | Hierarchical category | YES | Engine > Filtration |
| `unit` | Unit of sale | YES | piece |
| `pack_qty` | Pieces per selling pack | YES | 1 |
| `oem_refs` | OEM refs if legitimately known | optional | blank |
| `ean_gtin` | Barcode if legitimate | optional | blank |
| `cost_mad` | Private unit cost MAD | optional | blank |
| `price_mad` | Selling price MAD | optional | blank |
| `image_source` | Authorized image and usage right | optional | blank |
| `supplier_ref` | Supplier's article reference | optional | blank |

`OEM_refs` here are identifiers only. They do not verify a particular vehicle fitment.

## 2. Opening balance / Stock initial / المخزون الافتتاحي
| Column | Meaning | Required | Example ONLY |
|---|---|---|---|
| `sku` | Existing validated SKU | YES | DEMO-001 |
| `branch` | Company location | YES | DEMO-BRANCH |
| `warehouse` | Warehouse | YES | DEMO-WH |
| `bin` | Shelf location | optional | A-01-02 |
| `condition` | SELLABLE / QUARANTINE / DAMAGED | YES | SELLABLE |
| `quantity_counted` | Physically counted stock | YES | 10 |
| `counted_by` | Authorized staff ID | YES for live | blank |
| `count_date` | Actual date | YES for live | blank |
| `approver` | Manager approval | YES for live | blank |
| `source_document` | Count-sheet reference | YES for live | blank |

Opening balance imports must create immutable receipts/adjustments in the ledger, not direct undocumented row edits.

## 3. Suppliers / Fournisseurs / الموردون
`vendor_id`, `name`, `country`, `contact_name` (minimize PII), `contact_method` (authorized), `payment_terms`, `lead_time_days`, `catalog_file`, `data_license_scope`, `sku`, `supplier_part_no`, `last_cost_mad`, `MOQ`. Keep pricing/contacts restricted to roles.

## 4. Vehicles and verified fitment
**Vehicle:** `make`, `model`, `generation`, `production_year_from`, `production_year_to`, `market`, `engine_code`, `fuel`, `displacement`, `gearbox`, `body`, `vehicle_variant_id`, `source_name`, `source_url`, `source_date`.
**Fitment:** `manufacturer_part_no`, `brand`, `vehicle_variant_id`, `axle`, `side`, `equipment_qualifiers`, `production_from/to`, `evidence_source_id`, `fitment_status`, `reviewer_id`, `reviewed_at`. Incomplete evidence -> review queue, never publish as VERIFIED.

## 5. Historical sales/purchases (optional)
Sales: `doc_id`, `date`, `sku`, `qty`, `sale_unit_price_mad`, `discount_mad`, `tax_class`, `branch`, `return_reference`. Purchases: `po_id`, `supplier`, `sku`, `qty_ordered`, `qty_received`, `unit_cost_mad`, `date`. Without historical data, don't fabricate popularity charts or reorder forecasts.

## 6. Credentials, personal data and approval
- Do not submit financial credentials, PSP secret keys, employee personal identity documents or customer phone/address exports in chat.
- Connect services only via explicit user-authorized app workflows and restricted accounts. Mask or anonymize data in screenshots and QA fixtures.
- Approval to import means preview validation/diff reviewed and signed off, then backup, test on staging and explicit go-live approval. Preserve an export of originals and source hashes.

## 7. Questions Work MAY ask only at appropriate release gates
For pilot launch: company brand/logo, number of stores/warehouses, preferred language of staff, chosen real SKU subset, actual count date, responsible approver, hosting/data location, supplier license rights. For V2 launch: service regions, cash-on-delivery policy, chosen PSP/courier provider contract, returns terms, local accounting and legal sign-off. Do not block coding or testing with synthetic fixtures while waiting for optional inputs.
