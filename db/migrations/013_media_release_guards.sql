ALTER TABLE product_media ADD COLUMN reviewed_license_version integer;
CREATE OR REPLACE VIEW usable_internal_media AS
 SELECT m.*
 FROM product_media m JOIN media_source_licenses l ON l.id=m.license_id AND l.org_id=m.org_id
 LEFT JOIN sources s ON s.id=l.source_id LEFT JOIN products p ON p.id=m.product_id
 LEFT JOIN manufacturer_parts mp ON mp.id=p.manufacturer_part_id LEFT JOIN vehicles v ON v.id=m.vehicle_variant_id
 WHERE m.state IN ('APPROVED_INTERNAL','APPROVED_PUBLIC') AND m.object_key IS NOT NULL
 AND m.reviewed_license_version=l.version
 AND l.internal_display_permitted AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at>now())
 AND (l.source_id IS NULL OR (s.org_id=m.org_id AND s.can_store AND s.can_display))
 AND (m.product_id IS NULL OR (p.org_id=m.org_id AND p.status<>'ARCHIVED'))
 AND (m.vehicle_variant_id IS NULL OR (v.org_id=m.org_id
   AND (NOT m.applicability ? 'engine' OR m.applicability->>'engine'=v.engine)
   AND (NOT m.applicability ? 'equipment' OR m.applicability->>'equipment'=v.equipment)))
 AND (m.kind NOT IN ('EXACT_PRODUCT_PHOTO','COMPANY_ORIGINAL_PHOTO') OR
   (m.sku_snapshot=p.sku AND m.manufacturer_brand=p.brand AND m.manufacturer_part_number=mp.part_number AND m.manufacturer_part_number<>''))
 AND (m.product_id IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p.company_metadata->'technicalAttributes','[]')) a
   WHERE lower(a->>'code') IN ('side','axle') AND m.applicability ? lower(a->>'code')
   AND upper(a->>'value')<>upper(m.applicability->>lower(a->>'code'))))
 AND (m.product_id IS NULL OR m.vehicle_variant_id IS NULL OR EXISTS(SELECT 1 FROM fitments f JOIN sources fs ON fs.id=f.source_id
   WHERE f.product_id=m.product_id AND f.vehicle_id=m.vehicle_variant_id AND f.status='VERIFIED' AND fs.org_id=m.org_id AND fs.can_store));
CREATE VIEW usable_public_media AS SELECT m.* FROM usable_internal_media m
 JOIN media_source_licenses l ON l.id=m.license_id LEFT JOIN sources s ON s.id=l.source_id
 WHERE m.state='APPROVED_PUBLIC' AND l.public_display_permitted AND (l.source_id IS NULL OR s.can_syndicate);
