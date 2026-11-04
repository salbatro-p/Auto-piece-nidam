# Security design and verification checklist

Security verification targets application-controlled OWASP ASVS 5.0.0 requirements proportionate to a staff inventory system, with privileged access treated as sensitive. This is not certification or a complete ASVS audit. The [official ASVS site](https://asvs.owasp.org/) identifies 5.0.0 as the stable published standard checked on 2026-10-29.

| Threat | Required control | Verification / release limitation |
|---|---|---|
| Public visitor invokes staff API | Authentication on every protected route; no self-registration; deny unknown roles | Anonymous and wrong-role API tests |
| Cashier reads supplier cost via guessed URL, search, export or receipt | Server-side field projection and permission checks, not hidden UI alone | Field leakage tests across list/detail/export |
| Branch/tenant object guessing | Scope lookup and mutation by organization and allowed location | Cross-scope tests; multi-tenant launch remains out of scope |
| Shared unattended tablet | Individual sessions, short inactivity lock, logout clearing state, session revocation, privileged MFA | Browser tests plus physical device verification required |
| Stolen credentials/session | Password hashing, HttpOnly SameSite cookie, finite lifetime, CSRF, origin checks, rate limits, redacted logs | Wrong password/MFA, cookie and CSRF tests; TLS requires staging |
| Replayed receipt or sale / network ambiguity | Stored idempotency key and payload fingerprint; authoritative result retrieval | Ten-replay and response-loss tests |
| Concurrent last-unit sale | PostgreSQL transaction, locks/check constraints, immutable movement | 100-contender race and reconciliation |
| Deadlock or failure mid-transaction | Consistent lock order, bounded retry, rollback | Opposite order and injected failure tests |
| Return creates phantom stock | Reference sold quantity, intake quarantine, inspection, replay protection | Duplicate/damaged return tests |
| SQL injection/XSS/formula injection | Parameterized SQL, React escaping, strict validation, spreadsheet safe export | Malicious values in search/import/export |
| Uploaded active content or oversized file | Authenticated upload, allowlisted formats, signature/size checks, private media access | MIME mismatch, SVG/script and oversized upload tests |
| Unlicensed or unsafe fitment publication | Explicit rights and evidence state; no public endpoint in Phase 1 | Public route leakage and invalid VERIFIED tests |
| Backup disclosure or unrecoverable DB | Restricted encrypted backups, restore rehearsal, separate environments | Local restore evidence only until hosted configuration tested |
| Dependency/secret compromise | Exact lockfile, dependency audit, no secrets in Git, least privileges | Scan logs and controlled CI; unresolved high findings stop release |

## Proposed role capabilities

This table is the intended permission contract. The actual server permission map and automated tests must agree before release.

| Capability | Owner | Manager | Warehouse | Sales | Buyer | Curator | Auditor |
|---|---:|---:|---:|---:|---:|---:|---:|
| Read internal catalog and stock | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| View private costs / supplier terms | ✓ | ✓ | — | — | ✓ | — | Explicit audit scope |
| Receive / move inventory | ✓ | ✓ | ✓ | — | — | — | — |
| Quote / reserve / sell | ✓ | ✓ | — | ✓ | — | — | — |
| Return intake | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Inspect return / propose count | ✓ | ✓ | ✓ | — | — | — | — |
| Approve disputed adjustment | ✓ | ✓ | — | — | — | — | — |
| Purchase / supplier management | ✓ | ✓ | — | — | ✓ | — | — |
| Catalog and evidence curation | ✓ | ✓ | — | — | — | ✓ | — |
| Staff invitation/revocation | ✓ | Explicit grant | — | — | — | — | — |
| Read audit | ✓ | ✓ | — | — | — | — | ✓ |

No one may approve their own disputed adjustment. Any difference between this intended matrix and implementation must be documented and tested rather than assumed. Optional accountant role can be introduced as a distinct reviewed permission set; it must not inherit owner access.

## Privacy and secrets

Only synthetic names/emails are used in local evidence. Credentials are generated locally and ignored by Git. Logs must exclude passwords, session cookies, TOTP seeds and personal supplier/customer fields. No real customer, VIN, registration plate or staff identity is needed for Phase 1 demonstrations. Production retention, access requests, backup encryption, hosting region, staff MFA enrollment/recovery and incident routing need company-approved configuration.
