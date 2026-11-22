# Local Phase 1 acceptance · 22 November 2026

**Local Windows software trials passed. The company pilot still requires an employee, the shop devices, opening counts and accounting approval.** Business runs against PostgreSQL with one stock ledger. The public Shop remains Phase 2. No hosting is required for the local gates below.

The starting main revision was `2c1e8c8ea69993ed50a7292c4999e90db4c1d6a9`. The accepted feature tree is `31a49a598ee15202e2a5ad50be8043f97150c0f8`. The UI captures use the same Business UI and translations as that tree. Subsequent changes to the backup command concern passphrase handling. GitHub’s merge record identifies the final main revision. Post-merge browser results are recorded against that revision on the acceptance pull request.

## A · Local software

| Gate | Status | Executed evidence |
|---|---|---|
| Source reconciliation | PASS | Initially C was clean and ten commits behind main. The D drawing branch was one merge commit behind with the same source tree. Its uncommitted browser report was copied and its hash compared. A new D worktree was created from remote main and a standalone source bundle verified. |
| Clean company installation | PASS | Created a new Windows PostgreSQL cluster using the installer in a directory containing a space. Separate application role without superuser, createdb or createrole. Applied migrations 001–016. Company setup issued an owner ticket. A separate, initially empty QA company hosted the counter trials. |
| Owner and team onboarding | PASS | From Chromium, the owner activated the ticket, enrolled MFA, signed in, issued invitations for sales, warehouse and manager. Each accepted and signed in. Production-mode cookie attributes checked. Logout invalidated the session. |
| Bootstrap and seed protection | PASS | A second bootstrap, renewal after activation and demo seeding on the disposable company were rejected. Before and after counts matched for organizations, products, users and invitations. Owner login without MFA was refused. |
| Authorization | PASS | Exercised real API sessions for all four roles. Only the owner could invite staff. Neither sales nor warehouse could create catalog products. Sales could sell and could not receive stock or see reconciliation. Warehouse received stock, transferred bins and was denied a sale. Manager approved opening stock and could reconcile. |
| Catalog size and opening stock | PASS | 447 translated merchandise types × 24 synthetic variants = 10,728 active training references, 648,996 counted units, 24 named shelves across two warehouses. The warehouse account submitted opening previews, the manager approved them. Generated prices and quantities serve training. |
| Product and evidence | PASS | Added a real NGK CR9EK reference. The NGK branding and CR9EK engraving are visible in the photographer’s image. Recorded source, rights and attribution, staged it for review and approved internal display. Vehicle fitment stayed empty. The third-party photograph is distinct from an original illustration and from proof of stock ownership. [Photographer’s licence record](https://commons.wikimedia.org/wiki/File:Sparkplug3.jpg) |
| Receive, bin, scan, sale | PASS | Received 12 spark plugs with a training unit price of 42.55 MAD. Replaying receipt created one movement. Moved all 12 to a named shelf. Two simultaneous submissions of one sale returned the same ID and left 11. A later keyboard scanner simulation submitted a separate sale and receipt. Warehouse and bin ledgers reconciled. |
| Receipts and translations | PASS | Live company receipt checked at four widths in AR/FR/EN for identical sale ID, persisted timestamp, 4,255 minor units, company identity and unconfigured-tax warning. The Demo sale test explicitly requires the localized demo notice in all three languages. [Arabic receipt](evidence/local-2026-11-22/receipt-320-ar.jpg) |
| Interruption and double submission | PASS | Full browser suite exercised a committed sale with a lost response, draft recovery after an interrupted session, offline shell and retry. Protected data needs a session. New offline sales require connectivity. |
| Database and media recovery | PASS | A fresh encrypted snapshot of the existing preview was restored into another database. All 49 public tables, sequence state, 2,844 file hashes and the environment matched; restored owner login succeeded. The large training company was restored separately with 10,729 products, four accounts, three sales and three content-addressed media files at snapshot time. Restored owner access and the authorized photograph were checked. |
| Portable Windows archive | PASS | Tested AES-256-GCM CMS encryption, decryption, SHA-256 comparison of members, separate database ownership by the application role and restoration using a passphrase-protected key. The native archive includes configuration, TLS material and media. Off-host custody is a separate pilot gate. |
| Windows lifecycle | PASS | Install, Status, Stop, Start and Update exercised on the new dedicated cluster. Fixed a Windows process-tree wait that held the installer after PostgreSQL became ready. The installer now waits for the control process only. [Owner and employee guide](WINDOWS_COMPANY_GUIDE_AR.md) |
| Local search and performance | PASS | 60 real HTTPS queries against the training company mixed a reference, an internal SKU and a broad text lookup. Median 14 ms, p95 20 ms on this workstation. A production build warned that its largest JS chunk exceeded 500 kB before gzip. These measurements cover this load and machine. |
| Responsive UI and accessibility | PASS | 13 company states × 4 widths × 3 languages = 156. Tested 320, 390, 1,024 and 1,440 CSS pixels. No horizontal page overflow and no violations reported by the selected axe WCAG 2 A/AA and 2.1 A/AA checks after repairing the language switcher’s accessible name. [Measurements and individual hashes](evidence/local-2026-11-22/screen-checks.json) · [Full screenshots](evidence/local-2026-11-22/full-screens.zip) |
| Owner activation display | PASS | Checked the ticket and MFA enrolment dialogs on the separate fresh Windows company, in AR/FR/EN at all four widths. All 24 checks preserved the pending values, used the expected direction and recorded zero selected axe findings or horizontal overflow. Screenshots mask the ticket, email, password and MFA fields. [Contact sheet](evidence/local-2026-11-22/owner-activation.jpg) · [Screenshots and individual hashes](evidence/local-2026-11-22/owner-activation.zip) |
| Build and regression | PASS | Windows Node 24.16.0. Type checking, production build, 57 core/API tests and 27 Chromium tests passed. Three strengthened receipt/accessibility tests passed independently. The final main run has its own SHA in the pull-request record. [Local results](evidence/local-2026-11-22/results.json) |

## B · Actual shop pilot

| Gate | Status | Completion evidence required |
|---|---|---|
| Physical tablet, keyboard scanner and printer | NOT TESTED | An employee completes a sale and reprint at the counter using the intended equipment. Check camera permissions, reader suffix, receipt margins and glare. |
| Host, private Wi-Fi and trusted HTTPS on devices | BLOCKED | Select the always-on machine and its network name or IP, install the verified public certificate on each device and test from the shop network. Loopback TLS and the separate CI network rehearsal have run. |
| Opening stock and rights for AAA’s goods | BLOCKED | Owner supplies or counts physical stock by location and authorizes the relevant photographs. The measured BMW drawing and the real NGK reference demonstrate two different workflows. |
| Legal/accounting wording and tax | BLOCKED | Accountant reviews MAD tax settings, receipt wording and the intended official accounting document. |
| Staff terminology, usability and assistive technology | NOT TESTED | Arabic, French and English strings and direction were exercised in software. A staff member must review shop terminology and perform a real sale. VoiceOver, TalkBack and outdoor readability require physical testing. |
| Recovery after loss of the host | NOT TESTED | Copy the encrypted backup to a second device, verify its hash and arrange independent custody of the recovery key. A second database and private directory on this computer have been tested. |

## C · Public Shop and global catalog

| Gate | Status | Scope |
|---|---|---|
| Public Shop checkout, payments, deliveries and customer notifications | NOT TESTED | Public Shop Phase 2 has a separate release. Business Phase 1 uses the authoritative stock backend. |
| Complete worldwide fitment, photos and manufacturer geometry | BLOCKED | Requires licensed sources, exact references and variant-specific verification. The training assortment gives no OEM or vehicle-year guarantees. |

## Four-perspective review

- **Engineering and reliability.** Owner creation, invitation consumption, receipts, authorization, stock movements and backup restoration were exercised against real PostgreSQL. The stricter receipt checks preserve the demo/company distinction. Release files, private training credentials and backup archives live separately.
- **Counter and warehouse.** The counter sale resolved the scanned reference, produced one saved amount and reduced a reconciled bin balance. Operators with access to multiple warehouses need to check the visible warehouse before scanning. Repeating a pending sale resolves its original result.
- **Accessibility and information architecture.** On 320 px the page keeps the language selector visible in both the workspace and dialogs. A voice-control mismatch between visible “AR” and the switcher name was found and corrected. A small screen requires vertical scrolling in the product and receipt dialogs. Dense audit tables scroll inside their own regions. [320 px Arabic](evidence/local-2026-11-22/320-ar.jpg) · [390 px French](evidence/local-2026-11-22/390-fr.jpg)
- **Visual design.** Reviewed all twelve language/viewport contact sheets. Warm ivory and champagne identify the workspace, dark controls identify primary actions, and the receipt gives the amount its own high-contrast line. The catalog identifies the exact photograph and its source. Source captions, references and secondary text remain priorities for the physical glare and print trial. [Tablet English](evidence/local-2026-11-22/1024-en.jpg) · [Desktop Arabic](evidence/local-2026-11-22/1440-ar.jpg)

## Evidence handling and rollback

The screenshots contain fictional company activity. The NGK photograph is by Ren206, with crop and colour edits by Soerfm, and was obtained from Wikimedia’s 250 px preview under the photographer’s public-domain release. The full-size endpoint rate-limited this workstation. No supplier photograph was substituted. [Source record](https://commons.wikimedia.org/wiki/File:Sparkplug3.jpg)

The pre-change source bundle and verified encrypted inventory archive are retained in the private D workspace. Use the separate-directory restore procedure and compare the recovered database, source and media before any cutover. The tests did not seed or restore over the original inventory. The original local Demo remains available at http://127.0.0.1:4175/ .
