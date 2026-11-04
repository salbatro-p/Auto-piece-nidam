# 09 — MANDATORY TWO-APPLICATION ARCHITECTURE ADDENDUM (v1.1)

**Priority:** This owner-approved scope change supersedes any ambiguous V1 requirement suggesting staff and customers share a single UI. All other v1.0 business rules, catalog/fitment provenance, QA gates, and licensing protections remain in effect.

## Mandatory v1.2 extension — top-header 3-language selector in EACH app
In both separate frontend applications, expose the same clearly visible **AR / FR / EN language switcher at the TOP of the app**, without confusing app identity or login scope. Every interface and critical workflow is translated (not only the selector); Arabic layout is RTL, French/English LTR. Apply per-user preference and preserve draft sales, product uploads, stock receipts, public cart/checkout state when switching. This requirement is fully specified and tested in `10_MANDATORY_TRILINGUAL_LANGUAGE_SWITCHER_EN.md` and is a stop-ship condition for each version. Locale selection must NOT affect stock authorization, numeric values, or private/public security boundaries.

## 1. Product decisions and trust boundaries
Build two independent user-facing APPLICATIONS over ONE authoritative backend and ONE canonical transactional inventory domain:

**A. AutoParts Business — PRIVATE operations app (V1):** Installed/responsive web app (PWA preferred) usable on the **in-store sales counter tablet** and the **owner's phone**, and adaptable to warehouse laptops. A **tablet POS mode** and **owner mobile mode** are different layouts and permission-driven experiences of this SAME private app, not extra stock databases. Access is by explicit company invite only; NO public self-registration. The owner can manage the business securely from outside the store; do not restrict them to the shop's physical Wi-Fi. The in-store tablet is a shared counter device and must be treated as untrusted if left unlocked.

**B. AutoParts Shop — PUBLIC customer application (V2):** Separate customer-facing storefront website/PWA (native Android/iOS only if justified and separately approved), with separate routes, identity/session boundaries and deployment from AutoParts Business. Customers can browse and buy; the owner can browse/test Shop like any customer, while ALL sensitive company actions remain ONLY in Business. Never expose staff endpoints, private cost, exact bin/stock location, supplier terms or staff controls through the public application. V2 starts single-seller.

**C. ONE platform:** Shared server-side catalog, fitment evidence, inventory, supplier-linked product master, stock ledger, sales/orders, audit and role authorization through a modular monolith, PostgreSQL transaction boundaries and secure APIs. No periodic Excel/Google Sheets sync, no independent public-shop stock DB, no client-side authoritative stock arithmetic. Excel/Google Sheets remain import/export tools. Separate public read projections are permitted but CHECKOUT and staff sale must validate and mutate primary authoritative inventory.

Naming is working/placeholder: `AutoParts Business` and `AutoParts Shop`; actual company brand may be specified later.

## 2. Screen and authorization map
| Context | Key screens and actions | Who can use it |
|---|---|---|
| Business — shared counter tablet / cashier POS | Barcode/ref scan, fast part search, stock availability, vehicle/verified fitment, quote, counter sale/receipt, refund/return intake, reserve for walk-in, basic customer lookup, label print, cashier shift handover | Invited sales staff; manager as approved. No default access to supplier costs, global price editing, user administration or entire supplier contracts. |
| Business — owner phone | Real-time dashboard, stock by warehouse, movements and alerts, product creation with images, SKU/OEM/GTIN, supplier and price management, purchase receipt/approval, stock adjustment approval, import review, audits, staff access | Owner/admin with MFA; role checks per action. |
| Business — optional warehouse workstation | Receipt, inspection, bin assignment, cycle count, move/transfer, label printing | Warehouse role. |
| Shop — public website/PWA | Vehicle selector, licensed public catalog, search, product pages, basket, checkout, order tracking/returns, customer account | Customers, optionally guests. |
| Shop — owner | Same as the customer-facing experience to inspect or test published products | The owner as an ordinary shop user; business administration stays in Business. |

Administrative APIs MUST authenticate and authorize every operation on the server regardless of UI visibility. Prefer separate subdomains/apps, independent session cookies and deployment configs, with company-only API routes behind explicit RBAC and suitable network controls. Staff invitation and owner MFA are required for production; short tablet inactivity lock, individual staff PIN/reauth and shift auditing, safe logout and remote device-session revocation are required. Restrict device enrollment if helpful, but device/IP/location restrictions alone are insufficient. Never store a privileged permanently logged-in owner account on a shared POS tablet.

## 3. V1 functional flows (must work on real devices)
A. **Create a new part for the FIRST TIME:** Owner logs into Business from phone, photos item or uploads authorized photo, enters supplier, part brand/manufacturer number, internal SKU, optional OEM/reference and barcode, localized name, category, pack vs piece unit, price (cost hidden from cashiers), storage bin and compatibility evidence. Persist DRAFT, flag missing evidence, review duplicates, then approve ACTIVE_INTERNAL. Owner can later mark PUBLIC_READY/PUBLISHED only through V2 publication checks and approved public display rights. Scanner-based lookup should work for already registered parts. Never automatically assert fitment from a mere OEM similarity.

B. **Receive inventory (entry / entrée / دخول):** A staff member with receiving permission scans SKU, selects warehouse/bin and actual sellable unit, enters supplier delivery document, actual qty, condition and optional purchase order, gets a preview, confirms, and records an immutable `StockReceived` movement and balance update in one atomic DB transaction. Support piece (`PCS`) and case/carton units with explicit integer conversion (e.g., carton of 10 PCS). Never confuse packs with pieces.

C. **Sell at the counter (exit / sortie / خروج):** Cashier scans SKU, sees physical `on_hand`, `reserved`, `available` and exact location, selects number of PCS, commits a sale. Server verifies positive availability, writes sale and ledger, and decrements stock atomically once, with idempotency/replay protection. POS must return authoritative committed response, or an UNKNOWN/REQUIRES_RECONCILIATION state and a safe look-up by request ID after network loss; never falsely display a completed sale if server outcome is unknown. The business owner's phone and all other company sessions see the updated value on next query/realtime invalidation.

D. **Count/adjust/return:** Physical stock counts compare to expected stock without silent overwrites; adjustments need reason, approver and audit. Returned pieces are quarantined pending inspection, and only become sellable after approval. Notifications for low stock, abnormal adjustments and failed imports; avoid notification overload.

E. **Storewide catalog and supplier data:** Excel/CSV import/export and remote vendor imports run through preflight duplicate validation and approval. Existing SKUs can remain private even if sourced from global research. All public product publishing is explicit and traceable.

F. **Connection loss:** Online authoritative writes by default. Clearly show OFFLINE/UNCONFIRMED status and prevent false sale success; allow optional local catalog read cache or unsent draft documents, but do not auto-commit offline stock sales unless a separately designed, owner-approved safe reconciliation mode has been tested. This protects last-unit accuracy across shop and store.

## 4. V2 stock interoperability — no 'synchronization by copying'
- Customer browsing may use cached published catalog; **checkout uses the same server inventory transaction service as Business POS**.
- Cart addition is not stock reservation by default. Checkout confirms a **finite TTL reservation** with a unique idempotency key. The available-to-sell quantity must fall immediately after committed reservation. Payment, dispatch, cancellation, expiry and returns follow one explicit tested state machine; fulfillment must not subtract the same piece twice.
- `available = sellable on_hand - valid reserved`. Damaged, quarantined and unreceived goods are excluded from sellable on_hand. Shared inventory across public and counter sales is scoped by actual stock location/fulfillment policy.
- Illustrative flow: Begin **30 PCS** physically on hand and 0 reserved, thus 30 available. The counter sells 3 PCS -> 27 on_hand, 27 available. A customer completes a reservation for 2 PCS -> 27 on_hand, 2 reserved, **25 available**. If cancelled, reserved returns to 0 and available to 27. This same result must appear in owner Business and Shop availability.
- Event notifications, cache invalidation and optional push may update UIs, but transaction integrity cannot depend on WebSockets or job queue freshness. If a phone is disconnected, it must re-fetch verified balances before a stock-changing operation.
- Public Shop may show 'In stock / Low stock / Out of stock' instead of exact remaining PCS; internal Business can show exact quantities subject to permission.
- Public publishing requires approved rights for media and data, approved pricing, product safety/fitment disclosures, and `PUBLISHED` status; no internal drafts are public.

## 5. Physical deployment and UX recommendation
- Phase 1: one installable Business PWA with **tablet landscape POS workspace** and **owner mobile portrait workspace**, plus a desktop/warehouse-compatible mode. Use appropriately sized barcode-friendly touch controls, on-screen numeric keypad, large stock readout, fast sale flow (target 3–4 actions when SKU recognized), clear confirmation state and print-friendly receipt. Camera scanning should have a typed/USB scanner fallback. Support AR RTL and FR/EN. Test on actual store tablet and owner Android phone before pilot.
- Phase 2: distinct public Shop responsive SEO-capable web storefront and installable PWA; native wrappers/apps require separate business justification. Independent build/deploy, shared backend contracts and design tokens where sensible, no customer-facing bundle containing internal data.
- Proposed package layout: `apps/business`, `apps/shop` (Phase 2), `apps/api`, `packages/ui`, `packages/contracts`, `packages/validation`, `packages/config`, `db/migrations`, `tests/e2e`, `tests/load` (adjust to selected framework). Role-specific Business views do NOT require different backend databases or independently deployed admin apps.

## 6. Security and quality acceptance — MANDATORY STOP-SHIP cases
1. Staff with tablet cashier role CANNOT see/edit supplier costs, modify historical movements, approve adjustments, manage staff or read protected owner reports; attempts via direct API paths fail server-side.
2. Owner on authorized mobile can create a product, upload an image, record a 10-PCS carton receipt (with configured conversion), see accurate stocks and review audit; shared tablet cannot perform owner-only tasks.
3. Login, role switch, shift change, tablet auto-lock, session revocation and MFA are tested on actual target devices.
4. Cross-channel last-piece stress: a cashier sale and V2 checkout reservation target one remaining unit at once; **exactly one may win**. Retry/replay 10 times must not create duplicates. Test store transfer and return races too.
5. Network drops between request and response; the app recovers transaction status by ID before resubmission, never falsely declares stock update complete, and supports safe idempotent retry.
6. Both independent apps can be deployed/rolled back without requiring a destructive schema change or interrupting the Business sale path. Backups and recovery drills include both channel business records.
7. Load/performance targets in `04_QA_SLOS_AND_RELEASE_GATES_EN.md` remain mandatory, measured and reported as PASS/FAIL/NOT TESTED. Optimizations must be based on real profiling, not blanket promises of 'zero bottlenecks'.
8. Public APIs cannot leak any internal Business-only SKU metadata, unapproved images, unpublished fitments, supplier data or cost fields; automated field-level leakage tests required.
9. Strictly no live deployment, real data import, external payments or provider accounts without owner approval and clear evidence.

## 7. Delivery sequence / Work assignment
**V1 first:** Complete private Business tablet POS + owner mobile management, shared backend, catalog, inventory, suppliers, QA and company pilot. Include an explicit ``Shop-ready architecture`` artifact, API contracts and publication gating; do NOT build the public customer application yet.

**V2 second:** Audit accepted V1 source and tests. Build the separate public Shop app and required commerce backend modules using the existing inventory domain without breaking daily Business operation. Start with sandbox/payments & shipping mocks, acceptance tests and cautious rollout. If implementation conflicts with this addendum, record an ADR and choose the stricter separation and integrity condition. Do not declare launch merely from passing simulated UI tests.
