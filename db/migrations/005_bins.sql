CREATE TABLE warehouse_bins (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations,
 warehouse_id uuid NOT NULL REFERENCES warehouses, code text NOT NULL,
 is_default boolean NOT NULL DEFAULT false, UNIQUE(warehouse_id,code)
);
CREATE UNIQUE INDEX one_receiving_bin ON warehouse_bins(warehouse_id) WHERE is_default;
CREATE TABLE bin_balances (
 product_id uuid NOT NULL REFERENCES products, bin_id uuid NOT NULL REFERENCES warehouse_bins,
 on_hand integer NOT NULL DEFAULT 0 CHECK(on_hand>=0), quarantine integer NOT NULL DEFAULT 0 CHECK(quarantine>=0),
 damaged integer NOT NULL DEFAULT 0 CHECK(damaged>=0), PRIMARY KEY(product_id,bin_id)
);
CREATE TABLE bin_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations,
 document_id uuid REFERENCES business_documents, product_id uuid NOT NULL REFERENCES products,
 bin_id uuid NOT NULL REFERENCES warehouse_bins, kind text NOT NULL,
 on_hand_delta integer NOT NULL DEFAULT 0, quarantine_delta integer NOT NULL DEFAULT 0,
 damaged_delta integer NOT NULL DEFAULT 0, actor_id uuid REFERENCES staff_users,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bin_ledger_location ON bin_movements(product_id,bin_id);
CREATE TRIGGER immutable_bin_movements BEFORE UPDATE OR DELETE ON bin_movements FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
INSERT INTO warehouse_bins(org_id,warehouse_id,code,is_default) SELECT org_id,id,'RECEIVING',true FROM warehouses;
INSERT INTO bin_balances(product_id,bin_id,on_hand,quarantine,damaged)
 SELECT b.product_id,wb.id,b.on_hand,b.quarantine,b.damaged FROM inventory_balances b JOIN warehouse_bins wb ON wb.warehouse_id=b.warehouse_id AND wb.is_default;
-- Explicit migration snapshot preserves the existing warehouse ledger unchanged.
INSERT INTO bin_movements(org_id,product_id,bin_id,kind,on_hand_delta,quarantine_delta,damaged_delta)
 SELECT wb.org_id,b.product_id,b.bin_id,'BIN_OPENING',b.on_hand,b.quarantine,b.damaged FROM bin_balances b JOIN warehouse_bins wb ON wb.id=b.bin_id;
