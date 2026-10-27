-- Slice 1 / T1.03. Runs as crm_owner (the database owner); roles come from bootstrap/01-roles.sh.
-- Both extensions are trusted, so the database owner can install them without a superuser.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
-- App roles may use objects in public but never create them (ADR-0003). Table grants are explicit per migration.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO crm_app, crm_auth;
