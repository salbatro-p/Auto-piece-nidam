CREATE TABLE catalog_feed_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations,
  source_id uuid NOT NULL REFERENCES sources,
  source_version integer NOT NULL,
  dataset_version text NOT NULL,
  snapshot_sha256 text NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'STAGED' CHECK (state IN ('STAGED','RUNNING','PAUSED','COMPLETE')),
  total integer NOT NULL,
  checkpoint integer NOT NULL DEFAULT 0 CHECK (checkpoint >= 0),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_by uuid NOT NULL REFERENCES staff_users,
  approved_by uuid REFERENCES staff_users,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (org_id, source_id, source_version, snapshot_sha256)
);
CREATE INDEX catalog_feed_work ON catalog_feed_jobs(created_at) WHERE state='RUNNING';

CREATE TABLE catalog_feed_rows (
  job_id uuid NOT NULL REFERENCES catalog_feed_jobs,
  row_number integer NOT NULL,
  contents jsonb NOT NULL,
  outcome text NOT NULL DEFAULT 'STAGED' CHECK (outcome IN ('STAGED','ACCEPTED','DUPLICATE','CONFLICT','REJECTED')),
  error_code text,
  PRIMARY KEY (job_id, row_number)
);
CREATE INDEX catalog_feed_pending ON catalog_feed_rows(job_id,row_number) WHERE outcome='STAGED';

-- Source observations stay distinct from sellable products, fitment variants, and stock.
CREATE TABLE catalog_feed_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations,
  source_id uuid NOT NULL REFERENCES sources,
  source_version integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('MODEL_YEAR','VEHICLE_VARIANT','PART_REFERENCE')),
  external_id text NOT NULL,
  contents jsonb NOT NULL,
  job_id uuid NOT NULL REFERENCES catalog_feed_jobs,
  row_number integer NOT NULL,
  UNIQUE (org_id,source_id,source_version,kind,external_id),
  FOREIGN KEY (job_id,row_number) REFERENCES catalog_feed_rows(job_id,row_number)
);
CREATE INDEX catalog_feed_references_lookup ON catalog_feed_references(org_id,kind,external_id);

CREATE TABLE original_visual_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations,
  category text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('CATEGORY_3D','SYSTEM_DIAGRAM')),
  template text NOT NULL CHECK (template IN ('OIL_FILTER','DISC_BRAKE')),
  provider text NOT NULL,
  template_version integer NOT NULL,
  license_id uuid NOT NULL REFERENCES media_source_licenses,
  license_version integer NOT NULL,
  state text NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED','FAILED','REVIEW_REQUIRED','APPROVED_INTERNAL','REJECTED')),
  object_key text,
  display_key text,
  thumbnail_key text,
  checksum text,
  dimensions jsonb,
  last_error text,
  attempts integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES staff_users,
  created_at timestamptz NOT NULL DEFAULT now(),
  rendered_at timestamptz,
  reviewed_by uuid REFERENCES staff_users,
  reviewed_at timestamptz,
  UNIQUE (org_id,category,kind,template,provider,template_version,license_id,license_version)
);
CREATE INDEX original_visual_work ON original_visual_jobs(created_at) WHERE state='QUEUED';
CREATE INDEX original_visual_category ON original_visual_jobs(org_id,category,kind,reviewed_at DESC) WHERE state='APPROVED_INTERNAL';
