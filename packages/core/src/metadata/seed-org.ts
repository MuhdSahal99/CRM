import { newId, schema } from "@crm/db";
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
 * under RLS) and is idempotent, so the seed and tenant onboarding can both call it. Later slices add their fields.
 */
export async function provisionOrg(tx: Tx): Promise<void> {
  const [{ orgId }] = (await tx.execute<{ orgId: string }>(`SELECT app.org_id() AS "orgId"`)).rows as [{ orgId: string }];
  await tx
    .insert(schema.modules)
    .values(SYSTEM_MODULES.map((m, i) => ({ id: newId(), orgId, apiName: m.apiName, labelKey: `modules.${m.apiName}`, sortOrder: i + 1 })))
    .onConflictDoNothing({ target: [schema.modules.orgId, schema.modules.apiName] });
}
