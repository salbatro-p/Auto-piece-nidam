ALTER TABLE sources ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TABLE translation_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products,
 locale text NOT NULL CHECK(locale IN ('ar','fr','en')), product_version integer NOT NULL,
 reviewer_id uuid NOT NULL REFERENCES staff_users, note text NOT NULL, content_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_translation_reviews BEFORE UPDATE OR DELETE ON translation_reviews FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
