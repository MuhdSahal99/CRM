CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"record_type" "record_type" NOT NULL,
	"record_id" uuid NOT NULL,
	"body" text NOT NULL,
	CONSTRAINT "notes_body_length" CHECK (char_length("notes"."body") BETWEEN 1 AND 32000)
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_updated_by_fk" FOREIGN KEY ("org_id","updated_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_record_idx" ON "notes" USING btree ("org_id","record_type","record_id","created_at" DESC);--> statement-breakpoint

-- Hand-written (T3.05).
CREATE TRIGGER notes_audit BEFORE INSERT OR UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION app.set_audit_columns();--> statement-breakpoint
CREATE TRIGGER notes_check_record_ref BEFORE INSERT OR UPDATE OF record_type, record_id ON notes
  FOR EACH ROW EXECUTE FUNCTION app.check_record_ref('record_type', 'record_id');--> statement-breakpoint

-- No DELETE: a note is soft-deleted.
GRANT SELECT, INSERT, UPDATE ON notes TO crm_app;--> statement-breakpoint
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notes FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON notes TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
-- A note is visible, and can be written, only when its record is.
CREATE POLICY record_visibility ON notes AS RESTRICTIVE TO crm_app USING (app.can_see(record_type, record_id));
