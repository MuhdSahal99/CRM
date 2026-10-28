CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "exchange_rates_org_currency_from_key" UNIQUE("org_id","currency","effective_from"),
	CONSTRAINT "exchange_rates_not_base" CHECK ("exchange_rates"."currency" <> 'OMR'),
	CONSTRAINT "exchange_rates_rate_positive" CHECK ("exchange_rates"."rate" > 0)
);
--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Hand-written (T6.03, US-09). Append-only; only an Admin inserts; created_by/created_at come from the context.
ALTER TABLE exchange_rates ADD CONSTRAINT exchange_rates_currency_fk FOREIGN KEY (org_id, currency) REFERENCES currencies (org_id, code) ON DELETE RESTRICT;--> statement-breakpoint
CREATE FUNCTION app.exchange_rates_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_at := now(); NEW.created_by := NULLIF(current_setting('app.user_id', true), '')::uuid;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER exchange_rates_audit BEFORE INSERT ON exchange_rates FOR EACH ROW EXECUTE FUNCTION app.exchange_rates_audit();--> statement-breakpoint
GRANT SELECT, INSERT ON exchange_rates TO crm_app;--> statement-breakpoint
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE exchange_rates FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON exchange_rates TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
CREATE POLICY admin_only_insert ON exchange_rates AS RESTRICTIVE FOR INSERT TO crm_app WITH CHECK (current_setting('app.role', true) = 'admin');
