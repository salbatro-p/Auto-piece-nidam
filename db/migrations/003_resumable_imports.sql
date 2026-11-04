CREATE TABLE bulk_import_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations,
 source_id uuid NOT NULL REFERENCES sources, created_by uuid NOT NULL REFERENCES staff_users,
 total integer NOT NULL CHECK(total BETWEEN 1 AND 100000), file_hash text NOT NULL, uploaded integer NOT NULL DEFAULT 0,
 processed integer NOT NULL DEFAULT 0, error_count integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'UPLOADING' CHECK(status IN ('UPLOADING','PREVIEW','INVALID','COMMITTING','PAUSED','COMMITTED','REVERTED')),
 last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(processed<=uploaded AND uploaded<=total)
);
CREATE INDEX bulk_import_pending ON bulk_import_jobs(created_at) WHERE status='COMMITTING';
CREATE TABLE bulk_import_rows (
 job_id uuid NOT NULL REFERENCES bulk_import_jobs, row_number integer NOT NULL,
 sku text, data jsonb, error_code text, product_id uuid REFERENCES products,
 PRIMARY KEY(job_id,row_number)
);
CREATE INDEX bulk_import_sku ON bulk_import_rows(job_id,sku);
CREATE INDEX bulk_import_unprocessed ON bulk_import_rows(job_id,row_number) WHERE product_id IS NULL;
CREATE FUNCTION guard_import_product() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM bulk_import_rows r JOIN bulk_import_jobs j ON j.id=r.job_id WHERE r.product_id=OLD.id AND j.status IN ('COMMITTING','PAUSED')) THEN
  RAISE EXCEPTION 'IMPORT_IN_PROGRESS' USING ERRCODE='23514';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER guard_import_product_update BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION guard_import_product();
CREATE INDEX bulk_import_product ON bulk_import_rows(product_id) WHERE product_id IS NOT NULL;
