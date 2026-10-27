CREATE TABLE "org_settings" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"legal_name" varchar(200) NOT NULL,
	"address_line1" varchar(250),
	"address_line2" varchar(250),
	"city" varchar(30),
	"postal_code" varchar(30),
	"country" char(2) DEFAULT 'OM' NOT NULL,
	"vat_number" varchar(20),
	"base_currency" char(3) DEFAULT 'OMR' NOT NULL,
	"fiscal_year_start_month" smallint DEFAULT 1 NOT NULL,
	"share_link_ttl_days" smallint DEFAULT 7 NOT NULL,
	"smtp_host" text,
	"smtp_port" integer,
	"smtp_username" text,
	"smtp_from_email" text,
	"smtp_from_name" text,
	"smtp_secret_ref" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "org_settings_base_currency" CHECK ("org_settings"."base_currency" = 'OMR'),
	CONSTRAINT "org_settings_fiscal_month" CHECK ("org_settings"."fiscal_year_start_month" BETWEEN 1 AND 12),
	CONSTRAINT "org_settings_ttl" CHECK ("org_settings"."share_link_ttl_days" BETWEEN 1 AND 30),
	CONSTRAINT "org_settings_smtp_port" CHECK ("org_settings"."smtp_port" BETWEEN 1 AND 65535)
);
--> statement-breakpoint
ALTER TABLE "org_settings" ADD CONSTRAINT "org_settings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_settings" ADD CONSTRAINT "org_settings_updated_by_fk" FOREIGN KEY ("org_id","updated_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Hand-written (T6.01). One row per org, created by provisionOrg. Everyone in the org reads it (seller details), only an Admin writes.
-- No created_by column, so not app.set_audit_columns().
CREATE FUNCTION app.org_settings_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now(); NEW.updated_by := NULLIF(current_setting('app.user_id', true), '')::uuid;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER org_settings_audit BEFORE INSERT OR UPDATE ON org_settings FOR EACH ROW EXECUTE FUNCTION app.org_settings_audit();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON org_settings TO crm_app;--> statement-breakpoint
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE org_settings FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON org_settings TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
CREATE POLICY admin_only_insert ON org_settings AS RESTRICTIVE FOR INSERT TO crm_app WITH CHECK (current_setting('app.role', true) = 'admin');--> statement-breakpoint
CREATE POLICY admin_only_update ON org_settings AS RESTRICTIVE FOR UPDATE TO crm_app USING (current_setting('app.role', true) = 'admin');
