import { newId, schema } from "@crm/db";
import { and, eq, sql } from "drizzle-orm";
import { SYSTEM_FIELDS, SYSTEM_PICKLISTS } from "./system-fields.ts";
import type { Tx } from "../tenant.ts";

/** The MVP's system modules (openapi ModuleName), in nav order. Public modules are visible org-wide (ADR-0005). */
export const SYSTEM_MODULES = [
  { apiName: "Leads", visibility: "private" },
  { apiName: "Accounts", visibility: "public" },
  { apiName: "Contacts", visibility: "public" },
  { apiName: "Deals", visibility: "private" },
  { apiName: "Products", visibility: "public" },
  { apiName: "Quotes", visibility: "private" },
  { apiName: "Sales_Orders", visibility: "private" },
  { apiName: "Invoices", visibility: "private" },
  { apiName: "Tasks", visibility: "private" },
  { apiName: "Calls", visibility: "private" },
  { apiName: "Meetings", visibility: "private" },
] as const;

/** Reference §2.7 (the (verify) probabilities are as listed there): api_value, probability, record category, forecast category. */
const STAGES = [
  ["Qualification", 10, "open", "pipeline"],
  ["Needs Analysis", 20, "open", "pipeline"],
  ["Value Proposition", 40, "open", "pipeline"],
  ["Identify Decision Makers", 60, "open", "pipeline"],
  ["Perception Analysis", 70, "open", "best_case"],
  ["Proposal/Price Quote", 75, "open", "best_case"],
  ["Negotiation/Review", 90, "open", "committed"],
  ["Closed Won", 100, "closed_won", "closed"],
  ["Closed Lost", 0, "closed_lost", "omitted"],
  ["Closed Lost to Competition", 0, "closed_lost", "omitted"],
] as const;

/** OMR is the base currency; AED and INR deals need an entered exchange rate (US-09). */
const CURRENCIES = [["OMR", 3, true], ["AED", 2, false], ["INR", 2, false]] as const;

/**
 * Gives the current org its system metadata. Runs inside withTenant as an admin (metadata writes are admin-only
 * under RLS) and is idempotent, so the seed and tenant onboarding can both call it: rows that exist are left as they are.
 */
export async function provisionOrg(tx: Tx): Promise<void> {
  const [{ orgId }] = (await tx.execute<{ orgId: string }>(`SELECT app.org_id() AS "orgId"`)).rows as [{ orgId: string }];
  await tx
    .insert(schema.modules)
    .values(SYSTEM_MODULES.map((m, i) => ({ id: newId(), orgId, apiName: m.apiName, labelKey: `modules.${m.apiName}`, sortOrder: i + 1 })))
    .onConflictDoNothing({ target: [schema.modules.orgId, schema.modules.apiName] });

  const moduleId = new Map((await tx.select({ id: schema.modules.id, api: schema.modules.apiName }).from(schema.modules)).map((m) => [m.api, m.id]));

  await tx
    .insert(schema.picklists)
    .values(Object.keys(SYSTEM_PICKLISTS).map((apiName) => ({ id: newId(), orgId, apiName })))
    .onConflictDoNothing({ target: [schema.picklists.orgId, schema.picklists.apiName] });
  const picklistId = new Map((await tx.select({ id: schema.picklists.id, api: schema.picklists.apiName }).from(schema.picklists)).map((p) => [p.api, p.id]));
  const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  await tx
    .insert(schema.picklistValues)
    .values(Object.entries(SYSTEM_PICKLISTS).flatMap(([api, values]) =>
      values.map((value, i) => ({ id: newId(), orgId, picklistId: picklistId.get(api)!, value, labelKey: `picklists.${api}.${slug(value)}`, sortOrder: i + 1 }))))
    .onConflictDoNothing({ target: [schema.picklistValues.orgId, schema.picklistValues.picklistId, schema.picklistValues.value] });

  for (const [module, sections] of Object.entries(SYSTEM_FIELDS)) {
    const mid = moduleId.get(module)!;
    await tx
      .insert(schema.fields)
      .values(sections.flatMap((s) => s.fields).map((f) => ({
        id: newId(),
        orgId,
        moduleId: mid,
        apiName: f.api,
        labelKey: `fields.${module}.${f.api}`,
        dataType: f.type,
        isSystem: true,
        columnName: f.col,
        required: Boolean(f.req),
        readOnly: Boolean(f.ro),
        maxLength: f.max ?? null,
        scale: f.type === "currency" ? 3 : null,
        picklistId: f.type === "picklist" ? picklistId.get(f.list ?? f.api)! : null,
        lookupModuleId: f.lookup ? moduleId.get(f.lookup)! : null,
      })))
      .onConflictDoNothing({ target: [schema.fields.orgId, schema.fields.moduleId, schema.fields.apiName] });

    const hasLayout = await tx.select({ id: schema.layouts.id }).from(schema.layouts).where(and(eq(schema.layouts.moduleId, mid), eq(schema.layouts.isDefault, true)));
    if (hasLayout.length > 0) continue;
    const fieldId = new Map((await tx.select({ id: schema.fields.id, api: schema.fields.apiName }).from(schema.fields).where(eq(schema.fields.moduleId, mid))).map((f) => [f.api, f.id]));
    const layoutId = newId();
    await tx.insert(schema.layouts).values({ id: layoutId, orgId, moduleId: mid, name: "Standard", isDefault: true });
    const sectionRows = sections.map((s, i) => ({ id: newId(), orgId, layoutId, labelKey: `sections.${s.label}`, sortOrder: i + 1, columns: s.columns ?? 2 }));
    await tx.insert(schema.layoutSections).values(sectionRows);
    await tx.insert(schema.layoutFields).values(sections.flatMap((s, i) =>
      s.fields.map((f, j) => ({ id: newId(), orgId, sectionId: sectionRows[i]!.id, fieldId: fieldId.get(f.api)!, sortOrder: j + 1 }))));
  }

  // One default pipeline with the reference stages (US-07); the stage editor is Phase 2.
  await tx.insert(schema.pipelines).values({ id: newId(), orgId, name: "Standard", isDefault: true }).onConflictDoNothing();
  const [pipeline] = await tx.select({ id: schema.pipelines.id }).from(schema.pipelines).where(eq(schema.pipelines.isDefault, true));
  await tx
    .insert(schema.stages)
    .values(STAGES.map(([apiValue, probability, recordCategory, forecastCategory], i) => ({
      id: newId(), orgId, pipelineId: pipeline!.id, nameKey: `stages.${slug(apiValue)}`, apiValue, sortOrder: i + 1, probability, recordCategory, forecastCategory,
    })))
    .onConflictDoNothing();
  await tx.insert(schema.currencies).values(CURRENCIES.map(([code, scale, isBase]) => ({ orgId, code, scale, isBase }))).onConflictDoNothing();
  // T6.01: the seller details start as the org's name; the Admin completes them in Settings.
  await tx.execute(sql`INSERT INTO org_settings (org_id, legal_name) SELECT id, name FROM orgs WHERE id = app.org_id() ON CONFLICT DO NOTHING`);
  // T6.02: VAT 5% standard and 0% zero-rated, in force from long ago; later changes are new dated rows.
  await tx.execute(sql`INSERT INTO vat_rates (id, org_id, category, rate, effective_from, created_by)
    VALUES (${newId()}, app.org_id(), 'standard', 5, '2000-01-01', NULLIF(current_setting('app.user_id', true), '')::uuid),
      (${newId()}, app.org_id(), 'zero_rated', 0, '2000-01-01', NULLIF(current_setting('app.user_id', true), '')::uuid)
    ON CONFLICT DO NOTHING`);
}
