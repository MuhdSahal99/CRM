import { sql } from "drizzle-orm";
import { bigint, boolean, char, check, date, foreignKey, index, numeric, pgEnum, pgTable, primaryKey, smallint, text, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { AUDIT, auditFks, REC, recFks, tstz, ZOHO, zohoIdx } from "./_columns.ts";
import { orgs } from "./auth.ts";

// SCHEMA § pipelines / stages, currencies, deals (REC, ZOHO, private) and deal_stage_history. Composite FKs, the audit and
// stage-rule triggers, generated columns' expressions, grants and RLS are hand-written SQL (migration 0017).

export const stageCategory = pgEnum("stage_category", ["open", "closed_won", "closed_lost"]);
export const forecastCategory = pgEnum("forecast_category", ["pipeline", "best_case", "committed", "closed", "omitted"]);

export const pipelines = pgTable(
  "pipelines",
  {
    id: uuid("id").primaryKey(),
    ...AUDIT(),
    name: varchar("name", { length: 80 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (t) => [
    unique("pipelines_org_id_id_key").on(t.orgId, t.id),
    unique("pipelines_org_name_key").on(t.orgId, t.name),
    uniqueIndex("pipelines_one_default_key").on(t.orgId).where(sql`${t.isDefault}`),
    ...auditFks("pipelines", t),
  ],
);

export const stages = pgTable(
  "stages",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    pipelineId: uuid("pipeline_id").notNull(),
    nameKey: varchar("name_key", { length: 120 }).notNull(),
    apiValue: varchar("api_value", { length: 60 }).notNull(),
    sortOrder: smallint("sort_order").notNull(),
    probability: smallint("probability").notNull(),
    recordCategory: stageCategory("record_category").notNull(),
    forecastCategory: forecastCategory("forecast_category").notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    unique("stages_org_id_id_key").on(t.orgId, t.id),
    unique("stages_api_value_key").on(t.orgId, t.pipelineId, t.apiValue),
    check("stages_probability_range", sql`${t.probability} BETWEEN 0 AND 100`),
    foreignKey({ name: "stages_pipeline_fk", columns: [t.orgId, t.pipelineId], foreignColumns: [pipelines.orgId, pipelines.id] }).onDelete("restrict"),
  ],
);

export const currencies = pgTable(
  "currencies",
  {
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    code: char("code", { length: 3 }).notNull(),
    scale: smallint("scale").notNull(),
    isBase: boolean("is_base").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.code] }),
    check("currencies_scale", sql`${t.scale} IN (2, 3)`),
    uniqueIndex("currencies_one_base_key").on(t.orgId).where(sql`${t.isBase}`),
  ],
);

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey(),
    ...REC(),
    ...ZOHO(),
    dealName: varchar("deal_name", { length: 120 }).notNull(),
    accountId: uuid("account_id").notNull(),
    contactId: uuid("contact_id"),
    contactRole: varchar("contact_role", { length: 60 }),
    type: varchar("type", { length: 60 }),
    leadSource: varchar("lead_source", { length: 60 }),
    amount: numeric("amount", { precision: 18, scale: 3 }),
    currency: char("currency", { length: 3 }).notNull(),
    currencyScale: smallint("currency_scale").notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 }).notNull(),
    amountOmr: numeric("amount_omr", { precision: 18, scale: 3 }).generatedAlwaysAs(sql`round(amount * exchange_rate, 3)`),
    closingDate: date("closing_date").notNull(),
    pipelineId: uuid("pipeline_id").notNull(),
    stageId: uuid("stage_id").notNull(),
    probability: smallint("probability").notNull(),
    expectedRevenue: numeric("expected_revenue", { precision: 18, scale: 3 }).generatedAlwaysAs(sql`round(amount * probability / 100, currency_scale)`),
    forecastCategory: forecastCategory("forecast_category").notNull(),
    nextStep: varchar("next_step", { length: 100 }),
    reasonForLoss: varchar("reason_for_loss", { length: 120 }),
    closedAt: tstz("closed_at"),
    description: text("description"),
    convertedFromLeadId: uuid("converted_from_lead_id"),
  },
  (t) => [
    unique("deals_org_id_id_key").on(t.orgId, t.id),
    check("deals_amount_nonneg", sql`${t.amount} >= 0`),
    check("deals_probability_range", sql`${t.probability} BETWEEN 0 AND 100`),
    check("deals_scale", sql`${t.currencyScale} IN (2, 3)`),
    check("deals_rate_positive", sql`${t.exchangeRate} > 0`),
    check("deals_description_length", sql`char_length(${t.description}) <= 32000`),
    index("deals_list_idx").on(t.orgId, t.ownerId, t.updatedAt.desc()).where(sql`${t.deletedAt} IS NULL`),
    index("deals_kanban_idx").on(t.orgId, t.pipelineId, t.stageId).where(sql`${t.deletedAt} IS NULL`),
    index("deals_account_idx").on(t.orgId, t.accountId),
    index("deals_name_trgm_idx").using("gin", sql`${t.dealName} gin_trgm_ops`),
    zohoIdx("deals", t),
    ...recFks("deals", t),
  ],
);

export const dealStageHistory = pgTable(
  "deal_stage_history",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    dealId: uuid("deal_id").notNull(),
    stageId: uuid("stage_id").notNull(),
    amount: numeric("amount", { precision: 18, scale: 3 }),
    probability: smallint("probability").notNull(),
    forecastCategory: forecastCategory("forecast_category").notNull(),
    closingDate: date("closing_date").notNull(),
    changedAt: tstz("changed_at").notNull().defaultNow(),
    changedBy: uuid("changed_by"),
    secondsInPreviousStage: bigint("seconds_in_previous_stage", { mode: "number" }),
  },
  (t) => [index("deal_stage_history_idx").on(t.orgId, t.dealId, t.changedAt)],
);
