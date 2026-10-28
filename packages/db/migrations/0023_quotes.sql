CREATE TYPE "public"."discount_type" AS ENUM('percent', 'amount');--> statement-breakpoint
CREATE TYPE "public"."quote_stage" AS ENUM('draft', 'negotiation', 'delivered', 'on_hold', 'confirmed', 'closed_won', 'closed_lost');--> statement-breakpoint
CREATE TABLE "quote_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"line_no" smallint NOT NULL,
	"product_id" uuid NOT NULL,
	"description" text,
	"quantity" numeric(14, 3) NOT NULL,
	"list_price" numeric(18, 3) NOT NULL,
	"discount_type" "discount_type",
	"discount_value" numeric(18, 4),
	"amount" numeric(18, 3) NOT NULL,
	"discount_amount" numeric(18, 3) NOT NULL,
	"net_amount" numeric(18, 3) NOT NULL,
	"vat_category" "vat_category" NOT NULL,
	"vat_rate" numeric(7, 4),
	"vat_amount" numeric(18, 3) NOT NULL,
	"line_total" numeric(18, 3) NOT NULL,
	CONSTRAINT "quote_lines_line_no_key" UNIQUE("org_id","quote_id","line_no"),
	CONSTRAINT "quote_lines_quantity_positive" CHECK ("quote_lines"."quantity" > 0),
	CONSTRAINT "quote_lines_price_nonneg" CHECK ("quote_lines"."list_price" >= 0),
	CONSTRAINT "quote_lines_discount" CHECK ("quote_lines"."discount_value" IS NULL OR ("quote_lines"."discount_value" >= 0 AND ("quote_lines"."discount_type" IS DISTINCT FROM 'percent' OR "quote_lines"."discount_value" <= 100))),
	CONSTRAINT "quote_lines_net" CHECK ("quote_lines"."net_amount" = "quote_lines"."amount" - "quote_lines"."discount_amount"),
	CONSTRAINT "quote_lines_vat" CHECK (("quote_lines"."vat_category" = 'standard' OR "quote_lines"."vat_amount" = 0) AND (("quote_lines"."vat_category" = 'exempt') = ("quote_lines"."vat_rate" IS NULL))),
	CONSTRAINT "quote_lines_total" CHECK ("quote_lines"."line_total" = "quote_lines"."net_amount" + "quote_lines"."vat_amount")
);
--> statement-breakpoint
CREATE TABLE "quotes" (
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
	"subject" varchar(255) NOT NULL,
	"account_id" uuid NOT NULL,
	"contact_id" uuid,
	"deal_id" uuid,
	"billing_street" varchar(250),
	"billing_city" varchar(30),
	"billing_state" varchar(30),
	"billing_code" varchar(30),
	"billing_country" char(2),
	"shipping_street" varchar(250),
	"shipping_city" varchar(30),
	"shipping_state" varchar(30),
	"shipping_code" varchar(30),
	"shipping_country" char(2),
	"terms" text,
	"description" text,
	"currency" char(3) NOT NULL,
	"currency_scale" smallint NOT NULL,
	"exchange_rate" numeric(18, 8) NOT NULL,
	"sub_total" numeric(18, 3) NOT NULL,
	"vat_total" numeric(18, 3) NOT NULL,
	"adjustment" numeric(18, 3) DEFAULT '0' NOT NULL,
	"grand_total" numeric(18, 3) NOT NULL,
	"vat_total_omr" numeric(18, 3) NOT NULL,
	"grand_total_omr" numeric(18, 3) NOT NULL,
	"quote_number" varchar(30) NOT NULL,
	"quote_stage" "quote_stage" DEFAULT 'draft' NOT NULL,
	"valid_till" date,
	CONSTRAINT "quotes_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "quotes_number_key" UNIQUE("org_id","quote_number"),
	CONSTRAINT "quotes_scale" CHECK ("quotes"."currency_scale" IN (2, 3)),
	CONSTRAINT "quotes_rate_positive" CHECK ("quotes"."exchange_rate" > 0),
	CONSTRAINT "quotes_scale_ok" CHECK (round("quotes"."sub_total", "quotes"."currency_scale") = "quotes"."sub_total" AND round("quotes"."vat_total", "quotes"."currency_scale") = "quotes"."vat_total" AND round("quotes"."adjustment", "quotes"."currency_scale") = "quotes"."adjustment" AND round("quotes"."grand_total", "quotes"."currency_scale") = "quotes"."grand_total"),
	CONSTRAINT "quotes_grand_total" CHECK ("quotes"."grand_total" = "quotes"."sub_total" + "quotes"."vat_total" + "quotes"."adjustment"),
	CONSTRAINT "quotes_text_length" CHECK (char_length("quotes"."description") <= 32000 AND char_length("quotes"."terms") <= 32000)
);
--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_fk" FOREIGN KEY ("org_id","quote_id") REFERENCES "public"."quotes"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_updated_by_fk" FOREIGN KEY ("org_id","updated_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_owner_id_fk" FOREIGN KEY ("org_id","owner_id") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_deleted_by_fk" FOREIGN KEY ("org_id","deleted_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_lines_quote_idx" ON "quote_lines" USING btree ("org_id","quote_id");--> statement-breakpoint
CREATE INDEX "quotes_list_idx" ON "quotes" USING btree ("org_id","owner_id","updated_at" DESC NULLS LAST) WHERE "quotes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "quotes_deal_idx" ON "quotes" USING btree ("org_id","deal_id");--> statement-breakpoint
CREATE INDEX "quotes_account_idx" ON "quotes" USING btree ("org_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_zoho_id_key" ON "quotes" USING btree ("org_id","zoho_id") WHERE "quotes"."zoho_id" IS NOT NULL;--> statement-breakpoint
-- Hand-written (T7.04). Composite FKs: no link into another org (AC-13). Quotes are soft-deleted, so RESTRICT.
ALTER TABLE quotes ADD CONSTRAINT quotes_account_id_fk FOREIGN KEY (org_id, account_id) REFERENCES accounts (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE quotes ADD CONSTRAINT quotes_contact_id_fk FOREIGN KEY (org_id, contact_id) REFERENCES contacts (org_id, id) ON DELETE SET NULL (contact_id);--> statement-breakpoint
ALTER TABLE quotes ADD CONSTRAINT quotes_deal_id_fk FOREIGN KEY (org_id, deal_id) REFERENCES deals (org_id, id) ON DELETE SET NULL (deal_id);--> statement-breakpoint
ALTER TABLE quotes ADD CONSTRAINT quotes_currency_fk FOREIGN KEY (org_id, currency) REFERENCES currencies (org_id, code) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE quote_lines ADD CONSTRAINT quote_lines_product_fk FOREIGN KEY (org_id, product_id) REFERENCES products (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
CREATE TRIGGER quotes_audit BEFORE INSERT OR UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION app.set_audit_columns();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON quotes TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON quote_lines TO crm_app;--> statement-breakpoint
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE quotes FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE quote_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE quote_lines FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON quotes TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
CREATE POLICY tenant_isolation ON quote_lines TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
-- Quotes are private to the owner and their managers (ADR-0005); the lines follow their quote (AC-18).
CREATE POLICY owner_visibility ON quotes AS RESTRICTIVE TO crm_app
  USING (current_setting('app.see_all', true) = 'on' OR owner_id = ANY (app.visible_owner_ids()));--> statement-breakpoint
CREATE POLICY parent_visibility ON quote_lines AS RESTRICTIVE TO crm_app USING (app.can_see('quote', quote_id));--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.can_see(rt record_type, rid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
  RETURN CASE rt
    WHEN 'org' THEN rid = app.org_id()
    WHEN 'user' THEN EXISTS (SELECT 1 FROM member WHERE user_id = rid)
    WHEN 'lead' THEN EXISTS (SELECT 1 FROM leads WHERE id = rid)
    WHEN 'account' THEN EXISTS (SELECT 1 FROM accounts WHERE id = rid)
    WHEN 'contact' THEN EXISTS (SELECT 1 FROM contacts WHERE id = rid)
    WHEN 'activity' THEN EXISTS (SELECT 1 FROM activities WHERE id = rid)
    WHEN 'deal' THEN EXISTS (SELECT 1 FROM deals WHERE id = rid)
    WHEN 'product' THEN EXISTS (SELECT 1 FROM products WHERE id = rid)
    WHEN 'quote' THEN EXISTS (SELECT 1 FROM quotes WHERE id = rid)
    ELSE false
  END;
