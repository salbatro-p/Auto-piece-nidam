# Moroccan business dates and UTC storage

The 11 November 2026 review found different timezone rules in the installed runtimes. Node 24.16.0 reports tzdb 2026b and still adds an hour for November 2026; the installed PostgreSQL data also uses that older offset. The tested Chromium already uses GMT for that date. The discrepancy affects receipts and the definition of daily sales.

Morocco restored GMT on 20 September 2026. This is recorded in the [Moroccan government announcement](https://www.cg.gov.ma/en/node/13036) and [IANA release history](https://www.iana.org/time-zones/releases), beginning with tzdb 2026c. The bundled application data is pinned to **IANA 2026f**, extracted from `moment-timezone@0.6.6` using its [documented zone data](https://momentjs.com/timezone/docs/).

Only the Casablanca transition/offset table enters the application bundle. Moment and the worldwide timezone dataset are development dependencies used to regenerate and independently test that table. The source version and URL are recorded in `packages/i18n/src/data/casablanca.json`; its license is adjacent.

All persisted timestamps remain UTC. The shared formatter selects the correct offset at the original instant, then uses `Intl` in UTC to render the resulting wall clock in AR/FR/EN. The shifted value is private to presentation and is never stored or returned as an authoritative timestamp. This does not replace global `Intl` behavior or change the workstation timezone.

Dashboard sales use explicit UTC start/end bounds calculated from the same data. The query excludes the end boundary and preserves warehouse scope. A business day may have 23 or 25 hours at historical transitions; the code does not add a fixed 24 hours to its UTC start. Sale responses now return the database's persisted creation timestamp, so the immediate receipt and a reopened receipt refer to the same instant.

Verification covers every bundled transition on both sides, all three display languages, Ramadan changes, the September 2026 change, historical skipped/repeated midnights, daily sales totals, and receipt text against the saved timestamp in the built browser. See [timezone evidence](evidence/business-timezone.json) and [sale/receipt evidence](evidence/sale-response-loss.json).

For future changes, review IANA and the government source, update the pinned development dependency, run `npm run tzdata:generate`, inspect the table diff and rerun the timezone, API, browser and relevant performance checks. Update the host and database timezone packages in the approved deployment maintenance process as well. No existing stock, sale or audit timestamp is rewritten.
