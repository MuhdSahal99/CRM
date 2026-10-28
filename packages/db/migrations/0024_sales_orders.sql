CREATE TYPE "public"."so_status" AS ENUM('created', 'approved', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TABLE "sales_order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
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
	"sales_order_id" uuid NOT NULL,
	CONSTRAINT "sales_order_lines_line_no_key" UNIQUE("org_id","sales_order_id","line_no"),
	CONSTRAINT "sales_order_lines_quantity_positive" CHECK ("sales_order_lines"."quantity" > 0),
	CONSTRAINT "sales_order_lines_price_nonneg" CHECK ("sales_order_lines"."list_price" >= 0),
	CONSTRAINT "sales_order_lines_discount" CHECK ("sales_order_lines"."discount_value" IS NULL OR ("sales_order_lines"."discount_value" >= 0 AND ("sales_order_lines"."discount_type" IS DISTINCT FROM 'percent' OR "sales_order_lines"."discount_value" <= 100))),
	CONSTRAINT "sales_order_lines_net" CHECK ("sales_order_lines"."net_amount" = "sales_order_lines"."amount" - "sales_order_lines"."discount_amount"),
	CONSTRAINT "sales_order_lines_vat" CHECK (("sales_order_lines"."vat_category" = 'standard' OR "sales_order_lines"."vat_amount" = 0) AND (("sales_order_lines"."vat_category" = 'exempt') = ("sales_order_lines"."vat_rate" IS NULL))),
	CONSTRAINT "sales_order_lines_total" CHECK ("sales_order_lines"."line_total" = "sales_order_lines"."net_amount" + "sales_order_lines"."vat_amount")
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
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
	"so_number" varchar(30) NOT NULL,
	"quote_id" uuid,
	"customer_no" varchar(40),
	"purchase_order_ref" varchar(60),
	"due_date" date,
	"status" "so_status" DEFAULT 'created' NOT NULL,
	CONSTRAINT "sales_orders_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "sales_orders_number_key" UNIQUE("org_id","so_number"),
	CONSTRAINT "sales_orders_scale" CHECK ("sales_orders"."currency_scale" IN (2, 3)),
	CONSTRAINT "sales_orders_rate_positive" CHECK ("sales_orders"."exchange_rate" > 0),
	CONSTRAINT "sales_orders_scale_ok" CHECK (round("sales_orders"."sub_total", "sales_orders"."currency_scale") = "sales_orders"."sub_total" AND round("sales_orders"."vat_total", "sales_orders"."currency_scale") = "sales_orders"."vat_total" AND round("sales_orders"."adjustment", "sales_orders"."currency_scale") = "sales_orders"."adjustment" AND round("sales_orders"."grand_total", "sales_orders"."currency_scale") = "sales_orders"."grand_total"),
	CONSTRAINT "sales_orders_grand_total" CHECK ("sales_orders"."grand_total" = "sales_orders"."sub_total" + "sales_orders"."vat_total" + "sales_orders"."adjustment"),
	CONSTRAINT "sales_orders_text_length" CHECK (char_length("sales_orders"."description") <= 32000 AND char_length("sales_orders"."terms") <= 32000)
);
--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_so_fk" FOREIGN KEY ("org_id","sales_order_id") REFERENCES "public"."sales_orders"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quote_fk" FOREIGN KEY ("org_id","quote_id") REFERENCES "public"."quotes"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_updated_by_fk" FOREIGN KEY ("org_id","updated_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_owner_id_fk" FOREIGN KEY ("org_id","owner_id") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_deleted_by_fk" FOREIGN KEY ("org_id","deleted_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_order_lines_so_idx" ON "sales_order_lines" USING btree ("org_id","sales_order_id");--> statement-breakpoint
CREATE INDEX "sales_orders_list_idx" ON "sales_orders" USING btree ("org_id","owner_id","updated_at" DESC NULLS LAST) WHERE "sales_orders"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sales_orders_quote_idx" ON "sales_orders" USING btree ("org_id","quote_id");--> statement-breakpoint
CREATE INDEX "sales_orders_account_idx" ON "sales_orders" USING btree ("org_id","account_id");--> statement-breakpoint
-- Hand-written (T8.01). Composite FKs: no link into another org (AC-13). Documents are soft-deleted, so RESTRICT.
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_account_id_fk FOREIGN KEY (org_id, account_id) REFERENCES accounts (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_contact_id_fk FOREIGN KEY (org_id, contact_id) REFERENCES contacts (org_id, id) ON DELETE SET NULL (contact_id);--> statement-breakpoint
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_deal_id_fk FOREIGN KEY (org_id, deal_id) REFERENCES deals (org_id, id) ON DELETE SET NULL (deal_id);--> statement-breakpoint
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_currency_fk FOREIGN KEY (org_id, currency) REFERENCES currencies (org_id, code) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE sales_order_lines ADD CONSTRAINT sales_order_lines_product_fk FOREIGN KEY (org_id, product_id) REFERENCES products (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
CREATE TRIGGER sales_orders_audit BEFORE INSERT OR UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION app.set_audit_columns();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON sales_orders TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON sales_order_lines TO crm_app;--> statement-breakpoint
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sales_orders FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sales_order_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sales_order_lines FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON sales_orders TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
CREATE POLICY tenant_isolation ON sales_order_lines TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
-- Sales orders are private to the owner and their managers (ADR-0005); the lines follow their order (AC-18).
CREATE POLICY owner_visibility ON sales_orders AS RESTRICTIVE TO crm_app
  USING (current_setting('app.see_all', true) = 'on' OR owner_id = ANY (app.visible_owner_ids()));--> statement-breakpoint
CREATE POLICY parent_visibility ON sales_order_lines AS RESTRICTIVE TO crm_app USING (app.can_see('sales_order', sales_order_id));--> statement-breakpoint
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
    WHEN 'sales_order' THEN EXISTS (SELECT 1 FROM sales_orders WHERE id = rid)
    ELSE false
  END;
