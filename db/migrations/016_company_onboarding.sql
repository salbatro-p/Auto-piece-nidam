ALTER TABLE organizations ADD COLUMN workspace_kind text NOT NULL DEFAULT 'unclassified'
  CHECK (workspace_kind IN ('unclassified','demo','company'));

UPDATE organizations SET workspace_kind='demo'
WHERE id='00000000-0000-4000-8000-000000000001' AND name='AutoParts Morocco — ISOLATED DEMO';

-- The offline installer can issue the first owner's invitation before a staff actor exists.
ALTER TABLE invitations ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE invitations ADD CONSTRAINT bootstrap_inviter CHECK (created_by IS NOT NULL OR role='owner');
CREATE UNIQUE INDEX one_initial_owner_invitation ON invitations(org_id) WHERE created_by IS NULL;
