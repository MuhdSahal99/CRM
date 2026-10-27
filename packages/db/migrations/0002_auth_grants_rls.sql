-- Slice 1 / T1.04. Hand-written: what drizzle-kit cannot express for the Better Auth tables.

-- A manager must be a member of the same org (SCHEMA § member). PG15+ column list keeps org_id on delete.
ALTER TABLE member ADD CONSTRAINT member_manager_fk FOREIGN KEY (org_id, manager_id)
  REFERENCES member (org_id, user_id) ON DELETE SET NULL (manager_id);--> statement-breakpoint

-- crm_auth (Better Auth) owns sign-in and membership resolution; it has no grant on any CRM table (ADR-0004).
GRANT SELECT, INSERT, UPDATE, DELETE ON "user", session, account, verification, orgs, member, invitation TO crm_auth;--> statement-breakpoint
-- crm_app never sees credentials or sessions; it reads org-scoped membership only. Writes come with T1.20.
GRANT SELECT ON orgs, member, invitation TO crm_app;--> statement-breakpoint

-- Org-scoped auth tables are RLS-protected like every tenant table (ADR-0003). Better Auth resolves memberships
-- before any org context exists, so crm_auth gets a pass-through policy. crm_app has no policy yet, so it sees
-- zero rows (fail closed) until T1.05 adds tenant_isolation.
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE orgs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE member ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE member FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE invitation ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE invitation FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY auth_access ON orgs TO crm_auth USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY auth_access ON member TO crm_auth USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY auth_access ON invitation TO crm_auth USING (true) WITH CHECK (true);
