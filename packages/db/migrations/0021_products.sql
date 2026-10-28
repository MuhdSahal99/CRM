CREATE TABLE "products" (
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
	"product_name" varchar(120) NOT NULL,
	"product_code" varchar(40),
	"is_active" boolean DEFAULT true NOT NULL,
	"category" varchar(60),
	"vat_category" "vat_category" NOT NULL,
	"unit_price" numeric(18, 3) NOT NULL,
	"usage_unit" varchar(30),
	"description" text,
	CONSTRAINT "products_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "products_price_nonneg" CHECK ("products"."unit_price" >= 0),
	CONSTRAINT "products_description_length" CHECK (char_length("products"."description") <= 32000)
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_fk" FOREIGN KEY ("org_id","updated_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_owner_id_fk" FOREIGN KEY ("org_id","owner_id") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_deleted_by_fk" FOREIGN KEY ("org_id","deleted_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "products_product_code_key" ON "products" USING btree ("org_id",lower("product_code")) WHERE "products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "products_name_trgm_idx" ON "products" USING gin ("product_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_list_idx" ON "products" USING btree ("org_id","updated_at" DESC NULLS LAST) WHERE "products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "products_zoho_id_key" ON "products" USING btree ("org_id","zoho_id") WHERE "products"."zoho_id" IS NOT NULL;--> statement-breakpoint
-- Hand-written (T6.05, US-08). Public in org (ADR-0005): everyone reads; only an Admin inserts or updates (restrictive policies; the
-- service answers 403 first). Soft-deleted, so no DELETE grant.
CREATE TRIGGER products_audit BEFORE INSERT OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION app.set_audit_columns();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON products TO crm_app;--> statement-breakpoint
ALTER TABLE products ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE products FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON products TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
CREATE POLICY admin_only_insert ON products AS RESTRICTIVE FOR INSERT TO crm_app WITH CHECK (current_setting('app.role', true) = 'admin');--> statement-breakpoint
CREATE POLICY admin_only_update ON products AS RESTRICTIVE FOR UPDATE TO crm_app USING (current_setting('app.role', true) = 'admin');--> statement-breakpoint

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
    ELSE false
  END;
