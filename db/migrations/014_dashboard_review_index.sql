-- The dashboard queue must not scan all verified catalogue relationships.
CREATE INDEX fitments_pending_review ON fitments(product_id) WHERE status IN ('REVIEW_REQUIRED','SOURCE_CLAIMED');
