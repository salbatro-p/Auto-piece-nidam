CREATE TABLE media_source_licenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES organizations,
 source_id uuid REFERENCES sources,source_type text NOT NULL CHECK(source_type IN ('COMPANY','SUPPLIER','LICENSED_CATALOG','OTHER')),
 name text NOT NULL,terms_version text NOT NULL,proof text NOT NULL,
 internal_display_permitted boolean NOT NULL DEFAULT false,public_display_permitted boolean NOT NULL DEFAULT false,
 attribution_text text NOT NULL DEFAULT '',territory text NOT NULL DEFAULT 'MA',restrictions text NOT NULL DEFAULT '',
 expires_at timestamptz,revoked_at timestamptz,version integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES staff_users,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT public_display_permitted OR internal_display_permitted),CHECK(source_type='COMPANY' OR source_id IS NOT NULL)
);
CREATE INDEX media_licenses_org ON media_source_licenses(org_id);
ALTER TABLE product_media ADD COLUMN org_id uuid REFERENCES organizations;
UPDATE product_media m SET org_id=p.org_id FROM products p WHERE p.id=m.product_id;
ALTER TABLE product_media ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE product_media ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE product_media ALTER COLUMN bytes DROP NOT NULL;
ALTER TABLE product_media ADD COLUMN vehicle_variant_id uuid REFERENCES vehicles;
ALTER TABLE product_media ADD COLUMN kind text NOT NULL DEFAULT 'COMPANY_ORIGINAL_PHOTO' CHECK(kind IN ('EXACT_PRODUCT_PHOTO','COMPANY_ORIGINAL_PHOTO','GENERIC_CATEGORY_ILLUSTRATION','VEHICLE_PHOTO','EXPLODED_DIAGRAM'));
ALTER TABLE product_media ADD COLUMN sku_snapshot text NOT NULL DEFAULT '';
ALTER TABLE product_media ADD COLUMN manufacturer_brand text NOT NULL DEFAULT '';
ALTER TABLE product_media ADD COLUMN manufacturer_part_number text NOT NULL DEFAULT '';
ALTER TABLE product_media ADD COLUMN license_id uuid REFERENCES media_source_licenses;
ALTER TABLE product_media ADD COLUMN source_url text NOT NULL DEFAULT '';
ALTER TABLE product_media ADD COLUMN object_key text;
ALTER TABLE product_media ADD COLUMN thumbnail_key text;
ALTER TABLE product_media ADD COLUMN display_key text;
ALTER TABLE product_media ADD COLUMN content_checksum text;
ALTER TABLE product_media ADD COLUMN view_angle text NOT NULL DEFAULT '';
ALTER TABLE product_media ADD COLUMN dimensions jsonb NOT NULL DEFAULT '{}';
ALTER TABLE product_media ADD COLUMN file_size integer NOT NULL DEFAULT 0;
ALTER TABLE product_media ADD COLUMN state text NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK(state IN ('UNVERIFIED','REVIEW_REQUIRED','APPROVED_INTERNAL','APPROVED_PUBLIC','REJECTED','DISPUTED'));
ALTER TABLE product_media ADD COLUMN reviewed_by uuid REFERENCES staff_users;
ALTER TABLE product_media ADD COLUMN reviewed_at timestamptz;
ALTER TABLE product_media ADD COLUMN review_note text NOT NULL DEFAULT '';
ALTER TABLE product_media ADD COLUMN applicability jsonb NOT NULL DEFAULT '{}';
ALTER TABLE product_media ADD COLUMN illustration_id text NOT NULL DEFAULT '';
ALTER TABLE product_media ADD COLUMN provider text NOT NULL DEFAULT '';
ALTER TABLE product_media ADD COLUMN callouts jsonb NOT NULL DEFAULT '[]';
ALTER TABLE product_media ADD COLUMN version integer NOT NULL DEFAULT 1;
UPDATE product_media m SET sku_snapshot=p.sku,manufacturer_brand=p.brand,manufacturer_part_number=COALESCE(mp.part_number,'') FROM products p LEFT JOIN manufacturer_parts mp ON mp.id=p.manufacturer_part_id WHERE p.id=m.product_id;
ALTER TABLE product_media ADD CONSTRAINT media_subject_required CHECK((kind IN ('EXACT_PRODUCT_PHOTO','COMPANY_ORIGINAL_PHOTO','GENERIC_CATEGORY_ILLUSTRATION') AND product_id IS NOT NULL) OR (kind IN ('VEHICLE_PHOTO','EXPLODED_DIAGRAM') AND vehicle_variant_id IS NOT NULL AND product_id IS NULL));
ALTER TABLE product_media ADD CONSTRAINT media_approved_review CHECK(state NOT IN ('APPROVED_INTERNAL','APPROVED_PUBLIC') OR (license_id IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND object_key IS NOT NULL));
CREATE INDEX media_product_review ON product_media(product_id,state,created_at DESC);
CREATE INDEX media_vehicle_review ON product_media(vehicle_variant_id,state);
CREATE INDEX media_checksum ON product_media(org_id,content_checksum);
CREATE VIEW vehicle_media AS SELECT * FROM product_media WHERE kind='VEHICLE_PHOTO';
CREATE VIEW diagram_media AS SELECT * FROM product_media WHERE kind='EXPLODED_DIAGRAM';
CREATE VIEW usable_internal_media AS
 SELECT m.* FROM product_media m JOIN media_source_licenses l ON l.id=m.license_id AND l.org_id=m.org_id
 LEFT JOIN sources s ON s.id=l.source_id LEFT JOIN products p ON p.id=m.product_id
 LEFT JOIN manufacturer_parts mp ON mp.id=p.manufacturer_part_id
 LEFT JOIN vehicles v ON v.id=m.vehicle_variant_id
 WHERE m.state IN ('APPROVED_INTERNAL','APPROVED_PUBLIC') AND m.object_key IS NOT NULL
 AND l.internal_display_permitted AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at>now())
 AND (l.source_id IS NULL OR (s.org_id=m.org_id AND s.can_store AND s.can_display))
 AND (m.product_id IS NULL OR (p.org_id=m.org_id AND p.status<>'ARCHIVED'))
 AND (m.vehicle_variant_id IS NULL OR v.org_id=m.org_id)
 AND (m.kind NOT IN ('EXACT_PRODUCT_PHOTO','COMPANY_ORIGINAL_PHOTO') OR (m.sku_snapshot=p.sku AND m.manufacturer_brand=p.brand AND m.manufacturer_part_number=mp.part_number AND m.manufacturer_part_number<>''));
CREATE TABLE media_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),media_id uuid NOT NULL REFERENCES product_media,media_version integer NOT NULL,state text NOT NULL,note text NOT NULL,reviewed_by uuid NOT NULL REFERENCES staff_users,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER immutable_media_reviews BEFORE UPDATE OR DELETE ON media_reviews FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TABLE fitment_evidence(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fitment_id uuid NOT NULL REFERENCES fitments,source_id uuid REFERENCES sources,status text NOT NULL,evidence text NOT NULL,qualifiers text NOT NULL DEFAULT '',reviewed_by uuid NOT NULL REFERENCES staff_users,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER immutable_fitment_evidence BEFORE UPDATE OR DELETE ON fitment_evidence FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
INSERT INTO fitment_evidence(fitment_id,source_id,status,evidence,qualifiers,reviewed_by,created_at) SELECT id,source_id,status,COALESCE(evidence,''),qualifiers,reviewed_by,COALESCE(reviewed_at,now()) FROM fitments WHERE reviewed_by IS NOT NULL;
CREATE TABLE image_ingest_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES staff_users,file_hash text NOT NULL,total integer NOT NULL CHECK(total BETWEEN 1 AND 10000),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(org_id,created_by,file_hash));
CREATE TABLE image_ingest_rows(job_id uuid NOT NULL REFERENCES image_ingest_jobs,row_number integer NOT NULL CHECK(row_number>=1),fingerprint text NOT NULL,input jsonb NOT NULL,status text NOT NULL CHECK(status IN ('STAGED','ERROR','DUPLICATE','DISPUTED')),code text,media_id uuid REFERENCES product_media,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(job_id,row_number));
