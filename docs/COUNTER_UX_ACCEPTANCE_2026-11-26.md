# Counter and owner usability acceptance · 26 November 2026

The candidate frontend at `0445cd53c8ee276795abaceeb261d99aeed49207` was exercised locally against the training company and a separate disposable test database. The three-language review covered the start of a session, core workspaces, product photography, receipt retrieval and the end of a session. The final merged-main checks are recorded on [pull request 16](https://github.com/salbatro-p/Auto-piece-nidam/pull/16).

| Gate | Result | Evidence |
| --- | --- | --- |
| Screen layout and reading direction | PASS | Fifteen states at 320, 390, 1024 and 1440 CSS px in AR, FR and EN. All 180 matched the intended direction and met the horizontal-overflow check. Selected axe WCAG 2/2.1 A/AA rules reported zero violations in these states. [Measurements and hashes](evidence/counter-ux-2026-11-26/checks.json) · [Full captures](evidence/counter-ux-2026-11-26/screens.zip) |
| Owner overview | PASS | Today's recorded amount and transaction count appear before the shortcuts. Physical, available and reserved quantities remain distinct. Outstanding setup actions stay visible and completed steps can be expanded. Historical movements carry their saved dates. [Arabic phone](evidence/counter-ux-2026-11-26/dashboard-320-ar.jpg) |
| Counter product selection | PASS | A sales account distinguished two long references differing only in their final character. The browser checked both cards across the twelve language/width combinations and added the intended reference. On phones under 480 px each part gets one full-width row. [French phone](evidence/counter-ux-2026-11-26/pos-390-fr.jpg) |
| Quantity, quote and release | PASS | A repeat tap or scan of the last unit leaves one sellable unit in the cart. An explicit quantity over stock shows the warehouse and balance, permits a quote and disables sale and reservation. Tests released and sold the final unit, and completed a separate reserved sale. PostgreSQL remains authoritative. |
| Navigation and session lock | PASS | Focus enters the phone drawer, Escape returns it to the trigger and navigation moves it to the selected page. A failed logout is explained inside the drawer. A real test session expired with a search dialog open. Reauthentication restored the search and its draft. Language and sale totals survived the tested transitions. |
| Saved receipt | PASS | Reopened a saved training sale across all twelve width/language combinations. Sale identifier, persisted timestamp and minor units matched the API. The narrow receipt keeps the amount and its currency together. Separate sale tests covered a lost response and stock reconciliation. [Arabic receipt](evidence/counter-ux-2026-11-26/receipt-320-ar.jpg) |
| Accounting, physical hardware and human usability | NOT TESTED in this review | Acceptance in the shop requires the intended private network, tablet, scanner, printer, an employee and accounting approval. The Windows recovery rehearsal and the requirements for independent backup custody are recorded in the [Phase 1 matrix](LOCAL_PHASE1_2026-11-22.md). |
| International ranking | NOT TESTED | The [product comparison](WORKSPACE_BENCHMARK.md) covers public material. There is no timed comparative staff study or independently measured international ranking. |

## How to inspect the result

Open the local Business preview at http://127.0.0.1:4175/ or use the private AAA training shortcuts described in the [Windows guide](WINDOWS_COMPANY_GUIDE_AR.md). On a phone, go to the counter, search a reference, add it and switch language. As owner, look at today's sales on Overview, open the phone menu and return to the dashboard. The training catalogue and its balances are synthetic.

The visual run loaded candidate frontend assets with real training API responses. It reopened an existing sale. Chrome viewport emulation was used on Windows. [Visual overview](evidence/counter-ux-2026-11-26/screens-overview.jpg) · [Login](evidence/counter-ux-2026-11-26/login-390-fr.jpg) · [Inventory](evidence/counter-ux-2026-11-26/inventory-390-en.jpg).

## Shop-counter observation

Have the employee find two similarly numbered parts, scan the requested one, handle an unavailable quantity, complete a sale, and reprint the saved receipt on the shop hardware. Ask the owner to locate today's amount and reconcile the sale with remaining stock. Record the selected SKU, time to completion, corrections, assistance needed and any unreadable text. Use the same parts, tasks and devices for any comparison with another application. Record the operator's own assessment of clarity, comfort and appearance.
