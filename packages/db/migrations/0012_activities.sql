CREATE TYPE "public"."activity_type" AS ENUM('task', 'call', 'meeting');--> statement-breakpoint
CREATE TABLE "activities" (
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
	"type" "activity_type" NOT NULL,
	"subject" varchar(255) NOT NULL,
	"status" varchar(30),
	"priority" varchar(20),
	"due_date" date,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"all_day" boolean,
	"venue" varchar(255),
	"call_type" varchar(10),
	"call_purpose" varchar(120),
	"call_result" varchar(120),
	"call_start_at" timestamp with time zone,
	"call_duration_seconds" integer,
	"who_type" "record_type",
	"who_id" uuid,
	"what_type" "record_type",
	"what_id" uuid,
	"completed_at" timestamp with time zone,
	"description" text,
	CONSTRAINT "activities_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "activities_meeting_times" CHECK ("activities"."type" <> 'meeting' OR ("activities"."start_at" IS NOT NULL AND "activities"."end_at" IS NOT NULL AND "activities"."end_at" >= "activities"."start_at")),
	CONSTRAINT "activities_call_fields" CHECK ("activities"."type" <> 'call' OR ("activities"."call_type" IS NOT NULL AND "activities"."call_start_at" IS NOT NULL AND "activities"."call_duration_seconds" IS NOT NULL)),
	CONSTRAINT "activities_call_duration" CHECK ("activities"."call_duration_seconds" >= 0),
	CONSTRAINT "activities_call_type" CHECK ("activities"."call_type" IN ('Inbound', 'Outbound', 'Missed')),
	CONSTRAINT "activities_who_pair" CHECK (("activities"."who_type" IS NULL) = ("activities"."who_id" IS NULL)),
	CONSTRAINT "activities_what_pair" CHECK (("activities"."what_type" IS NULL) = ("activities"."what_id" IS NULL)),
	CONSTRAINT "activities_who_type" CHECK ("activities"."who_type" IN ('lead', 'contact')),
	CONSTRAINT "activities_what_type" CHECK ("activities"."what_type" IN ('account', 'deal', 'quote', 'sales_order', 'invoice')),
	CONSTRAINT "activities_description_length" CHECK (char_length("activities"."description") <= 32000)
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_updated_by_fk" FOREIGN KEY ("org_id","updated_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_owner_id_fk" FOREIGN KEY ("org_id","owner_id") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_deleted_by_fk" FOREIGN KEY ("org_id","deleted_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_open_idx" ON "activities" USING btree ("org_id","owner_id","due_date") WHERE "activities"."completed_at" IS NULL AND "activities"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "activities_who_idx" ON "activities" USING btree ("org_id","who_type","who_id");--> statement-breakpoint
CREATE INDEX "activities_what_idx" ON "activities" USING btree ("org_id","what_type","what_id");
-- Hand-written (T3.01). Slice 3: activities. Audit columns come from the context, not the client.
CREATE TRIGGER activities_audit BEFORE INSERT OR UPDATE ON activities FOR EACH ROW EXECUTE FUNCTION app.set_audit_columns();--> statement-breakpoint

-- completed_at follows status (a task is closed when Completed, a call or meeting when Held or Cancelled), so no client
-- or import can set it out of step, and "open" (US-15) is just completed_at IS NULL.
CREATE FUNCTION app.set_activity_completed_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = ANY (CASE WHEN NEW.type = 'task' THEN ARRAY['Completed'] ELSE ARRAY['Held', 'Cancelled'] END) THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.completed_at := COALESCE(OLD.completed_at, now());
    ELSE
      NEW.completed_at := now();
    END IF;
  ELSE
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER activities_completed_at BEFORE INSERT OR UPDATE ON activities FOR EACH ROW EXECUTE FUNCTION app.set_activity_completed_at();--> statement-breakpoint

-- A polymorphic link (SCHEMA § Conventions) must name a record the writer can see, so one in another org, or one that is
-- not there, is rejected. TG_ARGV is (type column, id column) pairs. SECURITY INVOKER: the target's own RLS applies.
-- Reported as a foreign-key violation on <table>_<id column>_fk, so the API can name the field.
CREATE FUNCTION app.check_record_ref() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  i int := 0;
  rid text;
BEGIN
  WHILE i < TG_NARGS LOOP
    rid := to_jsonb(NEW) ->> TG_ARGV[i + 1];
    IF rid IS NOT NULL AND NOT app.can_see((to_jsonb(NEW) ->> TG_ARGV[i])::record_type, rid::uuid) THEN
      RAISE EXCEPTION 'linked record does not exist' USING ERRCODE = '23503', CONSTRAINT = TG_TABLE_NAME || '_' || TG_ARGV[i + 1] || '_fk';
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER activities_check_record_ref BEFORE INSERT OR UPDATE OF who_type, who_id, what_type, what_id ON activities
  FOR EACH ROW EXECUTE FUNCTION app.check_record_ref('who_type', 'who_id', 'what_type', 'what_id');--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON activities TO crm_app;--> statement-breakpoint
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE activities FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON activities TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());--> statement-breakpoint
-- Private to the owner and their managers (ADR-0005), even when linked to a public account.
CREATE POLICY owner_visibility ON activities AS RESTRICTIVE TO crm_app
  USING (current_setting('app.see_all', true) = 'on' OR owner_id = ANY (app.visible_owner_ids()));--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.can_see(rt record_type, rid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
  RETURN CASE rt
    WHEN 'org' THEN rid = app.org_id()
    WHEN 'user' THEN EXISTS (SELECT 1 FROM member WHERE user_id = rid)
    WHEN 'account' THEN EXISTS (SELECT 1 FROM accounts WHERE id = rid)
    WHEN 'contact' THEN EXISTS (SELECT 1 FROM contacts WHERE id = rid)
    WHEN 'activity' THEN EXISTS (SELECT 1 FROM activities WHERE id = rid)
    ELSE false
  END;
