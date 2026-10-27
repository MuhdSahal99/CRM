-- Slice 1 / T1.05. Tenant isolation for crm_app (ADR-0003) and the helpers every later policy uses.

CREATE SCHEMA app;--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO crm_app;--> statement-breakpoint

-- The org of the current transaction, or NULL. A set_config(..., true) value reads back as '' (not NULL) on the
-- same connection once its transaction ends, and ''::uuid raises; NULLIF makes "no context" match no row.
CREATE FUNCTION app.org_id() RETURNS uuid LANGUAGE sql STABLE
  RETURN NULLIF(current_setting('app.org_id', true), '')::uuid;--> statement-breakpoint

-- Owners the current user may see: self plus all reports (ADR-0005). NULL when unset, so ANY() matches nothing.
CREATE FUNCTION app.visible_owner_ids() RETURNS uuid[] LANGUAGE sql STABLE
  RETURN string_to_array(NULLIF(current_setting('app.visible_owner_ids', true), ''), ',')::uuid[];--> statement-breakpoint

-- Same predicate on read and write: crm_app can neither see nor create another org's rows.
CREATE POLICY tenant_isolation ON member TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
CREATE POLICY tenant_isolation ON invitation TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
-- orgs is keyed by id and read-only for crm_app (no write grant either).
CREATE POLICY tenant_isolation ON orgs FOR SELECT TO crm_app USING (id = app.org_id());
