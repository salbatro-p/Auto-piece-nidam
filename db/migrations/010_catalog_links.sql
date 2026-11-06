ALTER TABLE supplier_items ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE supplier_items ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE product_replacements ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE product_replacements ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE INDEX product_replacements_target ON product_replacements(replacement_id) WHERE active;
