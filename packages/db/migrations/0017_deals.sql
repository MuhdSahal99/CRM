CREATE TYPE "public"."forecast_category" AS ENUM('pipeline', 'best_case', 'committed', 'closed', 'omitted');--> statement-breakpoint
CREATE TYPE "public"."stage_category" AS ENUM('open', 'closed_won', 'closed_lost');--> statement-breakpoint
CREATE TABLE "currencies" (
	"org_id" uuid NOT NULL,
	"code" char(3) NOT NULL,
	"scale" smallint NOT NULL,
	"is_base" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "currencies_org_id_code_pk" PRIMARY KEY("org_id","code"),
	CONSTRAINT "currencies_scale" CHECK ("currencies"."scale" IN (2, 3))
);
--> statement-breakpoint
CREATE TABLE "deal_stage_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"amount" numeric(18, 3),
	"probability" smallint NOT NULL,
	"forecast_category" "forecast_category" NOT NULL,
	"closing_date" date NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by" uuid,
	"seconds_in_previous_stage" bigint
);
--> statement-breakpoint
CREATE TABLE "deals" (
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
	"deal_name" varchar(120) NOT NULL,
	"account_id" uuid NOT NULL,
	"contact_id" uuid,
	"contact_role" varchar(60),
	"type" varchar(60),
	"lead_source" varchar(60),
	"amount" numeric(18, 3),
	"currency" char(3) NOT NULL,
	"currency_scale" smallint NOT NULL,
	"exchange_rate" numeric(18, 8) NOT NULL,
	"amount_omr" numeric(18, 3) GENERATED ALWAYS AS (round(amount * exchange_rate, 3)) STORED,
	"closing_date" date NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"probability" smallint NOT NULL,
	"expected_revenue" numeric(18, 3) GENERATED ALWAYS AS (round(amount * probability / 100, currency_scale)) STORED,
	"forecast_category" "forecast_category" NOT NULL,
	"next_step" varchar(100),
	"reason_for_loss" varchar(120),
	"closed_at" timestamp with time zone,
	"description" text,
	"converted_from_lead_id" uuid,
	CONSTRAINT "deals_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "deals_amount_nonneg" CHECK ("deals"."amount" >= 0),
	CONSTRAINT "deals_probability_range" CHECK ("deals"."probability" BETWEEN 0 AND 100),
	CONSTRAINT "deals_scale" CHECK ("deals"."currency_scale" IN (2, 3)),
	CONSTRAINT "deals_rate_positive" CHECK ("deals"."exchange_rate" > 0),
	CONSTRAINT "deals_description_length" CHECK (char_length("deals"."description") <= 32000)
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"name" varchar(80) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pipelines_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "pipelines_org_name_key" UNIQUE("org_id","name")
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"name_key" varchar(120) NOT NULL,
	"api_value" varchar(60) NOT NULL,
	"sort_order" smallint NOT NULL,
	"probability" smallint NOT NULL,
	"record_category" "stage_category" NOT NULL,
	"forecast_category" "forecast_category" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "stages_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "stages_api_value_key" UNIQUE("org_id","pipeline_id","api_value"),
	CONSTRAINT "stages_probability_range" CHECK ("stages"."probability" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_updated_by_fk" FOREIGN KEY ("org_id","updated_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_id_fk" FOREIGN KEY ("org_id","owner_id") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_deleted_by_fk" FOREIGN KEY ("org_id","deleted_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_created_by_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_updated_by_fk" FOREIGN KEY ("org_id","updated_by") REFERENCES "public"."member"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_pipeline_fk" FOREIGN KEY ("org_id","pipeline_id") REFERENCES "public"."pipelines"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "currencies_one_base_key" ON "currencies" USING btree ("org_id") WHERE "currencies"."is_base";--> statement-breakpoint
CREATE INDEX "deal_stage_history_idx" ON "deal_stage_history" USING btree ("org_id","deal_id","changed_at");--> statement-breakpoint
CREATE INDEX "deals_list_idx" ON "deals" USING btree ("org_id","owner_id","updated_at" DESC NULLS LAST) WHERE "deals"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "deals_kanban_idx" ON "deals" USING btree ("org_id","pipeline_id","stage_id") WHERE "deals"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "deals_account_idx" ON "deals" USING btree ("org_id","account_id");--> statement-breakpoint
CREATE INDEX "deals_name_trgm_idx" ON "deals" USING gin ("deal_name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "deals_zoho_id_key" ON "deals" USING btree ("org_id","zoho_id") WHERE "deals"."zoho_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "pipelines_one_default_key" ON "pipelines" USING btree ("org_id") WHERE "pipelines"."is_default";
-- Hand-written (T5.01 to T5.03). Composite FKs: no link into another org (AC-13). Records are soft-deleted, so RESTRICT.
ALTER TABLE deals ADD CONSTRAINT deals_account_id_fk FOREIGN KEY (org_id, account_id) REFERENCES accounts (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE deals ADD CONSTRAINT deals_contact_id_fk FOREIGN KEY (org_id, contact_id) REFERENCES contacts (org_id, id) ON DELETE SET NULL (contact_id);--> statement-breakpoint
ALTER TABLE deals ADD CONSTRAINT deals_pipeline_id_fk FOREIGN KEY (org_id, pipeline_id) REFERENCES pipelines (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE deals ADD CONSTRAINT deals_stage_id_fk FOREIGN KEY (org_id, stage_id) REFERENCES stages (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE deals ADD CONSTRAINT deals_currency_fk FOREIGN KEY (org_id, currency) REFERENCES currencies (org_id, code) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE deals ADD CONSTRAINT deals_converted_from_lead_fk FOREIGN KEY (org_id, converted_from_lead_id) REFERENCES leads (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE leads ADD CONSTRAINT leads_converted_deal_fk FOREIGN KEY (org_id, converted_deal_id) REFERENCES deals (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE deal_stage_history ADD CONSTRAINT deal_stage_history_deal_fk FOREIGN KEY (org_id, deal_id) REFERENCES deals (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE deal_stage_history ADD CONSTRAINT deal_stage_history_stage_fk FOREIGN KEY (org_id, stage_id) REFERENCES stages (org_id, id) ON DELETE RESTRICT;--> statement-breakpoint
CREATE TRIGGER pipelines_audit BEFORE INSERT OR UPDATE ON pipelines FOR EACH ROW EXECUTE FUNCTION app.set_audit_columns();--> statement-breakpoint
CREATE TRIGGER deals_audit BEFORE INSERT OR UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION app.set_audit_columns();--> statement-breakpoint

-- US-07: a stage change sets the mapped probability and forecast category (unless the same update sets them), the pipeline
-- follows the stage, Closed Lost needs a reason, Closed Won is 100 / closed, and closed_at tracks leaving "open".
-- The service checks the reason first for a field-level 422; this is the backstop for direct SQL.
CREATE FUNCTION app.deals_stage_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s stages%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id = OLD.stage_id THEN RETURN NEW; END IF;
  SELECT * INTO s FROM stages WHERE id = NEW.stage_id;
  IF NOT FOUND THEN RETURN NEW; END IF; -- the stage FK reports it
  NEW.pipeline_id := s.pipeline_id;
  IF TG_OP = 'INSERT' THEN
    NEW.probability := COALESCE(NEW.probability, s.probability);
    NEW.forecast_category := COALESCE(NEW.forecast_category, s.forecast_category);
  ELSE
    IF NEW.probability IS NOT DISTINCT FROM OLD.probability THEN NEW.probability := s.probability; END IF;
    IF NEW.forecast_category IS NOT DISTINCT FROM OLD.forecast_category THEN NEW.forecast_category := s.forecast_category; END IF;
  END IF;
  IF s.record_category = 'closed_won' THEN NEW.probability := 100; NEW.forecast_category := 'closed'; END IF;
  IF s.record_category = 'closed_lost' AND COALESCE(NEW.reason_for_loss, '') = '' THEN
    RAISE EXCEPTION 'reason_for_loss is required for a closed lost deal' USING ERRCODE = 'check_violation';
  END IF;
  NEW.closed_at := CASE WHEN s.record_category = 'open' THEN NULL ELSE now() END;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER deals_stage_rules BEFORE INSERT OR UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION app.deals_stage_rules();--> statement-breakpoint

CREATE FUNCTION app.deals_stage_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id = OLD.stage_id THEN RETURN NULL; END IF;
  INSERT INTO deal_stage_history (id, org_id, deal_id, stage_id, amount, probability, forecast_category, closing_date, changed_at, changed_by, seconds_in_previous_stage)
  SELECT gen_random_uuid(), NEW.org_id, NEW.id, NEW.stage_id, NEW.amount, NEW.probability, NEW.forecast_category, NEW.closing_date, now(), NEW.updated_by,
    (SELECT extract(epoch FROM now() - max(changed_at))::bigint FROM deal_stage_history WHERE deal_id = NEW.id);
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER deals_stage_history AFTER INSERT OR UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION app.deals_stage_history();--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON pipelines, stages, currencies, deals TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON deal_stage_history TO crm_app;--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pipelines', 'stages', 'currencies', 'deals', 'deal_stage_history'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I TO crm_app USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id())', t);
  END LOOP;
  -- Pipeline set-up is the Admin's (the stage editor is Phase 2); everyone in the org reads it.
  FOREACH t IN ARRAY ARRAY['pipelines', 'stages', 'currencies'] LOOP
    EXECUTE format($p$CREATE POLICY admin_only_insert ON %I AS RESTRICTIVE FOR INSERT TO crm_app WITH CHECK (current_setting('app.role', true) = 'admin')$p$, t);
    EXECUTE format($p$CREATE POLICY admin_only_update ON %I AS RESTRICTIVE FOR UPDATE TO crm_app USING (current_setting('app.role', true) = 'admin')$p$, t);
  END LOOP;
END $$;--> statement-breakpoint
-- Deals are private to the owner and their managers (ADR-0005); the history follows its deal.
CREATE POLICY owner_visibility ON deals AS RESTRICTIVE TO crm_app
  USING (current_setting('app.see_all', true) = 'on' OR owner_id = ANY (app.visible_owner_ids()));--> statement-breakpoint
CREATE POLICY parent_visibility ON deal_stage_history AS RESTRICTIVE TO crm_app USING (app.can_see('deal', deal_id));--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.can_see(rt record_type, rid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
  RETURN CASE rt
    WHEN 'org' THEN rid = app.org_id()
    WHEN 'user' THEN EXISTS (SELECT 1 FROM member WHERE user_id = rid)
    WHEN 'lead' THEN EXISTS (SELECT 1 FROM leads WHERE id = rid)
    WHEN 'account' THEN EXISTS (SELECT 1 FROM accounts WHERE id = rid)
    WHEN 'contact' THEN EXISTS (SELECT 1 FROM contacts WHERE id = rid)
    WHEN 'activity' THEN EXISTS (SELECT 1 FROM activities WHERE id = rid)
    WHEN 'deal' THEN EXISTS (SELECT 1 FROM deals WHERE id = rid)
    ELSE false
  END;
