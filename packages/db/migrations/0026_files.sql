CREATE TYPE "public"."file_kind" AS ENUM('quote_pdf', 'sales_order_pdf', 'invoice_pdf', 'import_csv', 'import_errors_csv');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "file_kind" NOT NULL,
	"record_type" "record_type",
	"record_id" uuid,
	"status" "file_status" DEFAULT 'pending' NOT NULL,
	"storage_key" text NOT NULL,
	"filename" varchar(200) NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"size_bytes" bigint,
	"sha256" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "files_storage_key_key" UNIQUE("storage_key"),
	CONSTRAINT "files_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "files_record_ref" CHECK (("files"."record_type" IS NULL) = ("files"."record_id" IS NULL)),
	CONSTRAINT "files_ready" CHECK ("files"."status" <> 'ready' OR ("files"."sha256" IS NOT NULL AND "files"."size_bytes" IS NOT NULL)),
	CONSTRAINT "files_key_org" CHECK ("files"."storage_key" LIKE 'org/' || "files"."org_id"::text || '/%')
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_record_idx" ON "files" USING btree ("org_id","record_type","record_id","created_at" DESC);--> statement-breakpoint
-- Hand-written (T8.08, ADR-0012). A ready file is immutable: no UPDATE (a re-render is a new row) and no DELETE.
CREATE FUNCTION app.files_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'ready' THEN
    RAISE EXCEPTION 'a ready file cannot be changed or deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;--> statement-breakpoint
CREATE TRIGGER files_immutable BEFORE UPDATE OR DELETE ON files FOR EACH ROW EXECUTE FUNCTION app.files_immutable();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON files TO crm_app;--> statement-breakpoint
ALTER TABLE files ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE files FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON files TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
-- A file is visible with the record it belongs to; a file with no record (an import's CSV) only to the user who created it.
CREATE POLICY record_visibility ON files AS RESTRICTIVE TO crm_app
  USING (CASE WHEN record_type IS NULL THEN created_by = NULLIF(current_setting('app.user_id', true), '')::uuid ELSE app.can_see(record_type, record_id) END);--> statement-breakpoint
ALTER TABLE invoices ADD CONSTRAINT invoices_pdf_file_fk FOREIGN KEY (org_id, pdf_file_id) REFERENCES files (org_id, id) ON DELETE RESTRICT;
