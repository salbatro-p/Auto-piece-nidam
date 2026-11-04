CREATE TABLE manufacturers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES organizations,name text NOT NULL,UNIQUE(org_id,name));
CREATE TABLE manufacturer_parts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),manufacturer_id uuid NOT NULL REFERENCES manufacturers,part_number text NOT NULL,UNIQUE(manufacturer_id,part_number));
ALTER TABLE products ADD COLUMN manufacturer_part_id uuid REFERENCES manufacturer_parts;
ALTER TABLE products ADD COLUMN company_metadata jsonb NOT NULL DEFAULT '{}';
CREATE TABLE product_replacements(product_id uuid NOT NULL REFERENCES products,replacement_id uuid NOT NULL REFERENCES products,source_id uuid NOT NULL REFERENCES sources,evidence text NOT NULL,reviewed_by uuid NOT NULL REFERENCES staff_users,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(product_id,replacement_id),CHECK(product_id<>replacement_id));
