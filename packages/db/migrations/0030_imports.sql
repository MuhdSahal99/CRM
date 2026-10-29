CREATE TYPE "public"."import_module" AS ENUM('leads', 'accounts', 'contacts', 'deals', 'products');--> statement-breakpoint
CREATE TYPE "public"."import_row_status" AS ENUM('valid', 'error', 'imported', 'duplicate', 'flagged_owner');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('uploaded', 'validating', 'validated', 'importing', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"module" "import_module" NOT NULL,
	"source_file_id" uuid NOT NULL,
	"mapping" jsonb NOT NULL,
	"status" "import_status" DEFAULT 'uploaded' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"error_rows" integer DEFAULT 0 NOT NULL,
	"imported_rows" integer DEFAULT 0 NOT NULL,
	"duplicate_rows" integer DEFAULT 0 NOT NULL,
	"flagged_rows" integer DEFAULT 0 NOT NULL,
	"failure_message" text,
	"errors_file_id" uuid,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"finished_at" timestamp with time zone,
	CONSTRAINT "import_jobs_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"zoho_id" text,
	"status" "import_row_status" NOT NULL,
	"errors" jsonb,
	"record_id" uuid,
	CONSTRAINT "import_rows_row_key" UNIQUE("org_id","job_id","row_no")
);
--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_source_file_fk" FOREIGN KEY ("org_id","source_file_id") REFERENCES "public"."files"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_errors_file_fk" FOREIGN KEY ("org_id","errors_file_id") REFERENCES "public"."files"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_confirmed_by_fk" FOREIGN KEY ("org_id","confirmed_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_updated_by_fk" FOREIGN KEY ("org_id","updated_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_job_fk" FOREIGN KEY ("org_id","job_id") REFERENCES "public"."import_jobs"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_jobs_list_idx" ON "import_jobs" USING btree ("org_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "import_rows_status_idx" ON "import_rows" USING btree ("org_id","job_id","status","row_no");--> statement-breakpoint
-- Hand-written (T11.01, US-17). The org FK of import_rows rides on the composite FK to import_jobs; the plain one keeps it from naming another org.
ALTER TABLE import_rows ADD CONSTRAINT import_rows_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES orgs (id) ON DELETE RESTRICT;--> statement-breakpoint
CREATE TRIGGER import_jobs_audit BEFORE INSERT OR UPDATE ON import_jobs FOR EACH ROW EXECUTE FUNCTION app.set_audit_columns();--> statement-breakpoint
-- Rows hold the parsed CSV (PII): they may be deleted only 90 days after their job finished (SCHEMA § import_rows).
CREATE FUNCTION app.import_rows_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM import_jobs j WHERE j.org_id = OLD.org_id AND j.id = OLD.job_id AND j.finished_at < now() - interval '90 days') THEN
    RAISE EXCEPTION 'import rows are kept for 90 days after the job finishes' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $$;--> statement-breakpoint
CREATE TRIGGER import_rows_delete_guard BEFORE DELETE ON import_rows FOR EACH ROW EXECUTE FUNCTION app.import_rows_delete_guard();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON import_jobs TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON import_rows TO crm_app;--> statement-breakpoint
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE import_jobs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE import_rows FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON import_jobs TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
CREATE POLICY tenant_isolation ON import_rows TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
CREATE POLICY admin_only ON import_jobs AS RESTRICTIVE TO crm_app USING (current_setting('app.role', true) = 'admin');--> statement-breakpoint
CREATE POLICY admin_only ON import_rows AS RESTRICTIVE TO crm_app USING (current_setting('app.role', true) = 'admin');
