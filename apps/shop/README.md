# AutoParts Shop — Phase 2 boundary

No public storefront is released in Phase 1. This application will have its own customer identity, build, session cookie, routes and deployment. It may use only public projections and the shared API's inventory domain. It must never copy authoritative inventory or import the Business UI's staff-only bundles.

Reuse packages/i18n primitives with separate public message bundles. The AR/FR/EN top-header selector, safe cart/checkout switching, Arabic RTL, publication rights and translation approval are mandatory release gates. Checkout must use the existing transactional reservation service; adding a cart line must not reserve stock.
