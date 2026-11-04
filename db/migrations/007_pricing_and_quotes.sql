ALTER TABLE organizations ADD COLUMN tax_rate_bps integer NOT NULL DEFAULT 0 CHECK(tax_rate_bps BETWEEN 0 AND 10000);
ALTER TABLE organizations ADD COLUMN tax_inclusive boolean NOT NULL DEFAULT false;
ALTER TABLE organizations ADD COLUMN tax_configured boolean NOT NULL DEFAULT false;
ALTER TABLE organizations ADD COLUMN tax_version integer NOT NULL DEFAULT 1;
ALTER TABLE sales ADD COLUMN subtotal_minor bigint NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN tax_minor bigint NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN tax_rate_bps integer NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN tax_inclusive boolean NOT NULL DEFAULT false;
ALTER TABLE sales ADD COLUMN tax_configured boolean NOT NULL DEFAULT false;
UPDATE sales SET subtotal_minor=total_minor;
CREATE TABLE quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES organizations,
 warehouse_id uuid NOT NULL REFERENCES warehouses,actor_id uuid NOT NULL REFERENCES staff_users,
 locale text NOT NULL CHECK(locale IN ('ar','fr','en')),reference text NOT NULL DEFAULT '',
 data jsonb NOT NULL,status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CANCELLED')),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL
);
