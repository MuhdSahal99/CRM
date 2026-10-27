CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"owner_id" uuid NOT NULL,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"zoho_id" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"salutation" varchar(20),
	"first_name" varchar(40),
	"last_name" varchar(80) NOT NULL,
	"company" varchar(100) NOT NULL,
	"designation" varchar(100),
	"email" "citext",
	"secondary_email" "citext",
	"phone" varchar(30),
	"fax" varchar(30),
	"mobile" varchar(16),
	"website" varchar(120),
	"lead_source" varchar(60),
	"lead_status" varchar(60),
	"industry" varchar(60),
	"rating" varchar(60),
	"annual_revenue" numeric(18, 3),
	"no_of_employees" integer,
	"email_opt_out" boolean DEFAULT false NOT NULL,
	"street" varchar(250),
	"city" varchar(30),
	"state" varchar(30),
	"zip_code" varchar(30),
	"country" char(2),
	"description" text,
	"is_converted" boolean DEFAULT false NOT NULL,
	"converted_at" timestamp with time zone,
	"converted_by" uuid,
	"converted_account_id" uuid,
	"converted_contact_id" uuid,
	"converted_deal_id" uuid,
	CONSTRAINT "leads_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "leads_mobile_e164" CHECK ("leads"."mobile" ~ '^[+][1-9][0-9]{6,14}$'),
	CONSTRAINT "leads_email_length" CHECK (char_length("leads"."email") <= 100 AND char_length("leads"."secondary_email") <= 100),
	CONSTRAINT "leads_employees_nonneg" CHECK ("leads"."no_of_employees" >= 0),
	CONSTRAINT "leads_description_length" CHECK (char_length("leads"."description") <= 32000),
	CONSTRAINT "leads_converted_consistent" CHECK ("leads"."is_converted" = ("leads"."converted_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_updated_by_fk" FOREIGN KEY ("org_id","updated_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_fk" FOREIGN KEY ("org_id","owner_id") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_deleted_by_fk" FOREIGN KEY ("org_id","deleted_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_list_idx" ON "leads" USING btree ("org_id","owner_id","updated_at" DESC NULLS LAST) WHERE "leads"."deleted_at" IS NULL AND NOT "leads"."is_converted";--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("org_id",lower("email"));--> statement-breakpoint
CREATE INDEX "leads_name_trgm_idx" ON "leads" USING gin (("company" || ' ' || "last_name") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "leads_zoho_id_key" ON "leads" USING btree ("org_id","zoho_id") WHERE "leads"."zoho_id" IS NOT NULL;

-- Hand-written (T4.01). AC-13: no link into another org. RESTRICT: a converted lead's account and contact stay.
ALTER TABLE leads ADD CONSTRAINT leads_converted_by_fk FOREIGN KEY (org_id, converted_by)
  REFERENCES member (org_id, user_id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE leads ADD CONSTRAINT leads_converted_account_fk FOREIGN KEY (org_id, converted_account_id)
  REFERENCES accounts (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE leads ADD CONSTRAINT leads_converted_contact_fk FOREIGN KEY (org_id, converted_contact_id)
  REFERENCES contacts (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE contacts ADD CONSTRAINT contacts_converted_from_lead_fk FOREIGN KEY (org_id, converted_from_lead_id)
  REFERENCES leads (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
CREATE TRIGGER leads_audit BEFORE INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION app.set_audit_columns();--> statement-breakpoint

-- US-05 / AC-24: a converted lead is frozen, even for direct SQL. Converting is the update that sets is_converted.
CREATE FUNCTION app.leads_converted_readonly() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_converted THEN
    RAISE EXCEPTION 'a converted lead cannot be changed' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER leads_converted_readonly BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION app.leads_converted_readonly();--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON leads TO crm_app;--> statement-breakpoint
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE leads FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON leads TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
-- Private to the owner and their managers (ADR-0005).
CREATE POLICY owner_visibility ON leads AS RESTRICTIVE TO crm_app
  USING (current_setting('app.see_all', true) = 'on' OR owner_id = ANY (app.visible_owner_ids()));--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.can_see(rt record_type, rid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
  RETURN CASE rt
    WHEN 'org' THEN rid = app.org_id()
    WHEN 'user' THEN EXISTS (SELECT 1 FROM member WHERE user_id = rid)
    WHEN 'lead' THEN EXISTS (SELECT 1 FROM leads WHERE id = rid)
    WHEN 'account' THEN EXISTS (SELECT 1 FROM accounts WHERE id = rid)
    WHEN 'contact' THEN EXISTS (SELECT 1 FROM contacts WHERE id = rid)
    WHEN 'activity' THEN EXISTS (SELECT 1 FROM activities WHERE id = rid)
    ELSE false
  END;
