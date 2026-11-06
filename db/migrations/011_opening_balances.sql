CREATE UNIQUE INDEX opening_approval_unique ON business_documents(org_id,reference) WHERE kind='OPENING_BALANCE';
