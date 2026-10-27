import { newId, schema } from "@crm/db";
import { and, eq } from "drizzle-orm";
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
}
