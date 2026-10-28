CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'paid', 'cancelled');--> statement-breakpoint
CREATE TABLE "invoice_lines" (
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
	"invoice_id" uuid NOT NULL,
	CONSTRAINT "invoice_lines_line_no_key" UNIQUE("org_id","invoice_id","line_no"),
	CONSTRAINT "invoice_lines_quantity_positive" CHECK ("invoice_lines"."quantity" > 0),
	CONSTRAINT "invoice_lines_price_nonneg" CHECK ("invoice_lines"."list_price" >= 0),
	CONSTRAINT "invoice_lines_discount" CHECK ("invoice_lines"."discount_value" IS NULL OR ("invoice_lines"."discount_value" >= 0 AND ("invoice_lines"."discount_type" IS DISTINCT FROM 'percent' OR "invoice_lines"."discount_value" <= 100))),
	CONSTRAINT "invoice_lines_net" CHECK ("invoice_lines"."net_amount" = "invoice_lines"."amount" - "invoice_lines"."discount_amount"),
	CONSTRAINT "invoice_lines_vat" CHECK (("invoice_lines"."vat_category" = 'standard' OR "invoice_lines"."vat_amount" = 0) AND (("invoice_lines"."vat_category" = 'exempt') = ("invoice_lines"."vat_rate" IS NULL))),
	CONSTRAINT "invoice_lines_total" CHECK ("invoice_lines"."line_total" = "invoice_lines"."net_amount" + "invoice_lines"."vat_amount")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
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
	"invoice_number" varchar(30),
	"sales_order_id" uuid,
	"invoice_date" date,
	"due_date" date,
	"customer_no" varchar(40),
	"purchase_order_ref" varchar(60),
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp with time zone,
	"issued_by" uuid,
	"seller_snapshot" jsonb,
	"buyer_snapshot" jsonb,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"pdf_file_id" uuid,
	CONSTRAINT "invoices_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "invoices_number_when_issued" CHECK ("invoices"."status" = 'draft' OR "invoices"."invoice_number" IS NOT NULL),
	CONSTRAINT "invoices_scale" CHECK ("invoices"."currency_scale" IN (2, 3)),
	CONSTRAINT "invoices_rate_positive" CHECK ("invoices"."exchange_rate" > 0),
	CONSTRAINT "invoices_scale_ok" CHECK (round("invoices"."sub_total", "invoices"."currency_scale") = "invoices"."sub_total" AND round("invoices"."vat_total", "invoices"."currency_scale") = "invoices"."vat_total" AND round("invoices"."adjustment", "invoices"."currency_scale") = "invoices"."adjustment" AND round("invoices"."grand_total", "invoices"."currency_scale") = "invoices"."grand_total"),
	CONSTRAINT "invoices_grand_total" CHECK ("invoices"."grand_total" = "invoices"."sub_total" + "invoices"."vat_total" + "invoices"."adjustment"),
	CONSTRAINT "invoices_text_length" CHECK (char_length("invoices"."description") <= 32000 AND char_length("invoices"."terms") <= 32000)
);
--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_fk" FOREIGN KEY ("org_id","invoice_id") REFERENCES "public"."invoices"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sales_order_fk" FOREIGN KEY ("org_id","sales_order_id") REFERENCES "public"."sales_orders"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_updated_by_fk" FOREIGN KEY ("org_id","updated_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_owner_id_fk" FOREIGN KEY ("org_id","owner_id") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_deleted_by_fk" FOREIGN KEY ("org_id","deleted_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("org_id","invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices" USING btree ("org_id","invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_list_idx" ON "invoices" USING btree ("org_id","owner_id","updated_at" DESC NULLS LAST) WHERE "invoices"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "invoices_so_idx" ON "invoices" USING btree ("org_id","sales_order_id");--> statement-breakpoint
CREATE INDEX "invoices_account_idx" ON "invoices" USING btree ("org_id","account_id");--> statement-breakpoint
-- Hand-written (T8.04). Composite FKs: no link into another org (AC-13). Documents are soft-deleted, so RESTRICT.
ALTER TABLE invoices ADD CONSTRAINT invoices_account_id_fk FOREIGN KEY (org_id, account_id) REFERENCES accounts (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE invoices ADD CONSTRAINT invoices_contact_id_fk FOREIGN KEY (org_id, contact_id) REFERENCES contacts (org_id, id) ON DELETE SET NULL (contact_id);--> statement-breakpoint
ALTER TABLE invoices ADD CONSTRAINT invoices_deal_id_fk FOREIGN KEY (org_id, deal_id) REFERENCES deals (org_id, id) ON DELETE SET NULL (deal_id);--> statement-breakpoint
ALTER TABLE invoices ADD CONSTRAINT invoices_currency_fk FOREIGN KEY (org_id, currency) REFERENCES currencies (org_id, code) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE invoices ADD CONSTRAINT invoices_issued_by_fk FOREIGN KEY (org_id, issued_by) REFERENCES member (org_id, user_id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE invoices ADD CONSTRAINT invoices_cancelled_by_fk FOREIGN KEY (org_id, cancelled_by) REFERENCES member (org_id, user_id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE invoice_lines ADD CONSTRAINT invoice_lines_product_fk FOREIGN KEY (org_id, product_id) REFERENCES products (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
CREATE TRIGGER invoices_audit BEFORE INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION app.set_audit_columns();--> statement-breakpoint

-- ADR-0008 / AC-23: the database is the backstop, whatever the API does. A draft is free and can only become issued; after that
-- only the status, payment, cancel and PDF columns move, along issued -> paid | cancelled and paid -> cancelled (Admin only).
CREATE FUNCTION app.invoices_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  free text[] := ARRAY['status', 'paid_at', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'pdf_file_id', 'updated_at', 'updated_by', 'version'];
BEGIN
  IF OLD.status = 'draft' THEN
    IF NEW.status NOT IN ('draft', 'issued') THEN
      RAISE EXCEPTION 'a draft invoice can only be issued' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - free) IS DISTINCT FROM (to_jsonb(OLD) - free) THEN
    RAISE EXCEPTION 'an issued invoice cannot be changed' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'issued' AND NEW.status IN ('paid', 'cancelled'))
    OR (OLD.status = 'paid' AND NEW.status = 'cancelled' AND current_setting('app.role', true) = 'admin')
  ) THEN
    RAISE EXCEPTION 'invoice status cannot change from % to %', OLD.status, NEW.status USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER invoices_lock BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION app.invoices_lock();--> statement-breakpoint
CREATE FUNCTION app.invoices_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'an issued invoice cannot be deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $$;--> statement-breakpoint
CREATE TRIGGER invoices_no_delete BEFORE DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION app.invoices_no_delete();--> statement-breakpoint
CREATE FUNCTION app.invoice_lines_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND EXISTS (SELECT 1 FROM invoices WHERE id = OLD.invoice_id AND status <> 'draft'))
     OR (TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM invoices WHERE id = NEW.invoice_id AND status <> 'draft')) THEN
    RAISE EXCEPTION 'the lines of an issued invoice cannot be changed' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;--> statement-breakpoint
CREATE TRIGGER invoice_lines_lock BEFORE INSERT OR UPDATE OR DELETE ON invoice_lines FOR EACH ROW EXECUTE FUNCTION app.invoice_lines_lock();--> statement-breakpoint

-- Soft delete of a draft is an UPDATE; a hard DELETE exists only for drafts (the trigger refuses the rest).
GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_lines TO crm_app;--> statement-breakpoint
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE invoice_lines FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON invoices TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
CREATE POLICY tenant_isolation ON invoice_lines TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
CREATE POLICY owner_visibility ON invoices AS RESTRICTIVE TO crm_app
  USING (current_setting('app.see_all', true) = 'on' OR owner_id = ANY (app.visible_owner_ids()));--> statement-breakpoint
CREATE POLICY parent_visibility ON invoice_lines AS RESTRICTIVE TO crm_app USING (app.can_see('invoice', invoice_id));--> statement-breakpoint
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
    WHEN 'invoice' THEN EXISTS (SELECT 1 FROM invoices WHERE id = rid)
    ELSE false
  END;
