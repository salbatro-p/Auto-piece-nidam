# Catalog sources, illustrations and verified fitment

## Try the sample

1. Sign into Business as an owner. In **Vehicles → Sources**, register an internal source named **NHTSA vPIC · US model-year references** with origin `https://vpic.nhtsa.dot.gov/api/`. Use the [vPIC FAQ](https://vpic.nhtsa.dot.gov/api/Home/Index/FAQ) as the rights evidence. Permit storage and internal display for these factual fields. Leave store redistribution disabled.
2. In **Imports → Catalog reference imports**, choose that source and open `samples/vpic-honda-2020.json`. Review the six rows and approve processing.
3. In **Vehicles → Source references**, search for Honda or Civic. These are US model-year reference entries. The verified vehicle filter in the main parts catalog continues to use reviewed exact variants and fitment evidence.

The reusable connector fetches one official model-year response and retains the original response hash, endpoint and retrieval time in the manifest:

```powershell
node scripts/fetch-vpic-sample.mjs Honda 2020 output.json
```

The file must be new. The connector does not call a vehicle/parts website beyond the named NHTSA API. For large recurring imports, use authorized exports and observe provider quotas. The [source register](SOURCE_LICENSE_REGISTER.md) records provider scope and open decisions.

## Reference import and review

The JSON manifest has `datasetVersion` and up to 500 `rows`. Optional `endpoint`, `retrievedAt` and `rawSha256` are kept together when present. Row types are documented in the [strict server schema](../apps/api/src/catalog-feeds.ts). Use `MODEL_YEAR` for make/model/year only, `VEHICLE_VARIANT` for supplied configuration details, and `PART_REFERENCE` for manufacturer part identities. Keep market and identifiers intact. Use the existing product imports for sellable SKU records and the existing fitment review workflow for exact compatibility.

Preview records invalid rows before approval. The background worker commits up to 50 valid rows per checkpoint. Retrying an identical source snapshot reopens the same job. An unchanged source identity in another snapshot is counted as duplicate. A changed observation for the same identity and source version is retained for review as a conflict. It does not replace the accepted record. A paused job shows its last error and can resume once the original source and operator permissions are available. A new license version requires restaging with that license version. Approved reference records are hidden from the browse view if source rights change or are revoked.

## Visual assets

- **Exact product first.** Open a product, select **Add photos**, confirm the exact SKU/manufacturer reference, use the device camera or choose the file, and attach the correct license. Use distinct photo angles and review visibility and applicability before approval.
- **Supplier media.** Register the supplier's actual permission and source version before using the existing bulk photo upload. Keep exact product and territory scope, attribution, and rights evidence together.
- **Original visuals.** In **Catalog → Illustrations and diagrams**, select the category, visual type, suitable component template and current company rights record. Queue the render, review the image, record a note and approve internal display. The existing **Photo collection** action opens **Image licenses**, where an internal company record can be created for the original work.
- **Fallback.** A category drawing appears in a separately labeled gallery section when an approved exact photo is missing. General diagrams have a separate label and explanatory legend. Reviewers can reject unsuitable visuals or withdraw their license without touching product or stock data. Category visuals never acquire a product verification or fitment status.

Templates cover an oil filter and a disc brake. They render locally with no API subscription or generation fee. They illustrate a family or system and do not reproduce model geometry. The provider boundary supports replacements, but no paid AI adapter, engineering/CAD dataset, or paid provider charging/replay guarantee has been configured.

## Recovery and Shop

Migration 015 adds reference staging and visual job tables. Existing inventory tables are untouched. The restore drill now includes these new tables and file keys. To roll back the app locally, run the prior app revision from a separate directory using the preserved source and test database. Restore database and private media into new paths for validation. Preserve current business records and reconcile any activity after the checkpoint before switching databases. Keep additive tables if rolling back just the application build.

Public Shop remains a distinct later application. Private visual and reference endpoints require a Business session. Future publication must explicitly recheck asset rights and the product's publication and fitment evidence. See the [Shop boundary](PHASE2_READINESS.md).
