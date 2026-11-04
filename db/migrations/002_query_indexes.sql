-- Additive indexes for tenant boundaries, expiry jobs, audit and exact identifiers.
CREATE INDEX fitments_variant_status ON fitments(vehicle_id,status,product_id);
CREATE INDEX balances_org_warehouse ON inventory_balances(org_id,warehouse_id,product_id);
CREATE INDEX sales_org_created ON sales(org_id,created_at DESC);
CREATE INDEX movements_org_created ON stock_movements(org_id,created_at DESC);
CREATE INDEX audit_org_created ON audit_events(org_id,id DESC);
CREATE INDEX reservations_expiring ON reservations(expires_at) WHERE status='ACTIVE';
CREATE INDEX outbox_unprocessed ON outbox_events(created_at) WHERE processed_at IS NULL;
CREATE UNIQUE INDEX staff_email_case_insensitive ON staff_users(lower(email));
