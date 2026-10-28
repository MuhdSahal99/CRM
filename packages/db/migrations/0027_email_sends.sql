CREATE TYPE "public"."email_status" AS ENUM('queued', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "email_sends" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"record_type" "record_type" NOT NULL,
	"record_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"to_contact_id" uuid,
	"to_email" "citext" NOT NULL,
	"subject" varchar(255) NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"error_code" varchar(40),
	"error_message" varchar(500),
	"provider_message_id" varchar(255),
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	CONSTRAINT "email_sends_no_line_breaks" CHECK ("email_sends"."subject" !~ '[\r\n]' AND "email_sends"."to_email"::text !~ '[\r\n]'),
	CONSTRAINT "email_sends_body_length" CHECK (char_length("email_sends"."body") <= 5000)
);
--> statement-breakpoint
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_file_fk" FOREIGN KEY ("org_id","file_id") REFERENCES "public"."files"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_sends_outbox_idx" ON "email_sends" USING btree ("org_id","status","queued_at") WHERE "email_sends"."status" IN ('queued', 'sending');--> statement-breakpoint
CREATE INDEX "email_sends_record_idx" ON "email_sends" USING btree ("org_id","record_type","record_id","queued_at" DESC);