# AutoParts Business — expert visual, UX and engineering design review
**Audit scope:** Main at `a6207c77890e`, candidate PR #3, 19 November 2026. This review uses checked source code and captured owner/POS/product-details tablet and phone screens, not a real-store usability study.

## Executive judgement
This is **not yet a provably #1 world-class automotive business product**. Previous designs successfully covered critical inventory/POS tasks but the language bar used roughly the visual weight of a primary navigation feature and forced the phone header into two rows. SKU product photography is largely synthetic or absent. Some modal/product metadata and footnotes are too small, and heavy dashboard imagery pushes operational signals down the page.

## Art direction: design the workshop operating system, not a generic SaaS page
- **Character:** refined automotive technical interface, precise, warm and trusted. Original industrial/mechanical illustration is allowed as decoration, never as proof of exact parts.
- **Palette:** deep naval graphite for persistent navigation, near-white content canvas, teal for main action/success, amber for caution, blue for vehicle information; reserve red strictly for destructive/error states. Avoid gratuitous gradients and rainbow status colors.
- **Typography:** system UI with Arabic-capable fallbacks; minimum comfortable body and form size; important SKU/OEM identifiers use legible isolated LTR/bidi text and adequate copy affordances. Avoid decorative Latin tracking on Arabic.
- **Composition:** one strong focal point per screen. Owner Overview may use imagery, but POS/inventory must be content-first. Responsive header must not consume an extra row to show three language options.
- **Images:** verified exact-SKU photography first, licensed supplier media second, explicitly labeled generic illustration/placeholder when exact image unavailable. No auto-generated SKU photography or invented fitment.

## Concrete diagnosis and remediation
| Priority | Observation | Change / acceptance |
|---|---|---|
| P0 | Oversized full-width language bar in header and modal, especially mobile; app looks like a text-heavy configuration page. | PR #3 compact globe + AR/FR/EN control, open popup with full language names, 44px target, Escape/outside close, one-row 70px phone header. |
| P0 | AR/FR/EN switching cannot interrupt drafts, sales, cart or media upload. | Reuse existing `switchLocale` state/persistence; validate across login/POS/gallery and all three directions through Playwright. |
| P0 | Product details have overly small technical labels and unclear visual grouping. | In PR #3 increase field label/values and group SKU photo, technical facts, stock figures; do not imply placeholder is exact photo. |
| P0 | POS needs immediate search, large add actions, legible price and clearly distinguished stock states. | Refine cards/cart/type scale; run a real SKU→sale workflow and measure time, no accidental duplicate sales. |
| P1 | Hero illustration is attractive but pushes operational alerts below the fold at 800px. | Offer owner/user-selectable compact operating mode in a follow-up PR; keep keyboard search and one-click POS. Measure above-the-fold metrics at 1280×800. |
| P1 | Styling spans `styles.css`, `refinements.css`, `workspace.css`, `premium.css`. | Consolidate semantic tokens and component variants to reduce selector specificity debt; snapshot-test all major screen sizes. |
| P1 | Supplier/photo/fitment content does not represent real company stock. | Collect licensed real company photos, SKU catalog and exact fitment evidence; expose verified/unverified rather than fill spaces with fake images. |
| P1 | Local preview is not publicly reachable HTTPS staging. | Stage using isolated database, private storage and hardened auth after approved host/DNS access; do not deploy production automatically. |
| P2 | Automated viewport tests are not physical device accessibility/usability testing. | Test actual counter tablet, barcode scanner, label printer, warehouse phone, Arabic mixed-direction labels and two staff roles. |

## Engineering review
- Keep single inventory authority and transaction idempotency; no UI changes may alter sell/receive counts or MFA.
- Use semantic accessible controls, native keyboard navigation, visible focus, touch targets >= 44px, contrast WCAG AA with appropriate font size.
- Maintain RTL-aware logical properties for popover placement and button ordering.
- Preserve offline/reconnect warnings and lock overlay when reducing header height.
- No reliance on remote unlicensed fonts, logos or SKU images in the critical UI.
- Evidence gates: typecheck, build, 48+ existing API tests, browser AR/FR/EN regression, 320/390/1280 screenshot analysis, a11y scan, comparative task timing.

## Artistic / product sign-off rubric (do not assign arbitrary numerical 'top 1' rank)
**Legibility:** a shop employee can identify SKU, photo confidence, stock, fitment and sale action without guessing.
**Hierarchy:** no decorative element blocks the primary task; search, cart and quantity are discoverable.
**Trust:** all data/images and confidence states truthful; metadata provenance available.
**Craft:** polished spacing, consistent radii/typography, refined hover/focus/empty/error states, smooth but subdued feedback.
**Efficiency:** routine counter workflows require the fewest reasonable steps with no hidden actions.
**Internationalization:** Arabic RTL is designed, not merely mirrored; keyboard and mixed Latin numbers remain robust.

## Final release gate
PR #3 may merge only after its current head has passing CI and final browser screenshots reviewed. Production readiness requires external HTTPS staging + real user/data acceptance separately. These remain **not done** until evidence exists.
