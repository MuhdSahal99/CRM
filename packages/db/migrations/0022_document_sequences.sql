CREATE TYPE "public"."doc_type" AS ENUM('quote', 'sales_order', 'invoice');--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"org_id" uuid NOT NULL,
	"doc_type" "doc_type" NOT NULL,
	"prefix" varchar(20) DEFAULT '' NOT NULL,
	"padding" smallint DEFAULT 6 NOT NULL,
	"next_value" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "document_sequences_org_id_doc_type_pk" PRIMARY KEY("org_id","doc_type"),
	CONSTRAINT "document_sequences_next_value_min" CHECK ("document_sequences"."next_value" >= 1)
);
--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Hand-written (T7.03, ADR-0008). The counter only ever moves forward. Reps take numbers when they create documents, so the
-- table has tenant isolation only; the monotonic trigger is the guard (no DELETE grant either).
CREATE FUNCTION app.sequence_monotonic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.next_value < OLD.next_value THEN
    RAISE EXCEPTION 'document sequence % cannot go backwards', OLD.doc_type USING ERRCODE = '23514', CONSTRAINT = 'sequence_monotonic';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER sequence_monotonic BEFORE UPDATE ON document_sequences FOR EACH ROW EXECUTE FUNCTION app.sequence_monotonic();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON document_sequences TO crm_app;--> statement-breakpoint
ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE document_sequences FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON document_sequences TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());
