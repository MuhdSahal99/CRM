CREATE TYPE "public"."vat_category" AS ENUM('standard', 'zero_rated', 'exempt');--> statement-breakpoint
CREATE TABLE "vat_rates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"category" "vat_category" NOT NULL,
	"rate" numeric(7, 4) NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "vat_rates_org_category_from_key" UNIQUE("org_id","category","effective_from"),
	CONSTRAINT "vat_rates_category" CHECK ("vat_rates"."category" IN ('standard', 'zero_rated')),
	CONSTRAINT "vat_rates_rate_range" CHECK ("vat_rates"."rate" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "vat_rates" ADD CONSTRAINT "vat_rates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vat_rates" ADD CONSTRAINT "vat_rates_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Hand-written (T6.02, US-08). Append-only like timeline_events: SELECT and INSERT only, and only an Admin inserts.
-- created_by/created_at come from the context whatever the caller sends.
CREATE FUNCTION app.vat_rates_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_at := now(); NEW.created_by := NULLIF(current_setting('app.user_id', true), '')::uuid;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER vat_rates_audit BEFORE INSERT ON vat_rates FOR EACH ROW EXECUTE FUNCTION app.vat_rates_audit();--> statement-breakpoint
GRANT SELECT, INSERT ON vat_rates TO crm_app;--> statement-breakpoint
ALTER TABLE vat_rates ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE vat_rates FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON vat_rates TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
CREATE POLICY admin_only_insert ON vat_rates AS RESTRICTIVE FOR INSERT TO crm_app WITH CHECK (current_setting('app.role', true) = 'admin');
