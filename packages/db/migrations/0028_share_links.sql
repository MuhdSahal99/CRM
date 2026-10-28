CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"record_type" "record_type" NOT NULL,
	"record_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"last_accessed_at" timestamp with time zone,
	"access_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "share_links_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "share_links_ttl" CHECK ("share_links"."expires_at" > "share_links"."created_at" AND "share_links"."expires_at" <= "share_links"."created_at" + interval '30 days'),
	CONSTRAINT "share_links_token_hash_len" CHECK (octet_length("share_links"."token_hash") = 32)
);
--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_file_fk" FOREIGN KEY ("org_id","file_id") REFERENCES "public"."files"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_revoked_by_fk" FOREIGN KEY ("org_id","revoked_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_links_record_idx" ON "share_links" USING btree ("org_id","record_type","record_id","created_at" DESC);--> statement-breakpoint
-- Hand-written (T9.05, ADR-0009).
CREATE TRIGGER share_links_check_record_ref BEFORE INSERT OR UPDATE OF record_type, record_id ON share_links
  FOR EACH ROW EXECUTE FUNCTION app.check_record_ref('record_type', 'record_id');--> statement-breakpoint
-- crm_app creates links and may only revoke them: the counters belong to the resolver below.
GRANT SELECT, INSERT ON share_links TO crm_app;--> statement-breakpoint
GRANT UPDATE (revoked_at, revoked_by) ON share_links TO crm_app;--> statement-breakpoint
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE share_links FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON share_links TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
CREATE POLICY record_visibility ON share_links AS RESTRICTIVE TO crm_app USING (app.can_see(record_type, record_id));--> statement-breakpoint

-- The only cross-org reader. crm_owner has NOBYPASSRLS and the tables are FORCEd, so the function (owned by crm_owner) needs a policy of its own;
-- it applies to no other role. The function pins search_path, qualifies every table, and returns the least it can: no org id, no record id.
CREATE POLICY resolver ON share_links FOR ALL TO crm_owner USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY resolver ON files FOR SELECT TO crm_owner USING (true);--> statement-breakpoint
CREATE FUNCTION public.resolve_share_link(p_token_hash bytea)
RETURNS TABLE (share_link_id uuid, storage_key text, filename varchar, content_type varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN QUERY
  WITH hit AS (
    UPDATE public.share_links s SET access_count = s.access_count + 1, last_accessed_at = now()
    FROM public.files f
    WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL AND s.expires_at > now()
      AND f.org_id = s.org_id AND f.id = s.file_id AND f.status = 'ready'
    RETURNING s.id, f.storage_key, f.filename, f.content_type
  )
  SELECT hit.id, hit.storage_key, hit.filename, hit.content_type FROM hit;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_share_link(bytea) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_share_link(bytea) TO crm_app;
